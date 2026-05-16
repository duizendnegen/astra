## 1. Fix Frontend Production Build

- [x] 1.1 Remove the unused `LANDING_ANIM_MS` declaration from `frontend/src/main.ts:14` (or wire it up if it was intentional)
- [x] 1.2 Run `npm run build` in `frontend/` and confirm it exits with code 0
- [x] 1.3 Commit: `fix(frontend): remove unused LANDING_ANIM_MS variable`

## 2. Fix Infra HIGH CVEs

- [x] 2.1 Run `npm audit fix` in `infra/` to resolve fast-uri (path traversal, HIGH) and fast-xml-builder (injection, HIGH) via aws-cdk-lib
- [x] 2.2 Run `npm run build` in `infra/` and confirm it still passes
- [x] 2.3 Run `npm audit` and verify no remaining HIGH or CRITICAL vulnerabilities
- [x] 2.4 Commit: `fix(infra): resolve HIGH CVEs via npm audit fix`

## 3. Fix Lambda Type Errors

- [x] 3.1 Add `phase3Cap?: number` and `phase2Cap?: number` as optional fields to the `ModelDefaults` interface in `lambda/src/matcher.ts`
- [x] 3.2 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 3.3 Commit: `fix(lambda): add phase3Cap/phase2Cap to ModelDefaults type`
- [x] 3.4 Switch `lambda/src/skeleton.ts` from `module.exports = { handler }` to `export { handler }` (named ESM export)
- [x] 3.5 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 3.6 Commit: `fix(lambda): convert handler to named ESM export`

## 4. Add Word Input Max-Length Validation

- [x] 4.1 Add a `maxLength` check (100 chars) after the empty-word guard in `lambda/src/skeleton.ts`, returning `400` with `{ "error": "word must be 100 characters or fewer" }`
- [x] 4.2 Add a unit test for the 100-char limit (word of 101 chars → 400, word of 100 chars → proceeds)
- [x] 4.3 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 4.4 Commit: `feat(lambda): add maxLength validation for word input`

## 5. Add API Gateway Throttling

- [x] 5.1 Add throttling to the `HttpStage` default route settings in `infra/lib/infra-stack.ts`: burst 10 req/s, steady 2 req/s
- [x] 5.2 Run `npm run build` in `infra/` and confirm it passes
- [x] 5.3 Run `cdk diff` to verify only throttling settings are changing
- [x] 5.4 Commit: `feat(infra): add API Gateway throttling (10 burst / 2 steady)`

## 6. Add Health Check Endpoint

- [x] 6.1 Add a `GET /health` route handler in `lambda/src/skeleton.ts` that returns `200 { status: "ok" }` without calling any external services
- [x] 6.2 Add the `GET /health` route to the API Gateway HTTP API in `infra/lib/infra-stack.ts`
- [x] 6.3 Add a unit test for the health endpoint in `lambda/src/__tests__/`
- [x] 6.4 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 6.5 Run `npm run build` in `infra/` and confirm it passes
- [x] 6.6 Start the stack with `docker compose up` and verify `GET http://localhost:3001/health` returns `200 { "status": "ok" }` using the Playwright MCP browser
- [x] 6.7 Commit: `feat(lambda,infra): add GET /health endpoint`

## 7. Set Production Log Level to Info

- [x] 7.1 Change `lambda/src/logger.ts` (or wherever the Pino instance is created) to read `process.env.LOG_LEVEL ?? 'info'` as the level instead of hardcoded `'debug'`
- [x] 7.2 Add `LOG_LEVEL=info` to the Lambda environment block in `infra/lib/infra-stack.ts`
- [x] 7.3 Confirm local dev still uses `debug` by setting `LOG_LEVEL=debug` in `.env.local.example`
- [x] 7.4 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 7.5 Commit: `fix(lambda,infra): set production log level to info via LOG_LEVEL env var`

## 8. Add DynamoDB Skeleton Cache TTL

- [x] 8.1 Add a `ttl` attribute to each item written to the DynamoDB skeleton cache in `lambda/src/skeleton.ts` — value: `Math.floor(Date.now() / 1000) + 30 * 24 * 3600`
- [x] 8.2 Enable TTL on the DynamoDB table in `infra/lib/infra-stack.ts` using `timeToLiveAttribute: 'ttl'`
- [x] 8.3 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 8.4 Run `npm run build` in `infra/` and confirm it passes
- [x] 8.5 Commit: `feat(lambda,infra): add 30-day TTL to skeleton cache`

## 9. Add DOMPurify SVG Sanitization

- [x] 9.1 Add `dompurify` and `@types/dompurify` to `frontend/package.json`
- [x] 9.2 Import DOMPurify in `frontend/src/main.ts` and wrap each `innerHTML` assignment site (lines 69, 144, 148, 175, 181) with `DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true } })`
- [x] 9.3 Run `npm run build` in `frontend/` and confirm it passes
- [x] 9.4 Start the stack with `docker compose up` and use the Playwright MCP browser to verify the app renders constellations correctly end-to-end
- [x] 9.5 Commit: `feat(frontend): sanitize SVG innerHTML with DOMPurify`

## 10. Upgrade Pinecone SDK (5.x → 7.x)

- [x] 10.1 Run `npm install @pinecone-database/pinecone@^7` in `lambda/`
- [x] 10.2 Review the Pinecone 6.x and 7.x changelogs for breaking API changes
- [x] 10.3 Fix any call-site changes in `lambda/src/retrieval.ts` (index query, upsert, fetch methods)
- [x] 10.4 Run `npx tsc --noEmit` in `lambda/` and confirm Pinecone DOM type errors are gone
- [x] 10.5 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 10.6 Start the stack with `docker compose up` and use the Playwright MCP browser to verify a constellation search works end-to-end
- [x] 10.7 Commit: `chore(lambda): upgrade @pinecone-database/pinecone 5.x → 7.x`

## 11. Upgrade Vitest (2.x → 4.x)

- [x] 11.1 Run `npm install vitest@^4` in `lambda/` and `frontend/`
- [x] 11.2 Fix the `MockInstance` type issue in `lambda/src/__tests__/l3-parallel.test.ts:125` (parameter order changed in vitest 4.x)
- [x] 11.3 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 11.4 Run `npm test` in `frontend/` and confirm all tests pass
- [x] 11.5 Run `npm run build` in `frontend/` and confirm it passes
- [x] 11.6 Commit: `chore(lambda,frontend): upgrade vitest 2.x → 4.x`

## 12. Upgrade Vite (staged: 4.x → 5.x → 6.x → 8.x)

- [x] 12.1 Run `npm install vite@^5` in `frontend/`, fix any config/plugin deprecation warnings, run `npm run build` in `frontend/`
- [x] 12.2 Use Playwright MCP browser to do a quick visual smoke test of the running frontend
- [x] 12.3 Commit: `chore(frontend): upgrade vite 4.x → 5.x`
- [x] 12.4 Run `npm install vite@^6` in `frontend/`, fix any config/plugin deprecation warnings, run `npm run build` in `frontend/`
- [x] 12.5 Use Playwright MCP browser to do a quick visual smoke test
- [x] 12.6 Commit: `chore(frontend): upgrade vite 5.x → 6.x`
- [x] 12.7 Run `npm install vite@^8` in `frontend/`, fix any config/plugin deprecation warnings, run `npm run build` in `frontend/`
- [x] 12.8 Use Playwright MCP browser to do a final visual regression test of the full constellation flow end-to-end
- [x] 12.9 Commit: `chore(frontend): upgrade vite 6.x → 8.x`
