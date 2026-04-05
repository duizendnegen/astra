## Context

The matcher currently lives in `frontend/src/matcher.ts` and runs entirely in the browser. The
frontend fetches `stars.json` (~200KB, 5068 stars) on every page load, then calls `match()` after
receiving skeletons from `/api/skeleton`. The test harness imports `matcher.ts` directly from
`frontend/src/`, coupling test runs to the frontend build system.

The retrieval pipeline returns `skeletons[]` which the frontend passes into `match()`, which
returns a `MatchResult` with `constellationStars`, `edges`, patch coordinates and scores.

The local dev server (`lambda/src/local.ts`) serves `/api/skeleton` and currently knows nothing
about matching — it only drives the retrieval pipeline.

## Goals / Non-Goals

**Goals:**
- Move `matcher.ts` to `lambda/src/` so there is one canonical implementation
- Load the star catalogue server-side (once at startup); frontend no longer fetches `stars.json`
- Consolidate retrieval + matching into a single `/api/constellation` endpoint that returns a
  complete, render-ready result including `skeleton` (normalised coordinates) and `constellation`
- Add structured logging (Pino) across all `lambda/src/` modules, replacing ad-hoc `console.log`
- Update test harness import path from `frontend/src/matcher.ts` → `lambda/src/matcher.ts`

**Non-Goals:**
- Server-side session state — `excludeSeeds` stays a client-sent list
- Caching constellation results per word (follow-on once endpoint is stable)
- AWS Lambda deployment changes (local dev server updated here; Lambda handler in a follow-on)
- Changing the matcher algorithm itself

## Decisions

### D1: Single `/api/constellation` endpoint (not separate `/api/skeleton` + `/api/match`)

The frontend has no use for raw skeletons once matching moves to the backend. A single endpoint
returning the complete result (`constellation`, `skeleton`, `match`) eliminates one round-trip and
removes the need for the frontend to hold catalogue state.

**Alternative considered:** keep `/api/skeleton` and add `/api/match` separately. Rejected because
it would require the frontend to call two endpoints sequentially, complicating error handling, and
still doesn't remove the catalogue from the browser (the frontend would need it for the `/api/match`
step or the backend would need it just for that second endpoint).

### D2: Load star catalogue at lambda startup from disk (not bundled JSON)

The catalogue is already on disk as `data/stars.json`. Loading it once at startup (via `fs.readFileSync`
+ `JSON.parse`) keeps startup fast and avoids duplicating a 200KB file in the lambda bundle. In local
dev the path resolves relative to the working directory (`../data/stars.json`); in AWS Lambda it will
be a bundled asset path (addressed in the follow-on deployment change).

**Alternative considered:** load catalogue from a SQLite table. Rejected as over-engineering — the
catalogue is static, never changes per-request, and the current JSON format works fine with the
matcher's `Star[]` type.

### D3: `matcher.ts` moves as-is; no rewrite for the move

The file is pure TypeScript with no browser APIs and no Vite-specific imports. It can be copied
directly to `lambda/src/matcher.ts` and will compile with the lambda's `tsconfig`. The only change
needed is removing the `frontend/src/` import in the test harness.

**Alternative considered:** refactor the matcher signature during the move. Rejected — changes to the
algorithm are a separate concern and mixing them here makes the diff harder to review.

### D4: Pino with `NODE_ENV`-aware transport (pretty in dev, JSON in production)

Pino is the standard structured logger for Node.js backends; it's fast enough that it won't affect
per-request timing measurements. A root logger is created in `lambda/src/logger.ts` with a
`createLogger(module)` helper that returns a child logger with a fixed `module` field. All modules
bind their own child logger at the top of the file.

**Alternative considered:** `winston`. Rejected — heavier, more configuration, no meaningful
advantage for this use case.

### D5: `excludeSeeds` sent by the client, not stored server-side

The frontend already maintains `usedPatches` as a `Set<number>` in component state. Promoting this
to server-side state would require sessions or a per-client token, adding complexity and state
management. The existing client-send model is simple and correct for the current UX.

## Risks / Trade-offs

- **Lambda cold-start overhead**: loading `stars.json` (~200KB, 5068 stars) at startup adds a small
  one-time cost. Acceptable — this is the same data that was previously fetched on every page load.
  → Mitigation: load synchronously at module level so it only happens once per Lambda instance.

- **Test harness breakage during transition**: between deleting `frontend/src/matcher.ts` and
  updating the test harness import, the harness will not compile.
  → Mitigation: update import path in the same commit that moves the file.

- **`frontend/src/catalogue.ts` partial deletion**: `loadConstellationLines` is still needed by
  the renderer; only `loadCatalogue` / `getCatalogue` / `stars.json` fetch are removed.
  → Mitigation: keep `catalogue.ts` but strip the star-loading functions; rename if needed for
  clarity.

- **Cache invalidation in `local.ts`**: the existing in-memory cache keys on `word` only. Once
  `excludeSeeds` is part of the request the cache must also key on the seed list, or caching must
  be disabled for seeded requests.
  → Decision: cache only when `excludeSeeds` is empty (or absent); skip cache otherwise.

## Migration Plan

1. Add `pino` + `pino-pretty` to `lambda/package.json`; create `lambda/src/logger.ts`
2. Move `frontend/src/matcher.ts` → `lambda/src/matcher.ts`; update test harness imports
3. Create `lambda/src/catalogue.ts` (loads `stars.json` at startup, exports `getCatalogue()`)
4. Update `lambda/src/local.ts`: rename endpoint to `/api/constellation`, run matcher after
   retrieval, include `skeleton` in response, update cache key to exclude seeded requests
5. Replace all `console.log` in `lambda/src/` (local.ts, retrieval.ts, core.ts) with Pino child
   loggers
6. Simplify `frontend/src/main.ts`: single fetch to `/api/constellation`, remove `match()` call,
   remove catalogue import
7. Delete `frontend/src/catalogue.ts` star-loading functions (keep `loadConstellationLines`)
8. Delete `frontend/src/matcher.ts`

Rollback: all changes are local; reverting the git commits restores the previous state. No
infrastructure changes are involved.

## Open Questions

- Should `lambda/src/catalogue.ts` also load `constellation-lines.json`, or leave that fetch in
  the frontend? (Likely leave it in the frontend — the lines data is only used for rendering, not
  matching.)
- Should the response include the raw `skeletons[]` array for debugging, or only `constellation`
  + `skeleton` + `match`? (Proposal says the latter; confirm before implementing.)
