## Context

The matcher currently runs a fixed three-phase pairwise anchor pipeline:
Phase 1 (cell-coverage prescreen) → Phase 2 (greedy edge-length score) → Phase 3 (Hungarian refinement).
The pipeline is hard-wired: one placement strategy (anchor-pair) and one scoring function (edge-length ratio).
Matching quality is poor for some words because (a) the principal-axis anchor constrains scale and rotation
to a single star pair, and (b) edge-ratio score does not measure whether stars ended up near their intended
skeleton vertices.

The `maxConstellationStars` and `minMatchedStars` hard limits silently drop vertices on complex skeletons,
causing the rendered shape to differ from the target.

We need to experiment with different placement generators and scoring functions, compare them on a small
fixed word set, and promote the best combination — without rewriting the matcher each time. A bash script
will run all combinations through the test harness automatically.

## Goals / Non-Goals

**Goals:**
- Add `generator` and `scorer` fields to `MatcherConfig` with sensible defaults (`anchor-pair`, `edge-ratio`)
- Implement two new generators: `single-sweep` and `any-vertex`
- Implement two new scorers: `vertex-fit` and `procrustes`
- Remove `maxConstellationStars` and `minMatchedStars` hard caps; let unmatched vertices contribute loss naturally
- Always compute and return `shapeScore` (edge-ratio) and `vertexFitScore` (vertex-fit) in `MatchResult`; add optional `procrustesScore`
- Add `--generator` and `--scorer` CLI flags to the test harness runner
- Generate a bash script (`test-harness/run-permutations.sh`) that runs all generator × scorer combinations on a fixed 4-word set

**Non-Goals:**
- Runtime multi-strategy arbitration (running multiple generators per query and picking the best)
- Second-star selection strategy in `any-vertex` generator (deferred)
- `keepTop` tuning exposed as config
- Constellation chain stars along skeleton edges

## Decisions

### Decision 1: Generator and scorer as independent `MatcherConfig` fields

**Chosen:** Add `generator: 'anchor-pair' | 'single-sweep' | 'any-vertex'` and
`scorer: 'edge-ratio' | 'vertex-fit' | 'procrustes'` as optional fields in `MatcherConfig`.
Defaults to `'anchor-pair'` and `'edge-ratio'` (preserving current behaviour when omitted).

**Alternatives considered:**
- A single combined `pipeline` name (e.g. `'anchor-pair-edge-ratio'`): rejected because it creates a
  combinatorial explosion of names and prevents comparing scorers independently of generators.
- A full function injection API: rejected — overkill for offline experimentation; string names are easier
  to pass via CLI flags.

### Decision 2: Wrap existing anchor-pair pipeline as the `anchor-pair` generator

**Chosen:** The three-phase pairwise anchor pipeline becomes the `anchor-pair` generator. No behaviour
change when `generator` is omitted or set to `'anchor-pair'`. The scorer is applied after Phase 3 assignment
to select the final best candidate.

**Alternatives considered:**
- Extracting Phase 1 only as the generator (letting the scorer re-run phases 2 and 3): too invasive for the
  initial change; the existing pipeline already uses edge-ratio for selection inside phases 2 and 3.

### Decision 3: Remove `maxConstellationStars` and `minMatchedStars` entirely

**Chosen:** Both limits are removed from `MatcherConfig` and all internal uses. Unmatched vertices receive
maximum distance in the cost matrix, contributing high loss. This forces the algorithm to account for the
full skeleton.

**Alternatives considered:**
- Making them soft defaults (e.g. default to skeleton vertex count): adds complexity without benefit once
  the loss properly penalises coverage gaps.

### Decision 4: `vertexFitScore` always computed; `procrustesScore` only when scorer is `'procrustes'`

**Chosen:** After Phase 3 Hungarian assignment, `vertexFitScore` is computed unconditionally and included in
every `MatchResult`. `procrustesScore` is computed only when `scorer === 'procrustes'` (it is more expensive).

**Rationale:** Having both `shapeScore` and `vertexFitScore` in every result enables comparison reports to
plot both dimensions without re-running.

### Decision 5: Bash script runs 4-word subset with fixed fixtures

**Chosen:** `test-harness/run-permutations.sh` uses `--fixtures-dir fixtures` (existing fixtures — no API
calls) and a fixed `--words guitar,crown,sword,bunny` flag (new CLI option added to runner) to keep total
runtime reasonable. Each of the 9 combinations writes to its own run ID (e.g. `anchor-pair-edge-ratio`).

## Decisions (Amendments After Permutation Run)

### Decision 6: Skip Phase 3 candidates where nearby.length < nVtx (n>m guard)

