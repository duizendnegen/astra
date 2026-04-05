## 1. Structured Logging Infrastructure

- [x] 1.1 Add `pino` to `lambda/package.json` dependencies and `pino-pretty` to devDependencies
- [x] 1.2 Create `lambda/src/logger.ts` with Pino root logger, `NODE_ENV`-aware transport, and `createLogger(module)` helper

## 2. Move Matcher to Backend

- [x] 2.1 Copy `frontend/src/matcher.ts` to `lambda/src/matcher.ts`
- [x] 2.2 Update `test-harness/run.ts` import paths from `../frontend/src/matcher.ts` to `../lambda/src/matcher.ts`
- [x] 2.3 Delete `frontend/src/matcher.ts`

## 3. Server-Side Catalogue Loading

- [x] 3.1 Create `lambda/src/catalogue.ts` that loads `stars.json` synchronously at module level and exports `getCatalogue(): Star[]`
- [x] 3.2 Add startup error handling: log fatal + `process.exit(1)` if file not found

## 4. New /api/constellation Endpoint

- [x] 4.1 Update `lambda/src/local.ts`: rename route from `/api/skeleton` to `/api/constellation`
- [x] 4.2 Parse `excludeSeeds` from request body and pass to matcher
- [x] 4.3 Run matcher after retrieval pipeline; include `constellation`, `skeleton`, and `match` in response
- [x] 4.4 Update cache key logic: skip cache when `excludeSeeds` is non-empty

## 5. Replace console.log with Pino Loggers

- [x] 5.1 Replace all `console.log` / `console.warn` / `console.error` in `lambda/src/local.ts` with Pino child logger; add `durationMs` to request log
- [x] 5.2 Replace all `console.log` in `lambda/src/retrieval.ts` with Pino child logger; add `durationMs` per layer (L1, L3, L4, L5)
- [x] 5.3 Replace all `console.log` in `lambda/src/core.ts` with Pino child logger
- [x] 5.4 Add `durationMs` logging to matcher phases (prescreen, greedy, Hungarian) in `lambda/src/matcher.ts`

## 6. Simplify Frontend

- [x] 6.1 Update `frontend/src/main.ts`: replace `/api/skeleton` fetch with `/api/constellation`; use `constellation` from response directly; remove `match()` call
- [x] 6.2 Remove catalogue import and `loadCatalogue()` / `getCatalogue()` calls from `frontend/src/main.ts`
- [x] 6.3 Remove star-loading functions (`loadCatalogue`, `getCatalogue`) from `frontend/src/catalogue.ts`; keep `loadConstellationLines`

## 8. Restore Background Starfield

- [x] 8.1 Re-add `loadCatalogue()` to `frontend/src/catalogue.ts` (fetches `stars.json` for rendering only, not for matching)
- [x] 8.2 In `frontend/src/main.ts`: load catalogue in `boot()` and pass to `init(canvas, catalogue)`
- [x] 8.3 Restore `init(canvasEl, catalogue)` signature in `frontend/src/renderer.ts`

## 7. Skeleton Overlay (Optional)

- [x] 7.1 Pass `skeleton` field from API response through to renderer state
- [x] 7.2 In `frontend/src/renderer.ts`: render skeleton overlay when `render_mode=skeleton` query param is set, using API-provided normalised coordinates
