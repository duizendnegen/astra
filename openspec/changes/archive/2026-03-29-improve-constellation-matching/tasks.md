## 1. Geometry Utilities

- [x] 1.1 Implement `pointToSegmentDist(point, segA, segB): number` — minimum distance from a 2D point to a line segment in normalised space
- [x] 1.2 Implement `vertexDegrees(edges, pointCount): number[]` — compute degree (edge count) for each skeleton vertex
- [x] 1.3 Implement `effectiveDist(star, skelNorm, edges, degrees): number` — combine point-to-segment min distance with endpoint-weighted Gaussian vertex bonus
- [x] 1.4 Implement `maxPairwiseAngularDist(stars): number` — maximum haversine distance between any two stars in a result set

## 2. Matching Algorithm

- [x] 2.1 Remove `hungarian()` function and all references from `matcher.ts`
- [x] 2.2 Remove `randomPatchCentre()` and `starsInPatch()` patch-sampling logic
- [x] 2.3 Add constants: `SEED_MAX_MAG = 3`, `PATCH_RADIUS_DEG = 30`, `VERTEX_BONUS_ENDPOINT = 0.6`, `VERTEX_BONUS_JOINT = 0.1`, `VERTEX_SIGMA = 0.08`, `ORION_SPAN_DEG = 25`; remove `MAX_ATTEMPTS`, `CANDIDATE_COUNT`
- [x] 2.4 Implement `scoreAndMatch(skelPoints, edges, candidates, rotDeg): { score, stars }` — rotate+normalise skeleton, compute effective distance per candidate star, return score and matched star set
- [x] 2.5 Implement outer sweep in `match()`: iterate seeds (catalogue stars at mag ≤ `SEED_MAX_MAG`, brightest first), gather neighbours within `PATCH_RADIUS_DEG`, call `scoreAndMatch` across all rotation steps, track global best
- [x] 2.6 Add early-exit when a seed produces score ≥ `COVERAGE_THRESHOLD` and matched count ≥ `MIN_MATCHED_STARS`
- [x] 2.7 Log constellation size after match: `[matcher] pattern size: X.X° (Y% of Orion)` using `maxPairwiseAngularDist`
- [x] 2.8 Update `match()` return value — `MatchResult.stars` is now all on-pattern stars ordered by effective distance, not skeleton-indexed

## 3. Types & Renderer Compatibility

- [x] 3.1 Review `MatchResult` in `types.ts` — update JSDoc comment on `stars` field to reflect new semantics (on-pattern set, not skeleton-indexed)
- [x] 3.2 Audit `renderer.ts` — confirm star rendering loop does not assume `stars[i]` corresponds to skeleton `points[i]`; fix any indexed access

## 4. Tests

- [x] 4.1 Remove Hungarian algorithm tests from `matcher.test.ts`
- [x] 4.2 Add unit tests for `pointToSegmentDist` — star on segment interior, star past endpoint, star at vertex
- [x] 4.3 Add unit tests for `effectiveDist` — endpoint vertex receives larger bonus than joint vertex at equal geometric distance
- [x] 4.4 Add unit tests for `scoreAndMatch` — known star+skeleton arrangement produces expected score and matched set
- [x] 4.5 Add unit test for `maxPairwiseAngularDist` — known star pair produces correct angular separation
