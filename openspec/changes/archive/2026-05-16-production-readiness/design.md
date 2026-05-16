## Context

Astra is a single-endpoint public Lambda API (`POST /api/constellation`) fronted by CloudFront + API Gateway, with a static frontend. The codebase spans three independent npm workspaces: `lambda/`, `frontend/`, and `infra/`. A production readiness audit revealed: frontend production builds are broken, infra has HIGH-severity CVEs fixable with no source changes, the API has no rate limiting, and several packages are multiple major versions behind. All fixes are independent and sequenced from lowest-risk to highest-risk.

## Goals / Non-Goals

**Goals:**
- Unblock and verify all three workspace builds cleanly
- Eliminate HIGH-severity CVEs in infra toolchain
- Add API Gateway throttling to protect OpenRouter budget
- Harden input validation and SVG rendering against abuse
- Upgrade packages where version gap causes active type errors or CVEs
- Add operational observability (health endpoint, correct log level)

**Non-Goals:**
- Replacing `potrace` (unfixable transitive CVEs, works correctly, deferred)
- Adding `.js` extensions to imports (targeting Node 22+, tsx handles resolution)
- Per-IP rate limiting (API GW stage throttling is sufficient for current scale)
- Adding error tracking service (Sentry/DataDog) — separate concern

## Decisions

### D1 — Sequencing: one atomic commit per fix

Each fix is committed independently: fix → `npm test` → `docker compose build` → commit. This keeps the git history bisectable and each change reviewable in isolation. Package upgrades with Playwright regression tests are grouped with their workspace's test run.

### D2 — Rate limiting: API Gateway stage throttling only

API Gateway stage-level throttling (burst 10 req/s, steady 2 req/s) applies before Lambda invocation — it costs nothing, requires no Lambda code changes, and protects the OpenRouter spend. Per-IP WAF rules add cost and complexity not justified for current traffic. A 429 response is returned automatically by API Gateway; no Lambda error handler needed.

CDK change: set `throttling` on the `HttpStage` default route settings in `infra/lib/infra-stack.ts`.

### D3 — Health endpoint: Lambda route, not API Gateway mock

A `GET /health` route is handled inside the Lambda (matching on `requestContext.http.method === 'GET'` and path `/health`), returning `{ status: "ok" }` with no external calls. This approach: (a) is free, (b) proves Lambda is alive end-to-end (not just API GW), and (c) requires only a CDK route addition alongside the existing `POST /api/constellation` integration.

### D4 — Pinecone upgrade: 5.x → 7.x with call-site audit

Pinecone 5.x's generated SDK uses browser DOM types (`RequestCredentials`, `WindowOrWorkerGlobalScope`) incompatible with `"lib": ["ES2022"]` on TypeScript 6. Upgrading to 7.x likely uses `node-fetch` or native fetch types. After upgrading: re-run `tsc --noEmit` and fix any call-site API changes. The Pinecone client instantiation and query API are stable across minor versions; breaking changes across 2 major versions may affect index management calls not used in this codebase.

Alternative considered: add `"skipLibCheck": true` — initially rejected because it hides real errors across all packages. **Outcome**: Pinecone 7.x still ships DOM types (`RequestCredentials`, `WindowOrWorkerGlobalScope`) in its generated `assistant_*` sub-packages (`assistant_control`, `assistant_data`, `assistant_evaluation`), none of which are used by this codebase. The root cause was not resolved by the upgrade. `skipLibCheck: true` was added to `lambda/tsconfig.json` as the pragmatic fix — it suppresses type errors in `node_modules` only and does not affect type-checking of our own source files.

### D5 — Vitest upgrade: 2.x → 4.x (both workspaces together)

Vitest 4.x changes `MockInstance` generic parameter order. The lambda already has a failing test (`l3-parallel.test.ts:125`) due to this. Upgrading lambda and frontend together avoids a state where one workspace works and the other doesn't. After upgrade: fix MockInstance call sites and re-run all tests.

### D6 — Vite upgrade: staged 4.x → 5.x → 6.x → 8.x

Vite has significant config changes between each major version. Staging at each major version lets us catch regressions (config key renames, plugin API changes) incrementally. Each stage: `npm install vite@<next>`, fix any deprecation warnings, run `npm run build`, commit.

### D7 — DOMPurify for SVG sanitization

`dompurify` is added to `frontend/` as a production dependency. Each SVG `innerHTML` assignment site in `main.ts` (lines 69, 144, 148, 175, 181) is wrapped: `element.innerHTML = DOMPurify.sanitize(svgContent, { USE_PROFILES: { svg: true, svgFilters: true } })`. This preserves SVG structure and animations while stripping script injection.

### D8 — DynamoDB TTL: attribute-based, 30 days

DynamoDB TTL requires a numeric attribute (Unix epoch seconds) on each item. Add a `ttl` field to the skeleton cache write path in `lambda/src/skeleton.ts` (set to `now + 30 * 24 * 3600`). Enable TTL on the table in CDK with `timeToLiveAttribute: 'ttl'`. DynamoDB deletes expired items within 48 hours of expiry (eventual deletion, not exact).

### D9 — Log level: environment variable `LOG_LEVEL`

The Pino logger currently hardcodes level to `debug`. Change to read `process.env.LOG_LEVEL ?? 'info'`. Set `LOG_LEVEL=info` in the Lambda CDK environment block for production. Local dev `.env.local` can set `LOG_LEVEL=debug` to restore current behaviour.

## Risks / Trade-offs

- **Pinecone 7.x breaking changes** → Run tsc and all tests after upgrade; review Pinecone CHANGELOG for removed methods. The codebase only uses `index.query()` and `index.upsert()` which are stable.
- **Vitest 4.x MockInstance API change** → At least one known failure already (`l3-parallel.test.ts:125`); fix is mechanical (parameter order change). Risk is contained to test files only.
- **API Gateway 429 not currently handled in frontend** → Client will receive an unhandled error if throttled. Acceptable for now; frontend error handling is out of scope.
- **DynamoDB TTL deletion lag (up to 48h)** → Stale items may be served for up to 48h after TTL expiry. This is DynamoDB's documented behaviour and acceptable for a 30-day TTL.
- **Vite staged upgrades** → Each stage may expose peer dependency warnings from other packages (e.g., vitest peer). Address warnings before moving to the next stage.

## Migration Plan

1. All changes are backward-compatible at the API level (no client-side breaking changes).
2. API Gateway throttling: `cdk deploy` applies instantly; existing in-flight requests are unaffected.
3. DynamoDB TTL: enabling TTL on an existing table with no `ttl` attribute is safe — items without the attribute are never expired. New writes start carrying the TTL; old items expire naturally if the attribute is added retroactively (not required).
4. Rollback: any CDK change can be reverted with `cdk deploy` of the previous stack revision. Package changes can be reverted by restoring `package-lock.json` and re-running `npm ci`.
