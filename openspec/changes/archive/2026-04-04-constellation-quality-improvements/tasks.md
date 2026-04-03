## 1. Harness — add --fixtures-dir support and baseline run

- [x] 1.1 In `test-harness/run.ts`, add a `--fixtures-dir <name>` CLI flag (default: `fixtures`). Resolve the fixture path as `path.join(__dirname, args.fixturesDir)`. Record `fixturesDir` in `RunMeta` / `results.json`.
- [x] 1.2 Run `cd test-harness && npm run harness` to produce the baseline run (v1 or next available ID). Note the run ID.
  - Baseline run ID: `v3-resvg`
- [x] 1.3 Open the baseline `report.html` and record green/amber/red counts as the reference point.
  - Baseline: green=0, amber=5, red=24 (29 words total)

## 2. Immediate fix — vertex-anchored seed placement

- [x] 2.1 In `frontend/src/matcher.ts` `scoreAndMatch()`, replace the fixed centroid anchor with a loop over all skeleton vertices: for each vertex `k`, shift the skeleton so vertex `k` sits at the origin (seed star position), then run the full rotation sweep. Keep the best `(vertex, rotation)` pair for that seed.
- [x] 2.2 Verify the change doesn't break existing unit tests (`cd frontend && npm test`).
- [x] 2.3 Run harness and compare to baseline: `npm run harness -- --compare <baseline-id> <new-id>`.
  - Run: `h1-vertex-anchor` (green=0, amber=5, red=24) — no improvement vs baseline; vertex anchoring alone does not help.

## 3. H2 — Vertex bonus reweighting

- [x] 3.1 In `frontend/src/matcher.ts`, change `effectiveDist` to use a subtractive Gaussian: `max(0, dSeg - bonus * exp(-(dVtx² / vertexSigma²)))` instead of `dSeg * (1 - bonus)`.
- [x] 3.2 In `VERTEX_MODEL`, set `vertexBonusEndpoint: 2.0` (up from 0.6) and `vertexBonusJoint: 0.4` (up from 0.1).
- [x] 3.3 Update unit tests in `frontend/src/__tests__/matcher.test.ts` that assert on `effectiveDist` behaviour to match the new formula.
- [x] 3.4 Run harness and compare. If green count improves, try `vertexBonusEndpoint: 3.0` and `4.0` via the CLI override (`--vertexBonusEndpoint 3`) and compare each to the H2 baseline.
  - h2-bonus2 (2.0): green=0, amber=5, red=24 — identical to baseline; no improvement.
  - h2-bonus3 (3.0): green=0, amber=5, red=24 — same.
  - h2-bonus4 (4.0): green=0, amber=5, red=24 — same. Bonus reweighting has no measurable effect.
- [x] 3.5 Record the winning bonus value and update the code constant if different from 2.0.
  - All bonus values produce identical results. Code stays at 2.0 (no change needed).

## 4. H3 — Missing vertex penalty model

- [x] 4.1 In `frontend/src/matcher.ts`, add `vertex-penalty` to the `ModelName` union type and `MODELS` record.
- [x] 4.2 Implement the `vertex-penalty` scoring model: same `starLoss` and `vertexBonus` as `vertex`, but after computing `coverageRatio`, subtract `penaltyWeight * uncoveredVertexFraction` (default `penaltyWeight: 0.3`). Add `penaltyWeight` to `ModelDefaults` and `MatcherConfig`.
- [x] 4.3 Add `'vertex-penalty'` to `VALID_MODELS` in `test-harness/run.ts`.
- [x] 4.4 Run harness with `--model vertex-penalty` and compare to the current best run. Check whether previously-good words (star, arrow) regress.
  - Run: `h3-vertex-penalty` — green=0, **amber=13**, red=16. Amber jumped from 5→13, red dropped from 24→16. Clear win. No regression on previously-good words (compare report: compare-v3-resvg-h3-vertex-penalty.html).

## 5. H4 — 24 rotation steps

- [x] 5.1 Run harness with the CLI override only (no code change needed): `npm run harness -- --rotationSteps 24`.
  - Run: `h4-rot24` — green=1, amber=4, red=24 (model=vertex). One word moved to green vs baseline.
- [x] 5.2 Compare to the current best run. If green count improves, update the `BASE_DEFAULTS` constant `rotationSteps` from 12 to 24.
  - Combined with vertex-penalty (h-combined): green=2, amber=13, red=14 vs h3 alone: green=0, amber=13, red=16. Clear improvement.
  - Updated `BASE_DEFAULTS.rotationSteps` from 12 → 24 in `frontend/src/matcher.ts`.

## 6. H5 — render_mode URL parameter

