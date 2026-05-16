## 1. Core Implementation

- [x] 1.1 Add `PHASE3_MIN_SEP_DEG = 30` module-level constant in `matcher.ts` alongside `DIVERSITY_MIN_DEG`
- [x] 1.2 Replace `greedyTop.slice(0, HUNGARIAN_K)` in `runPhase2And3` with the greedy spatial-spread loop: iterate Phase 2 output in score order, compute centroid per candidate, accept if ≥`PHASE3_MIN_SEP_DEG` from all already-accepted centroids, fall back to closest remaining when pool is undersized

## 2. Tests

- [x] 2.1 Add unit test: Phase 3 pool contains candidates from two different sky regions when Phase 2 input spans ≥30°
- [x] 2.2 Add unit test: fallback fills pool to `HUNGARIAN_K` when Phase 2 input is geographically thin (all candidates within 30° of each other)
- [x] 2.3 Add unit test: top-scoring Phase 2 candidate is always the first entry in Phase 3 pool
- [x] 2.4 Run full test suite (`npm test` in `lambda/`) and confirm all existing matcher-pipeline tests pass

## 3. Visual Validation

- [x] 3.1 Open the app in Playwright, enter a word that reliably lands in the Sirius region (e.g. "dog"), and confirm the placement is no longer always in the Orion/CMa area across multiple requests
- [x] 3.2 Run the test harness and confirm no regression in overall pass rate

