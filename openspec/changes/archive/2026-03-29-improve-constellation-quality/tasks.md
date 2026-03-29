## 1. Types

- [x] 1.1 Add `constellationStars: Star[]` field to `MatchResult` in `types.ts`
- [x] 1.2 Add optional `variantIndex?: number` field to `MatchResult` in `types.ts`

## 2. Matcher — y-flip and constellation star selection

- [x] 2.1 Negate skeleton y-coordinates (`[x, y] → [x, -y]`) before rotation in `scoreAndMatch()`
- [x] 2.2 Implement `selectConstellationStars(skelPoints, edges, degrees, matchedStars): Star[]` — iterate vertices in degree-1-first order, score candidates by `d_eff + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)`, enforce uniqueness, cap at `MAX_CONSTELLATION_STARS`
- [x] 2.3 Add constants `BRIGHTNESS_WEIGHT = 0.3`, `MAX_MAG = 6.0`, `MAX_CONSTELLATION_STARS = 8` to `matcher.ts`
- [x] 2.4 Call `selectConstellationStars` inside `scoreAndMatch()` and include result in `ScoreResult`
- [x] 2.5 Update `match()` signature to accept `skeletons: Skeleton[]`; loop over skeletons, run full seed sweep per skeleton, return best-scoring `MatchResult` across all variants
- [x] 2.6 Log winning variant index: `[matcher] variant N won with X% score`
- [x] 2.7 Populate `constellationStars` and `variantIndex` on the returned `MatchResult`

## 3. Renderer — three-tier star rendering

- [x] 3.1 Update `drawStars()` to use a Set of `constellationStars` IDs (already excluded from background) and a Set of on-pattern `stars` IDs (rendered slightly brighter than background but dimmer than constellation stars)
- [x] 3.2 Update `drawConstellation()` to draw lines between `constellationStars` pairs (using skeleton edge list as index into `constellationStars`) rather than the full `stars` array
- [x] 3.3 Draw on-pattern context stars (`stars` minus `constellationStars`) at intermediate brightness — visibly above background, below constellation tier

## 4. Frontend — skeleton array plumbing

- [x] 4.1 Update `main.ts` to expect `{ skeletons: Skeleton[] }` from `/api/skeleton` response
- [x] 4.2 Pass `skeletons` array to `match()` instead of a single skeleton

## 5. Lambda — multi-variant skeleton generation

- [x] 5.1 Add `DESCRIBE_MULTI_PROMPT(word)` to `core.ts` — returns JSON array of 3 iconic descriptions, with explicit guidance to use illustrator/emoji-designer perspective and avoid overhead/floor-plan views
- [x] 5.2 Update `callLlm()` (or add `callLlmMulti()`) to parse the 3-description JSON array response
- [x] 5.3 Run 3 `DRAW` calls in parallel via `Promise.all`; filter results with `isValidSkeleton()`; fall back to `[TRIANGLE_FALLBACK]` if none are valid
- [x] 5.4 Update `generateSkeleton()` to return `Skeleton[]` using the new multi-variant pipeline; keep single retry on full failure
- [x] 5.5 Update `skeleton.ts` handler to return `{ skeletons: Skeleton[] }` in response body
- [x] 5.6 Update DynamoDB cache read/write to store and retrieve `{ skeletons: Skeleton[] }`

## 6. Tests

- [x] 6.1 Add unit tests for `selectConstellationStars` — endpoint-first ordering, uniqueness, cap at 8, brightness preference
- [x] 6.2 Add unit test for y-flip — skeleton with head at y=0 maps to higher Dec than feet at y=1
- [x] 6.3 Add unit test for multi-skeleton `match()` — returns best-scoring variant, logs correct variant index
- [x] 6.4 Add unit tests for `DESCRIBE_MULTI_PROMPT` output shape — returns valid JSON array of 3 strings (integration/snapshot)