**Chosen:** In `runPhase2And3`, add `if (nearby.length < nVtx) continue;` before calling
`hungarianAssign`. The Jonker-Volgenant implementation requires rows ≤ columns; violating this
corrupts the assignment (multiple vertices assigned the same star, producing one visible edge for
every skeleton edge). Skipping is safe: such candidates have too few stars near their vertices and
would score poorly anyway.

**Alternatives considered:**
- Pad the nearby set with dummy stars at large distance: adds complexity; the candidate scores
  near 0 so skipping is equivalent.
- Transpose the matrix and solve the dual: unnecessary — the case is a symptom of a bad placement,
  not a valid match at small scale.

### Decision 7: Dynamic Phase 3 search radius proportional to inter-vertex spacing

**Chosen:** Compute `interVertexSpacing = medianPhysicalEdgeLength(physVerts, edges)`. Set
Phase 3 per-vertex search radius to `max(1.5°, interVertexSpacing * 1.5)`. For a guitar at 20°
span (~1.3° spacing), this gives ~2°; for a simple triangle at 10° span (~5° spacing), it gives
~7.5°, equivalent to the old fixed 3° + 6° fallback. The key property is that vertices
at different scales get different radii — dense skeletons use tight radii, preventing star-pool
collapse.

**Alternatives considered:**
- Fixed 3° with nVtx guard only: improves the n>m bug but doesn't fix star-pool collapse for
  dense skeletons.
- Radius = edge_length / 2: too tight; no tolerance for star offsets from ideal vertex positions.

### Decision 8: Extend single-sweep SCALES_DEG to [5, 10, 15, 20, 25, 30]

**Chosen:** Add 25° and 30° scale values. The 2000-candidate cap still applies, so runtime
increase is bounded. The extra scales are especially important for guitar (natural ~25° scale)
and similarly complex skeletons. The cap means that if a 5° placement prescreens better than a
25° one, the 25° placement still makes it through if it scores high enough relative to the batch.

**Alternatives considered:**
- Logarithmic scale grid: more principled, but harder to reason about without empirical data;
  add post permutation run if 6 discrete values are still insufficient.

### Decision 9: any-vertex enumerates all skeleton neighbours per (S, V) pair

**Chosen:** For each (seed S, vertex V), iterate over all of V's skeleton neighbours (not just
the nearest). For each neighbour U, derive the rotation aligning V→U to S→T for every candidate
second star T within 15°. Cap physScale to [2°, 30°]; skip pairs outside this range. This turns
the O(seeds × vertices) generator into O(seeds × vertices × mean_degree × local_stars) which is
larger but still capped at 2000 Phase 1 candidates. Most placements produced by the original
"nearest only" approach were garbage; this exploration increases the chance of a structurally
sound placement.

**Alternatives considered:**
- Keep nearest-only but add scale clamping: fixes absurd-scale cases but not the rotation noise.

### Decision 11: Enforce maxSpanDeg on expected total span, not physScale per unit

**Chosen:** Add `maxSpanDeg: number` to `MatcherConfig` (default 40°). In every generator's
Phase 1 loop, compute `expectedSpan = physScale × maxAxisDist` and `continue` if it exceeds
`cfg.maxSpanDeg`. This guard fires before prescreen so zero-cost placement is skipped. Also add a
final check in `match()`: if `maxPairwiseAngularDist(globalBest.constellationStars) > cfg.maxSpanDeg`,
return null. The final check catches any edge case where physScale and maxAxisDist differ from the
actual assigned star spread.

Clamping physScale to [2°, 30°] per unit (Decision 9) is still applied in `any-vertex` as a
first-pass heuristic, but the `maxSpanDeg` expected-span check is the authoritative gate.

**Why 40° default:** Orion spans ~25°. 1.6× gives headroom for larger shapes (guitar, full-body
animals) without allowing sky-spanning nonsense. CLI-overridable for experimentation.

**Alternatives considered:**
- Cap physScale per unit (original proposal): insufficient — a long skeleton multiplies that cap.
- Cap only in `any-vertex`: single-sweep can also generate 25° span placements by design; the
  final `match()` check acts as universal backstop.

### Decision 12: Return physVerts centroid as patchRA/patchDec

