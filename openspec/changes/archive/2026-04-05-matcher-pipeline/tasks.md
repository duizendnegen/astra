## 1. Extend Types

- [x] 1.1 Add `generator: 'anchor-pair' | 'single-sweep' | 'any-vertex'` and `scorer: 'edge-ratio' | 'vertex-fit' | 'procrustes'` to `MatcherConfig` in `lambda/src/matcher.ts`
- [x] 1.2 Remove `maxConstellationStars` and `minMatchedStars` from `MatcherConfig` and `ModelDefaults`
- [x] 1.3 Add `shapeScore: number`, `vertexFitScore: number`, and `procrustesScore?: number` to `MatchResult` in `lambda/src/types.ts`

## 2. Remove Hard Caps

- [x] 2.1 Remove all internal uses of `maxConstellationStars` in `lambda/src/matcher.ts` (Phase 3 candidate pool and cost matrix construction)
- [x] 2.2 Remove all internal uses of `minMatchedStars` in `lambda/src/matcher.ts`
- [x] 2.3 Remove `maxConstellationStars` and `minMatchedStars` CLI flag parsing from `test-harness/run.ts` (`NUMERIC_OVERRIDES` array)

## 3. Implement Scorers

- [x] 3.1 Implement `vertexFitScore` computation: after Phase 3 Hungarian assignment, compute `mean_i(distanceDeg(star_i, vertex_i_physical) / span)` and set `score = 1 / (1 + loss)`; add to all match result paths
- [x] 3.2 Ensure `shapeScore` (existing edge-ratio score) is explicitly set on `MatchResult`
- [x] 3.3 Implement `procrustesScore` computation: Procrustes optimal rigid alignment (rotation + scale + translation) between assigned star positions and skeleton vertices, then `1 / (1 + meanResidualDeg / span)`; mark ICP as `TODO(procrustes-icp)`
- [x] 3.4 Add scorer dispatch in Phase 3 candidate selection: use `shapeScore` when `scorer === 'edge-ratio'`, `vertexFitScore` when `scorer === 'vertex-fit'`, `procrustesScore` when `scorer === 'procrustes'`

## 4. Implement single-sweep Generator

- [x] 4.1 Implement `single-sweep` generator: enumerate all catalogue stars as seeds × `rotationSteps` rotations × 4 scales (5°, 10°, 15°, 20° span), compute physical vertex positions, prescreen with `hasStarNear`, cap at 2000 candidates
- [x] 4.2 Wire `single-sweep` into the generator dispatch in `match()` (Phase 1 → Phase 2 → Phase 3 via shared helpers)

## 5. Implement any-vertex Generator

- [x] 5.1 Implement `any-vertex` generator: enumerate all (star S, skeleton vertex V) pairs; pin V to S; derive rotation from V's nearest neighbouring vertex aligned to S's nearest unassigned star within 15°; skip if no second star; prescreen; cap at 2000 candidates
- [x] 5.2 Wire `any-vertex` into the generator dispatch in `match()`

## 6. Test Harness CLI Updates

- [x] 6.1 Add `--generator <generator>` flag parsing to `test-harness/run.ts`; forward to `MatcherConfig`
- [x] 6.2 Add `--scorer <scorer>` flag parsing to `test-harness/run.ts`; forward to `MatcherConfig`
- [x] 6.3 Add `--words <word1,word2,...>` flag parsing to `test-harness/run.ts`; filter the word list; exit with error on unknown words
- [x] 6.4 Update results recording in `test-harness/run.ts` to capture `shapeScore` and `vertexFitScore` from `MatchResult`

## 7. Permutations Bash Script

- [x] 7.1 Write `test-harness/run-permutations.sh`: loop over all 9 generator × scorer combinations, run `npx tsx run.ts --run-id <gen>-<scorer> --generator <gen> --scorer <scorer> --words guitar,crown,sword,bunny --fixtures-dir fixtures`, print progress, exit non-zero on any failure
- [x] 7.2 Make `test-harness/run-permutations.sh` executable (`chmod +x`)

## 8. Tests and Harness Run

- [x] 8.1 Update or add unit tests in `lambda/src/__tests__/` covering: `vertexFitScore` formula, `procrustesScore` formula, generator dispatch (mock generators), scorer dispatch
- [ ] 8.2 Restart Docker Compose and run existing test harness on `anchor-pair` + `edge-ratio` to confirm no regression
- [ ] 8.3 Run `run-permutations.sh` to produce all 9 combination runs on the 4-word subset; verify 9 report directories are created

## 9. Phase 3 n>m Guard (Bug Fix)

- [x] 9.1 In `runPhase2And3` in `lambda/src/matcher.ts`, replace `if (nearby.length === 0) continue;` with `if (nearby.length < nVtx) continue;` to prevent calling `hungarianAssign` with a cost matrix where rows > columns

## 10. Dynamic Phase 3 Search Radius

- [x] 10.1 Add helper `medianEdgeLength(physVerts, edges)` that computes the median physical edge length in degrees for a given placement
- [x] 10.2 In `runPhase2And3`, replace the fixed 3° / 6° search radius with `max(1.5, medianEdgeLength(physVerts, edges) * 1.5)` — use a single adaptive radius (no fallback expansion needed)