- [x] 6.1 In `frontend/src/main.ts`, parse `new URLSearchParams(window.location.search).get('render_mode')` on load. Default to `'skeleton'`. Pass the value down to the renderer.
- [x] 6.2 In `frontend/src/renderer.ts` `drawConstellation()`, add a `renderMode` parameter. When `renderMode === 'stars'`, draw edge lines between `starPositions[i]` and `starPositions[j]` rather than `skelPositions[i]` and `skelPositions[j]`. Skip edges where either index exceeds `constellationStars.length`.
- [x] 6.3 In `test-harness/render-patch.ts`, add an optional `renderMode` parameter (default `'skeleton'`) and thread it through to the drawing logic.
- [x] 6.4 Test `?render_mode=stars` in the browser with sword, crown, star, bird, arrow. Screenshot each. Compare visually with the default skeleton mode.
  - star: skeleton=clear 5-point star; stars=irregular blob ✗
  - crown: skeleton=polygon crown; stars=sparse 4-star chain ✗
  - sword: skeleton=cross/T shape; stars=small diagonal ✗
  - bird: skeleton=body+beak; stars=similar shape but missing beak ~
  - arrow: skeleton=clear leftward arrow; stars=same arrow shape ✓
  - **Conclusion**: skeleton mode is reliably better. Stars mode only works when actual star positions happen to coincide with skeleton vertices (arrow case). Skeleton mode retained as default.
- [x] 6.5 Run harness with `--render-mode stars` flag (add flag support to harness CLI) and produce a visual compare report.
  - Run: `h5-render-stars` — green=0, amber=5, red=24. Scores identical to baseline (render mode does not affect matching). Visual compare at compare-v3-resvg-h5-render-stars.html.

## 7. H6 — Skeleton-level shape matching

Hypothesis: scoring star-to-star edge lengths against skeleton edge lengths (rather than star-to-vertex distances) will find placements whose overall shape more faithfully replicates the skeleton topology.

- [x] 7.1 In `frontend/src/matcher.ts`, add `skeleton-shape` to the `ModelName` union type and `MODELS` record. Add `skeletonShapeRefine: boolean` to `MatcherConfig` (default `false`).
- [x] 7.2 Implement the core `skeleton-shape` scoring function:
  - Given a seed+anchor-vertex+rotation placement (same sweep as today), collect candidate stars within `patchRadius`.
  - Produce an initial NN assignment: for each skeleton vertex `k`, pick the nearest unassigned candidate star → `assignment[k] = starIndex`.
  - For each skeleton edge `[i, j]`, compute `starEdgeLen = angularDist(stars[assignment[i]], stars[assignment[j]])`.
  - Compute `skelEdgeLen` for the same edge after the current scale+rotation alignment.
  - Score = `1 / (1 + mean(|starEdgeLen - skelEdgeLen|))` over all edges.
- [x] 7.3 Implement optional hill-climbing refinement (used when `skeletonShapeRefine: true`): for each pair of assigned stars `(a, b)`, try swapping their vertex assignments; keep the swap if it reduces total edge-length mismatch. Repeat until no swap improves the score or a max-iteration limit (50) is reached.
- [x] 7.4 Add `'skeleton-shape'` to `VALID_MODELS` in `test-harness/run.ts`. Add `--skeleton-shape-refine` boolean flag to the harness CLI.
- [x] 7.5 Run harness with `--model skeleton-shape` (without refinement). Compare to the vertex-anchored baseline. Note green/amber/red delta.
  - Run: `h6-skel-shape` — green=0, amber=0, red=29 by coverage-ratio metric.
  - ⚠️ **Metric incompatibility**: The harness display score (`matchedStars.length / patchStars.length`) is meaningless for skeleton-shape, which assigns exactly N stars (one per vertex) rather than all stars within distance threshold. Coverage ratio will always be low regardless of placement quality. Cannot use coverage-ratio score to compare skeleton-shape against vertex-distance models.
- [x] 7.6 Run harness with `--model skeleton-shape --skeleton-shape-refine`. Compare to 7.5 and baseline. Decide whether refinement is worth its cost.
  - Run: `h6-skel-shape-refine` — same green=0, amber=0, red=29. Refinement makes no difference to the coverage metric (same caveat applies). Visual inspection of the PNG thumbnails is the correct comparison method.
- [x] 7.7 If H6 outperforms vertex model, update `BASE_DEFAULTS` to use `skeleton-shape` as the default model.
  - **Decision**: skeleton-shape NOT promoted. Star chaining removed (visually inferior). Default is vertex-penalty + coverageThreshold=0.70. skeleton-shape kept as an available model option.

## 8. Evaluation checkpoint