**Chosen:** After selecting `globalBest` in `match()`, set `patchRA/patchDec` to
`mean(physVerts.map(v => v[0]))` / `mean(physVerts.map(v => v[1]))` (arithmetic mean RA/Dec of
the winning candidate's physical vertices). The seed star ID continues to be used for
`excludeSeeds.add(...)` before the centroid is computed — no behavioural change there.

**Why centroid and not constellationStars centroid:** physVerts are the intended positions and are
available before star lookup. For well-matched results they differ by at most a few degrees. Using
physVerts avoids a dependency on the star assignment order.

**Impact on existing behaviour:** `anchor-pair` previously used one axis endpoint as the patch
centre; the centroid will shift the display ~5–10° for most words, showing the constellation more
symmetrically. No data-migration issue — patchRA/patchDec is only used for display and as the
"patch centre" logged metric.

**Alternatives considered:**
- Add a separate `displayRA/displayDec` field: adds API complexity without benefit — patchRA/Dec
  has only ever been used as a display hint, not as a functional anchor.

### Decision 13: Adaptive patchStars radius in test harness

**Chosen:** In `processWord`, replace the hardcoded `PATCH_RADIUS_DEG = 10` collection radius
with `max(PATCH_RADIUS_DEG, angularSize × 0.7)` where `angularSize = maxPairwiseAngularDist(
matchResult.stars)`. Pass the effective radius to `renderPatch` via `RenderOpts.patchRadiusDeg`
(already a parameter). This ensures all constellation stars fall within the collected `patchStars`
and the stereographic projection is scaled to show the full constellation.

**Why 0.7×:** Provides a small margin around the outermost constellation stars without making the
panel too zoomed out for compact constellations. For a 20° constellation, radius = 14°.

**Alternatives considered:**
- Always use `angularSize / 2 + buffer`: works but over-zooms compact constellations.

### Decision 10: Per-match diagnostics written to diagnostics.json

**Chosen:** After completing the suite run, write a file `reports/{runId}/diagnostics.json`
containing one record per word. Each record includes: generator, scorer, phase1Candidates,
phase2Candidates, phase3Candidates, winning seed position, physVerts of winning candidate,
nearbyStarCount, per-vertex assignments (starId, physVertRA/Dec, starRA/Dec, distanceDeg,
distanceNormBySpan), shapeScore, vertexFitScore, procrustesScore. This enables offline inspection
without re-running the matcher.

**Format:** Array of `WordDiagnostic` objects. Not rendered in the HTML report (too verbose);
viewed directly or by external tooling.

**Alternatives considered:**
- Inline into results.json: bloats the results file and breaks the existing compare-mode reader.
- Per-word JSON files: more granular but harder to load in bulk.

## Decisions (Amendments After Size-Bias Analysis)

### Decision 14: Size bias is two-layered — Phase 1 scale and Procrustes scale freedom

**Observation:** After running all 9 generator × scorer permutations, all results were 30–40° star
span regardless of scorer. Diagnostics revealed two layered causes:

1. **Procrustes allows free scale change** — the optimal Procrustes alignment includes a scale
   parameter, so a star arrangement 33% larger than physVerts scores 97%. The scorer hides size
   inflation behind shape quality.
2. **Star span inflates beyond physVerts span** — even when physVerts are placed at 25°, the
   Hungarian-assigned stars end up 5–10° further apart because stars at the periphery of the search
   radius (searchR = 1.5–2.5°) happen to lie *outward* from the physVerts bounding box.

**Key finding:** physVerts spans from `single-sweep-procrustes` were 20–30° (reasonable), but star
spans were 28–41°. The generators are working; the scorer is not penalising the inflation.

### Decision 15: Unit-scale Procrustes scorer (`procrustes-unit-scale`)

**Chosen:** Add a new `ScorerName` value `'procrustes-unit-scale'` that performs Procrustes
alignment with scale fixed at 1.0 (rotation + translation only). The score is
`1 / (1 + meanResidualDeg / ORION_SPAN_DEG)` where `ORION_SPAN_DEG = 25°` is the fixed reference
(not the actual physVerts span).

**Why unit scale:** The physVerts placement already encodes the intended scale (via spanDeg in
single-sweep, or physDist in anchor-pair). The aligner should only correct small rotational and
translational errors, not silently rescale the solution to fit a larger star arrangement.

**Why ORION_SPAN_DEG as normalization denominator instead of physVerts span:** Dividing by physVerts
span creates a systematic bias toward larger placements (same absolute residual → smaller fraction of
span). Using the fixed reference 25° makes the score size-agnostic: a 1° mean residual always
contributes 1/25 to the loss, regardless of how large the placement is.

**Comparison path:** Introduced as a new scorer alongside the existing `'procrustes'`, enabling
direct side-by-side comparison in the permutation runs.

**Alternatives considered:**
- Add a scale-deviation penalty to the existing `procrustes` scorer: more complex, less
  interpretable than just removing the degree of freedom.
- Change `vertex-fit` normalization to use `ORION_SPAN_DEG`: addresses the fixed-reference need
  but doesn't fix scale freedom (vertex-fit doesn't have scale freedom, so this is less urgent).

