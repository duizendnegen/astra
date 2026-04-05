## Why

The matcher currently runs in the browser. This means the full 5068-star catalogue is downloaded
as a static asset on every page load, and the matching computation (~87ms) blocks the main thread.
The test harness imports `matcher.ts` directly from `frontend/src/`, coupling it to the frontend
package.

Moving the matcher to the backend gives one canonical implementation shared by both the frontend
and the test harness, removes the catalogue download from the browser, and opens the door to
heavier computation (e.g. Procrustes ICP) that would be impractical in the browser.

The backend response also gains a `skeleton` field — the ideal skeleton positions in sky
coordinates — so the frontend can render it as an overlay without needing to recompute it.

## What Changes

- **Structured logging via Pino.** All ad-hoc `console.log('[module] ...')` calls across
  `lambda/src/` are replaced with a shared Pino logger. A root logger is created in
  `lambda/src/logger.ts`; each module binds a child logger with a `module` field. Every
  significant operation emits a structured log entry with a `durationMs` field so timing is
  always visible without manual instrumentation. `pino-pretty` is used in local dev for
  human-readable output; raw JSON in production for CloudWatch. Key timed operations:
  - Per request: total `/api/constellation` handler time
  - Retrieval pipeline: each layer (L1 embedding lookup, L3 LLM concept map, L4 LLM SVG, L5 SVG→skeleton)
  - Matcher: prescreen phase, greedy phase, Hungarian phase, per-skeleton total

- **`matcher.ts` moves to `lambda/src/`.** The frontend's `frontend/src/matcher.ts` is deleted.
  The test harness updates its import from `'../frontend/src/matcher.ts'` to
  `'../lambda/src/matcher.ts'`.
- **Star catalogue loaded server-side.** The catalogue binary is loaded once at lambda startup
  (from `data/` in local dev, bundled asset in AWS Lambda). The frontend no longer fetches or
  holds the catalogue.
- **`/api/skeleton` becomes `/api/constellation`.** A single POST endpoint accepts
  `{ word, excludeSeeds?: number[] }` and returns:
  ```json
  {
    "constellation": {
      "constellationStars": [...],
      "edges": [...],
      "patchRA": 83.8,
      "patchDec": -5.4,
      "shapeScore": 0.91,
      "vertexFitScore": 0.87
    },
    "skeleton": {
      "points": [...],
      "edges": [...]
    },
    "match": { "source": "phosphor", ... }
  }
  ```
  The `skeleton` field is the raw skeleton in normalised coordinates (for optional overlay
  rendering). `excludeSeeds` is a client-maintained list of anchor star IDs already used in
  this session, preventing the same placement from repeating across words.
- **Frontend simplified.** `main.ts` calls one endpoint, receives a ready-to-render result.
  No catalogue loading, no matcher import, no `match()` call.
- **`local.ts` updated** to serve `/api/constellation` instead of `/api/skeleton`, loading the
  catalogue at startup from `data/`.

## Root Causes

### RC-1: Matcher is frontend-only

The test harness imports matcher directly from `frontend/src/`, meaning any change to the matcher
must be compatible with the frontend build system. Moving to `lambda/src/` makes it a proper
shared module with its own compilation.

### RC-2: Catalogue download is wasteful

The browser downloads ~200KB of star data on every page load to support client-side matching.
Once matching moves to the backend this is unnecessary.

### RC-4: No structured logging or timing visibility

All current logging is ad-hoc `console.log` strings with manually typed `[module]` prefixes.
There is no consistent structure, no timing data, and no way to query or filter logs. Adding Pino
at the same time as the backend rewrite is natural — all the relevant files are being touched
anyway.

### RC-3: Heavy computation blocks the main thread

The pairwise anchor search iterates over ~280K placements. Even at 87ms this is a noticeable
delay and will grow with new generators (Procrustes, ICP). Running on the backend offloads this
entirely.

## Not In Scope

- Session state management server-side (excludeSeeds remains a client-sent list, not server state)
- Caching constellation results per word (natural follow-on once the endpoint is stable)
- AWS Lambda deployment changes — local dev server updated; Lambda handler updated in a follow-on

## Capabilities

### New Capabilities

- `constellation-api`: single `/api/constellation` endpoint returns both skeleton and matched
  constellation with evaluation scores
- `structured-logging`: Pino-based logging with per-operation `durationMs` across all backend
  modules

### Modified Capabilities

- `star-matching`: moves from browser to backend; test harness imports from `lambda/src/`
- `constellation-rendering`: frontend receives `skeleton` field for optional overlay without
  recomputing

### Removed Capabilities

- Client-side catalogue loading (`loadCatalogue()` in `frontend/src/catalogue.ts`)
- Client-side `match()` call in `frontend/src/main.ts`

## Impact

- `lambda/package.json` — add `pino` dependency, `pino-pretty` dev dependency
- `lambda/src/logger.ts` — new file: root Pino instance, `NODE_ENV`-aware transport
  (pretty in dev, JSON in production), exported `createLogger(module)` helper
- `lambda/src/matcher.ts` — new file (moved from `frontend/src/matcher.ts`)
- `lambda/src/catalogue.ts` — new file: load catalogue binary from disk at startup
- `lambda/src/local.ts` — updated: serve `/api/constellation`, load catalogue + run matcher,
  all console.log replaced with Pino child logger
- `frontend/src/matcher.ts` — deleted
- `frontend/src/catalogue.ts` — deleted (or reduced to constellation-lines only)
- `frontend/src/main.ts` — single fetch to `/api/constellation`, no `match()` call
- `lambda/src/retrieval.ts` — all console.log replaced with Pino child logger + durationMs on
  each layer
- `lambda/src/core.ts` — all console.log replaced with Pino child logger
- `test-harness/run.ts` — import path updated to `'../lambda/src/matcher.ts'`