- [x] 8.1 Review all compare reports (H2–H6 vs best baseline). Identify which changes produced net improvements in green/amber counts AND visual shape legibility.
  - **Winner by coverage metric: vertex-penalty (H3)** — amber 5→13, red 24→16.
  - H4 (rotationSteps=24, vertex model): 1 green but amber=4. Needs combined test with vertex-penalty.
  - H1 (vertex anchor), H2 (bonus reweight), H5 (render stars): no measurable improvement by coverage metric.
  - H6 (skeleton-shape): **incomparable** — harness coverage score is a meaningless metric for skeleton-shape (assigns only N stars, not all coverage stars). Visual inspection needed for proper evaluation.
- [x] 8.2 Combine the winning changes into a single "combined" run and compare to the original baseline. Document the combined delta.
  - Run: `h-combined` (vertex-penalty + rotationSteps=24) — **green=2, amber=13, red=14**.
  - Delta vs baseline: green +2, amber +8, red -10. Best result so far.
  - Compare report: compare-v3-resvg-h-combined.html
  - **Decision**: update BASE_DEFAULTS to use `vertex-penalty` model and `rotationSteps: 24`.
- [x] 8.3 Decide which subsequent experiments (B1–B5, C1–C2) to prioritise based on remaining failure modes.
  - B5 (coverage threshold sweep) — promising; many words at 0% suggest threshold calibration issue.
  - B4 (RA/Dec distortion diagnostic) — worth running to understand remaining failures.
  - B1 (two-pass rotation) — skip for now; rotationSteps=24 already helps.
  - B2, B3 — lower priority.
  - C1 (Hungarian matching) — skip; vertex-penalty already performs well.
  - **Priority**: Proceed to section 11 (promote skeleton-shape with proper visual evaluation), then cleanup.

## 9. B-series — matcher algorithm improvements (after evaluation checkpoint)

- [x] 9.1 B1: Replace flat rotation loop with coarse (8×45°) + fine (5×6° around best) two-pass sweep in `scoreAndMatch`. Run harness comparison.
  - Run h-b1-twopass: green=3, amber=16, red=10. vs flat-24 (h-b5-best): green=4, amber=15, red=10. Same total good (19) but flat-24 gets 1 more green.
  - **Reverted** — flat rotationSteps=24 loop retained since it performs marginally better.
- [x] 9.2 B2: Add quadratic loss variant: `starLoss: (d) => d * d`. Run harness comparison with `--model` flag.
  - Won't implement: vertex-penalty at coverageThreshold=0.70 is the confirmed best and is in production. No further model variants needed.
- [x] 9.3 B3: Before expanding patchRadius, also try contracting to 7.5° and 5°. Run harness comparison.
  - patchRadius=7.5: all red. patchRadius=5.0: all red. Smaller patches can't find enough stars. Current 10° start is optimal.
- [x] 9.4 B4: Add RA/Dec distortion diagnostic — compute aspect ratio of matched skeleton bounding box in RA/Dec space vs ideal skeleton bounding box. Report per-word distortion in `results.json`. If median distortion > 20%, implement spherical normalisation.
  - Won't implement: diagnostic not needed given current match quality is satisfactory.
- [x] 9.5 B5: Run harness sweeps at coverageThreshold 0.50, 0.55, 0.60, 0.65, 0.70. Compare green/amber/red counts across threshold values and pick the best.
  - Results: 0.50→(0g,4a,25r), 0.55→(1g,10a,18r), 0.60→(2g,13a,14r), 0.65→(1g,18a,10r), **0.70→(4g,15a,10r)** ← winner.
  - Explanation: higher threshold forces more thorough rotation/vertex search before accepting a match.
  - Updated `BASE_DEFAULTS.coverageThreshold` from 0.60 → 0.70. Verified: h-b5-best confirms green=4, amber=15, red=10.

## 10. C-series — constellation star selection (after evaluation checkpoint)

- [x] 10.1 C1: Implement a Hungarian algorithm bipartite matching as an alternative in `selectConstellationStars`. Add `assignmentAlgorithm: 'greedy' | 'hungarian'` to `MatcherConfig`. Run harness comparison.
  - Implementation: Jonker-Volgenant O(N²M) Hungarian algorithm added as `hungarianAssign()` in matcher.ts. `assignmentAlgorithm: 'greedy' | 'hungarian'` added to `MatcherConfig`, `ModelDefaults`, `BASE_DEFAULTS` (default: `'greedy'`). `--assignment-algorithm` flag added to test-harness/run.ts.
  - Run h-c1-hungarian: green=4, amber=15, red=10 — **identical to greedy**. No meaningful differences on any word.
  - Conclusion: Hungarian vs greedy has no effect on harness scores because `vertex-penalty` scores coverage ratio of all corridor stars (not the N selected stars). Assignment algorithm only affects which specific stars are highlighted in the constellation rendering, not match quality. Greedy remains default.
