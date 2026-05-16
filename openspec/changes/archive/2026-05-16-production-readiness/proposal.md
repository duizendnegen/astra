## Why

The codebase has several concrete gaps before it can be considered production-ready: the frontend production build is broken, the infra workspace has two HIGH-severity CVEs fixable with a single command, there is no rate limiting on the public API (one IP can exhaust the ~28/day OpenRouter image generation budget in seconds), and key packages are multiple major versions behind. Addressing these together closes the backlog of known risk before further feature work.

## What Changes

- Remove unused `LANDING_ANIM_MS` variable in `frontend/src/main.ts` (unblocks production builds)
- Run `npm audit fix` in `infra/` to resolve 2 HIGH CVEs (fast-uri path traversal, fast-xml-builder injection)
- Add `phase3Cap` and `phase2Cap` as optional fields to `ModelDefaults` in `lambda/src/matcher.ts` (closes type gap exposed by tsc)
- Switch `lambda/src/skeleton.ts` `handler` export from CJS `module.exports` to named ESM `export`
- Add API Gateway throttling to CDK stack: burst 10 req/s, steady 2 req/s
- Add `maxLength: 100` validation to word input in `lambda/src/skeleton.ts`
- Add DOMPurify to `frontend/` and sanitize all SVG `innerHTML` injection sites
- Add DynamoDB TTL attribute (30 days) to skeleton cache table
- Add `GET /health` endpoint returning `{ status: "ok" }` with no external dependency calls
- Set Pino production log level to `info` via `LOG_LEVEL` environment variable
- Upgrade `@pinecone-database/pinecone` from 5.1.2 → 7.x (eliminates 8 tsc type errors from DOM types in SDK)
- Upgrade `vitest` from 2.1.9 → 4.x in both `lambda/` and `frontend/` (fixes esbuild SSRF CVE, aligns MockInstance API)
- Upgrade `vite` in `frontend/` from 4.x → 5.x → 6.x → 8.x in three staged commits
- Leave `potrace` as-is (current at 2.1.8; CVEs are in transitive jimp deps with no upstream fix; package works correctly)
- Ignore missing `.js` extensions in imports (targeting Node 22+, tsx handles resolution at runtime; not a runtime issue)

## Capabilities

### New Capabilities

- `api-rate-limiting`: API Gateway throttling with defined burst/steady limits and 429 error response behaviour
- `input-validation`: Enforced maximum word length (100 chars) with structured 400 error response
- `health-endpoint`: `GET /health` endpoint returning `{ status: "ok" }` for deployment verification

### Modified Capabilities

*(none — no existing spec-level requirements are changing)*

## Impact

- **`lambda/src/skeleton.ts`**: export style change, maxLength validation, log level, health route handling
- **`lambda/src/matcher.ts`**: type fix (ModelDefaults)
- **`frontend/src/main.ts`**: remove unused variable, add DOMPurify sanitization
- **`infra/lib/infra-stack.ts`**: API Gateway throttling, DynamoDB TTL, LOG_LEVEL env var, health route
- **`infra/package-lock.json`**: npm audit fix (no source changes)
- **`lambda/package.json`**: Pinecone 7.x, vitest 4.x
- **`frontend/package.json`**: vitest 4.x, vite 5/6/8 (staged)
- **External**: no API behaviour changes visible to existing callers except new 429 throttle responses and new `/health` route