## 11. Extended single-sweep Scale Range

- [x] 11.1 In `singleSweepSearch`, extend `SCALES_DEG` from `[5, 10, 15, 20]` to `[5, 10, 15, 20, 25, 30]`

## 12. any-vertex Multi-Neighbour Sweep

- [x] 12.1 In `anyVertexSearch`, replace the single `nearestNeighborV` lookup with a loop over all of `adj[vi]` (all skeleton neighbours of vertex V)
- [x] 12.2 For each (S, V, U) triple (seed, vertex, skeleton-neighbour), compute physScale and skip if outside [2°, 30°] range; keep the existing second-star-within-15° logic otherwise

## 14. Maximum Span Enforcement

- [x] 14.1 Add `maxSpanDeg?: number` to `MatcherConfig` and `maxSpanDeg: number` (default 40) to `ModelDefaults` / `BASE_DEFAULTS` in `lambda/src/matcher.ts`
- [x] 14.2 In `pairwiseAnchorSearch` Phase 1 loop, add `if (physDist / maxAxisDist * scale > cfg.maxSpanDeg) continue;` (expectedSpan check) — note: for anchor-pair, `scale` is the physical distance between the anchor pair, which equals `physDist`, so expectedSpan = `physDist`; skip if `physDist > cfg.maxSpanDeg`
- [x] 14.3 In `singleSweepSearch` Phase 1 loop, add `if (spanDeg > cfg.maxSpanDeg) continue;` (spanDeg is already the full expected span for single-sweep)
- [x] 14.4 In `anyVertexSearch` Phase 1 loop, replace the `physScale` clamp with `const expectedSpan = physScale * maxAxisDist; if (expectedSpan < 2 || expectedSpan > cfg.maxSpanDeg) continue;`
- [x] 14.5 In `match()`, after selecting `globalBest`, add: if `maxPairwiseAngularDist(globalBest.constellationStars) > cfg.maxSpanDeg` then log a warning and return null

## 15. Constellation Centroid as Patch Centre

- [x] 15.1 In `match()`, after selecting `globalBest`, compute `patchRA = mean(physVerts RA)` and `patchDec = mean(physVerts Dec)` from `globalBest.skeletonRaDec`; use these instead of `globalBest.seed.ra/dec` in the returned `MatchResult`

## 16. Adaptive Display Radius in Test Harness

- [x] 16.1 In `processWord` in `test-harness/run.ts`, compute `effectiveRadius = Math.max(PATCH_RADIUS_DEG, angularSize * 0.7)` after computing `angularSize`; use `effectiveRadius` instead of `PATCH_RADIUS_DEG` for the `patchStars` filter
- [x] 16.2 Pass `effectiveRadius` as `patchRadiusDeg` to `renderPatch` (already a parameter in `RenderOpts`)

## 17. procrustes-unit-scale Scorer

- [x] 17.1 Add `'procrustes-unit-scale'` to the `ScorerName` union type in `lambda/src/matcher.ts`
- [x] 17.2 Implement `computeProcrustesUnitScaleScore(constellationStars, physVerts)`: identical to `computeProcrustesScore` but with `scale` forced to `1.0` (skip the `traceRTH / normBSq` computation) and residual normalised by `ORION_SPAN_DEG` (25°) instead of physVerts span
- [x] 17.3 Add `computeSpanFactor(physSpan)` helper: `excess = max(0, physSpan − 30, 20 − physSpan); return Math.exp(−excess / ORION_SPAN_DEG)`
- [x] 17.4 Wire `procrustes-unit-scale` into Phase 3 scorer dispatch in `runPhase2And3`: compute `procrustesUnitScaleScore`, set `selectionScore = procrustesUnitScaleScore × computeSpanFactor(computeSpan(physVerts))`, store result in `procrustesScore` on `bestResult`
- [x] 17.5 Add `'procrustes-unit-scale'` to `VALID_SCORERS` in `test-harness/run.ts`
- [x] 17.6 Update `test-harness/run-permutations.sh` to include `procrustes-unit-scale` in the scorer loop (now 4 scorers × 3 generators = 12 combinations)

## 13. Per-Match Diagnostic Logging

- [x] 13.1 Add `phase1Candidates`, `phase2Candidates`, `phase3Candidates` fields to `MatchResult` in `lambda/src/types.ts`
- [x] 13.2 Thread phase count tracking through `runPhase2And3` and all three generator functions; populate the new fields on the returned `MatchResult` in `match()`
- [x] 13.3 Add `WordDiagnostic` type and `writeDiagnostics(outDir, diagnostics)` function to `test-harness/run.ts`
- [x] 13.4 After each word is processed in `runSuite`, build a `WordDiagnostic` record from `MatchResult` (physVerts, per-vertex assignment distances, phase counts, scores)
- [x] 13.5 After the suite loop completes, call `writeDiagnostics` to write `reports/{runId}/diagnostics.json`; catch and warn on write errors (non-fatal)