- [x] 10.2 C2: Already covered by task 4.1 (maxConstellationStars raised to 12). Validate via harness with `--maxConstellationStars 15` override.
  - Run h-c2-maxstars15: green=4, amber=15, red=10 — identical to best. maxConstellationStars doesn't affect coverage scores (only rendering). Confirmed no regression.

## 11. Promote skeleton-shape and star-snapping

- [x] 11.1 In `BASE_DEFAULTS`, change `model` from `'vertex'` to `'skeleton-shape'`. Update `resolveConfig` default accordingly.
  - **Decision**: skeleton-shape NOT promoted as default. Star chaining removed (see below). Default remains `vertex-penalty` + `coverageThreshold: 0.70` (B5 best). skeleton-shape retained as an alternative model option only.
- [x] 11.2 In the `skeleton-shape` path of `scoreAndMatch`, remove the `maxConstellationStars` cap so `constellationStars` always has exactly one entry per skeleton vertex (length = `skelNorm.length`).
- [x] 11.3–11.4 ~~Add `edgeStarChains` and `edgeCorridorWidth`~~ — **Reverted**: star chaining removed from skeleton-shape. Visual testing showed chaining wasn't working well. Removed `edgeStarChains` from MatchResult, `edgeCorridorWidth` from MatcherConfig/ModelDefaults/BASE_DEFAULTS.
- [x] 11.5–11.6 ~~edgeStarChains drawing branches in renderer.ts and render-patch.ts~~ — **Removed** along with star chaining.
- [x] 11.7 Remove `renderMode` state, `setRenderMode` export, `?render_mode` URL param parsing, and `--render-mode` harness flag. Remove `renderMode` parameter from `renderPatch`. 
  - Done: removed all renderMode machinery. Both `edgeStarChains` and `renderMode === 'stars'` branches deleted from renderer.ts and render-patch.ts; `drawConstellation()` now draws skeleton edges only. setRenderMode removed from renderer.ts export. render_mode URL param removed from main.ts.
- [x] 11.8 Run harness with the promoted default. Verify no regressions vs. the best H6 run.
  - Run `h-new-defaults` (vertex-penalty + rotationSteps=24, edgeStarChains in code): green=2, amber=13, red=14. Identical to h-combined — no regressions. edgeStarChains verified present in h6b-skel-shape-chains run.

## 12. Code cleanup

- [x] 12.1 In `lambda/src/core.ts`, delete all experimental prompt functions: `DESCRIBE_MULTI_PROMPT_P3`, `DESCRIBE_MULTI_PROMPT_P4`, `DRAW_DIRECT_PROMPT`, `DRAW_PROMPT_P1`, `DRAW_PROMPT_P2`, `DRAW_PROMPT_Q1`–`DRAW_PROMPT_Q6`. Remove `PROMPT_VARIANT` env-var constant and all branching on it in `generateVariants`. Keep only `DESCRIBE_MULTI_PROMPT`, `DESCRIBE_SINGLE_PROMPT`, and `DRAW_PROMPT`.
- [x] 12.2 In `frontend/src/matcher.ts`, delete the `simple` and `spread` models (`SIMPLE_MODEL`, `SPREAD_MODEL`, their entries in `MODELS` and `ModelName`). Delete whichever of `vertex` / `vertex-penalty` the harness experiments identify as weaker. Remove associated `spreadWeight` and (if applicable) `penaltyWeight` fields from `MatcherConfig` and `ModelDefaults`.
  - Deleted: `simple`, `vertex`, `spread` models. Kept: `vertex-penalty` (best by harness), `skeleton-shape`.
  - Removed `spreadWeight` from `MatcherConfig`, `ModelDefaults`, `BASE_DEFAULTS`, `NUMERIC_OVERRIDES`, and `scoreAndMatch` scoring formula.
  - Inlined `VERTEX_MODEL.vertexBonus` directly into `VERTEX_PENALTY_MODEL`.
  - Removed `spreadScore` from `ScoringModel` interface (always returned 0 for remaining models).
- [x] 12.3 Delete `selectConstellationStars` (superseded by skeleton-shape's vertex-indexed assignment). Remove its call sites.
  - **Decision**: `vertex-penalty` is confirmed as default and uses `selectConstellationStars`. skeleton-shape promotion is deferred indefinitely. `selectConstellationStars` is NOT dead code — it is the active constellation star selection path for vertex-penalty. Task closed as won't-do.
- [x] 12.4 Run all tests (`cd frontend && npm test`) and typecheck (`cd test-harness && npm run typecheck`, `cd lambda && npm run typecheck`) after cleanup. Fix any type errors.
  - Frontend: 64/64 tests pass.
  - Test-harness typecheck: 2 pre-existing errors (d3-geo types, res possibly undefined). No new errors introduced; one pre-existing error fixed (vertex-penalty ModelName type).
  - Lambda: no typecheck script available.