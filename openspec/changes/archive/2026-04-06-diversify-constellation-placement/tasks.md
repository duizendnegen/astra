## 1. Modify `runPhase2And3` to return all candidates

- [x] 1.1 Change the return type of `runPhase2And3` from `(ScoreResult & { seed: Star }) | null` to `(ScoreResult & { seed: Star })[]`
- [x] 1.2 Replace the `bestResult` tracking variable with a `results: (ScoreResult & { seed: Star })[]` array that collects all Phase 3 candidates
- [x] 1.3 Sort the array descending by `selectionScore` before returning
- [x] 1.4 Return `[]` in place of `null` for empty cases

## 2. Add diversity selection to `match()`

- [x] 2.1 Add named constants `DIVERSITY_TOLERANCE = 0.10` and `DIVERSITY_MIN_DEG = 30` at module scope
- [x] 2.2 Update the per-skeleton loop in `match()` to collect all candidate arrays (from `runPhase2And3`) into a single merged pool
- [x] 2.3 After the loop, compute `patchRA`/`patchDec` for every candidate (arithmetic mean of `skeletonRaDec`)
- [x] 2.4 Identify `topResult` (highest score in pool) and compute `acceptable` (score within `DIVERSITY_TOLERANCE` of top)
- [x] 2.5 Compute `distant` (acceptable candidates with `distanceDeg` from `topResult` position ≥ `DIVERSITY_MIN_DEG`)
- [x] 2.6 Select: random element from `distant` if non-empty, otherwise `topResult`
- [x] 2.7 Update the existing `excludeSeeds` and span-check logic to use the selected candidate (not `globalBest`)

## 3. Tests

- [x] 3.1 Add a unit test asserting `runPhase2And3` returns multiple results when multiple Phase 3 candidates are evaluated
- [x] 3.2 Add a unit test for diversity selection: acceptable + distant candidate is preferred over top
- [x] 3.3 Add a unit test for fallback: when no distant candidate exists, top result is returned
- [x] 3.4 Add a unit test for tolerance boundary: candidate at exactly 10% below top score is acceptable; at 10.1% it is not

## 4. Verify & validate

- [x] 4.1 Restart Docker Compose and run the test harness
- [x] 4.2 Inspect harness thumbnails for geographic spread — confirm constellations appear in varied sky regions across multiple words