### Decision 16: Orion-reference span preference in Phase 3 candidate selection

**Chosen:** During Phase 3 candidate comparison, multiply the base scorer result by a span factor
computed from physVerts span:

```
ORION_SPAN_DEG = 25°
flat zone: [ORION_SPAN_DEG × 0.8, ORION_SPAN_DEG × 1.2] = [20°, 30°]
excess = max(0, physSpan − 30°, 20° − physSpan)
spanFactor = exp(−excess / ORION_SPAN_DEG)
selectionScore = baseScore × spanFactor
```

Applied **only when scorer === 'procrustes-unit-scale'** (bundled with the new scorer for clean
comparison). The reported scores (`shapeScore`, `vertexFitScore`, `procrustesScore`) remain
unmodified; `spanFactor` only affects Phase 3 candidate ranking.

**Flat zone rationale:** Constellations naturally vary in size — a bunny might be 10°, a guitar
30°. Penalising all deviation from 25° would reject valid large or small shapes. A ±20% flat zone
(20–30°) accepts everything near Orion size without penalty, while still pressing against runaway
inflation above 30° or sub-human-eye sizes below 20°.

**Penalty slope:** `exp(−excess / 25°)` gives:
- 30° (0° excess): ×1.00
- 35° (5° excess): ×0.82
- 40° (10° excess): ×0.67
- 50° (20° excess): ×0.45
- 20° (0° excess): ×1.00
- 15° (5° excess): ×0.82
- 10° (10° excess): ×0.67

This is intentionally "slight" — a 40° placement can still win if it fits the shape much better
than any 25° alternative.

**Why physVerts span, not star span:** physVerts span is known before Hungarian star assignment.
Star span inflates beyond physVerts span due to assignment at search-radius boundaries; using
star span would create a feedback loop (the winner's span influences whether it's selected).

**Why bundled with the new scorer:** The span preference and unit-scale Procrustes are
complementary. Together they form a "size-aware quality" metric. Applying the span preference to
existing scorers would change existing run results and complicate the comparison.

## Risks / Trade-offs

- **`single-sweep` runtime:** Sweeping all catalogue stars × all rotations × multiple scales is O(N·R·S).
  For offline use this is acceptable; guard with a generous but finite `candidateCap`.
  → Mitigation: cap Phase 1 candidates at 2000 (vs. 1000 for anchor-pair); runtime measured and documented
  in the comparison report.

- **`any-vertex` second-star ambiguity:** Pinning a skeleton vertex to a star requires deriving rotation
  from a nearby "second star". Strategy is deferred — for now use the nearest unassigned star within 15°.
  → Mitigation: document as provisional in code; revisit after permutation results are in.

- **Removing hard caps may surface new failures:** Words that previously matched with truncated skeletons
  will now require the full skeleton to be covered. Some scores will drop before the new generators recover them.
  → Mitigation: the permutation run captures before/after on the 4-word set; prior run IDs remain for comparison.

- **`procrustesScore` doubles as re-assigner (ICP):** The proposal leaves this open. Initial implementation
  computes Procrustes residual after Hungarian assignment without iterating (no ICP), noted as a known limitation.
  → Mitigation: flag as `TODO(procrustes-icp)` in code.

## Migration Plan

1. Extend `MatcherConfig` and `MatchResult` in `lambda/src/types.ts` and `lambda/src/matcher.ts`
2. Remove `maxConstellationStars` and `minMatchedStars` from `MatcherConfig` and matcher internals
3. Implement `single-sweep` and `any-vertex` generators; plug `anchor-pair` into the generator dispatch
4. Implement `vertex-fit` and `procrustes` scorers; plug `edge-ratio` into scorer dispatch
5. Compute `vertexFitScore` unconditionally after Phase 3; compute `procrustesScore` when applicable
6. Add `--generator` and `--scorer` CLI flags to `test-harness/run.ts`; add `--words` flag for subsetting
7. Write `test-harness/run-permutations.sh`; verify it runs all 9 combinations without error
8. Run permutations; produce comparison report; document winner

**Rollback:** `generator` and `scorer` default to the existing pipeline; no behaviour change unless explicitly
set. No schema migration required on stored data (MatchResult fields are additive).

## Open Questions

- Should `any-vertex` second-star selection look at the two nearest stars and pick the one that maximises
  coverage prescreen score, or always use the nearest? (Deferred — use nearest for now.)
- Should the comparison report rank combinations by `vertexFitScore`, `shapeScore`, or a weighted composite?
  (Decided at run time based on visual inspection of the permutation results.)
