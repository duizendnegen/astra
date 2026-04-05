## Why

The current matcher is a single fixed pipeline: pairwise anchor search → Hungarian → edge-length
ratio score. While this is a significant improvement over the original seed sweep, the shapes
produced still match poorly — the anchor pair constrains the placement in ways that prevent finding
the globally best fit, and the edge-length score alone does not capture whether the constellation
actually *looks like* the target shape.

We need to be able to experiment with different placement generators and scoring functions, compare
them on a fixed test set, and promote the best combination to default — without rewriting the
matcher each time.

## What Changes

- **Pluggable generator + scorer architecture.** `MatcherConfig` gains two new fields:
  `generator: 'anchor-pair' | 'single-sweep' | 'any-vertex'` and
  `scorer: 'edge-ratio' | 'vertex-fit' | 'procrustes'`. Each combination is independently
  testable. The default remains `anchor-pair` + `edge-ratio` until experiments show a better pair.
- **Two new generators:**
  - `single-sweep`: for each star in the catalogue as seed, sweep rotations (every 15°) at
    multiple scales (e.g. 5°, 10°, 15°, 20°). Unconstrained — finds any orientation and scale.
  - `any-vertex`: for each star S and each skeleton vertex V, pin V to S and derive rotation from
    S's nearest plausible second star. More diverse than anchor-pair, which only anchors on
    the principal axis endpoints.
- **Two new scorers:**
  - `vertex-fit` (Score A): normalized mean positional error per assigned vertex.
    `loss = mean_i(distanceDeg(star_i, vertex_i_physical) / span)`,
    `score = 1 / (1 + loss)`. Answers: did each star land near its ideal position?
  - `procrustes` (Score B): after Hungarian assignment, find the optimal rigid alignment
    (rotation + scale + translation) between the resulting star positions and the skeleton,
    then measure mean residual distance. Answers: does the connected star graph look like the
    target shape? This scorer may also act as a re-assigner (ICP iterations) — to be decided
    during implementation.
- **Remove hard star-count limits.** `maxConstellationStars` and `minMatchedStars` thresholds are
  removed. All skeleton vertices participate in the assignment and loss; unmatched or poorly
  matched vertices contribute high error naturally. This prevents the truncated-shape problem
  (12-vertex skeleton reduced to 8 stars).
- **Both evaluation scores exposed in `MatchResult`.** `shapeScore` (edge-ratio) and
  `vertexFitScore` (A1) are always computed and returned, regardless of which scorer was used for
  selection. Procrustes residual added as `procrustesScore` when the scorer is `'procrustes'`.
- **Offline test harness.** A fixed 4-word test set (guitar, crown, sword, bunny) runs all
  generator × scorer combinations and produces a comparison report. Computationally expensive runs
  are acceptable for this set.

## Root Causes (Observed After Implementation)

### RC-4: Hungarian algorithm called with more rows than columns (n > m bug)

When any-vertex places physVerts in sparse sky regions, the nearby star pool collected in Phase 3
can be smaller than the number of skeleton vertices (`nearby.length < nVtx`). The Jonker-Volgenant
Hungarian implementation requires `n ≤ m` (rows ≤ columns). When `n > m` the algorithm corrupts
its internal state, often assigning the same 2–3 stars to every vertex. All skeleton edges then
draw the same one or two star connections — the "one line" result observed for any-vertex on eagle.
**Fix**: add an `n ≤ m` guard before calling hungarianAssign; skip candidates where
`nearby.length < nVtx`.

### RC-5: Phase 3 search radius fixed regardless of skeleton density

Phase 3 collects stars within a fixed 3° radius (expanding to 6°) around each vertex. For complex
skeletons with many closely-spaced vertices (guitar body: 10 vertices in ~4°, ≈0.4° spacing), all
vertices draw from the same pool of nearby stars. Hungarian assigns those few stars across all
vertices, producing a tight cluster regardless of the intended shape. The scores reward compact
bodies even when they represent only a subset of the skeleton.
**Fix**: make the search radius proportional to the median inter-vertex spacing of the skeleton:
`radius = max(1.5°, interVertexSpacing * 1.5)`.

### RC-6: Single-sweep scale range too narrow

The four candidate scales [5°, 10°, 15°, 20°] are applied to `span / maxAxisDist`, where
`maxAxisDist` is the normalised skeleton diameter (~0.9). For a guitar at the natural star-field
scale of ~25°, none of the four discrete scales sample near that value. The algorithm never
evaluates the placement that would actually fit. Adding scales 25° and 30° covers larger
constellations without meaningfully increasing runtime (the same 2000-candidate cap applies).
**Fix**: extend SCALES_DEG to `[5, 10, 15, 20, 25, 30]`.

### RC-7: any-vertex rotation derived from a single arbitrary star pair

For each (seed S, vertex V) pair, rotation is determined by aligning V's nearest skeleton-neighbour
direction to the sky direction S→T, where T is the nearest sky star within 15°. T is effectively
arbitrary — it is not constrained to be near the expected edge length. A skeleton edge of 0.1
normalised units mapped to a 10° star separation gives physScale = 100°, placing the entire
constellation at an absurd size. Conversely a 0.2° star separation gives physScale = 2°, far too
small. The majority of (S, V) placements produced are garbage, so even if a few good placements
exist they are swamped by random Phase 1 noise.
**Fix**: enumerate all skeleton neighbours of V (not just nearest), cap physScale to [2°, 30°],
and skip pairs where the derived scale falls outside that range.

### RC-8: No maximum constellation span enforced at any stage

The proposed scale clamping for `any-vertex` (clip physScale to [2°, 30°] per normalised unit)
does not bound the *total span* because the skeleton's normalised diameter (maxAxisDist ≈ 0.9)
multiplies that physScale. A short skeleton edge (normalised length 0.05 units) aligned to a 4°
star separation gives physScale = 80°/unit → total span ≈ 72°. The 79° eagle result is this
case exactly.

The correct guard is on `expectedSpan = physScale × maxAxisDist`. This check must occur in each
generator's Phase 1 loop (skip before prescreen) AND as a final validation in `match()` (discard
the result if `maxPairwiseAngularDist(constellationStars) > maxSpanDeg`). With neither guard, the
matcher can return and the frontend can display a constellation that spans most of the visible sky.

**Fix**: enforce `expectedSpan ≤ maxSpanDeg` (default 40°, ≈1.6× Orion) in every generator's
candidate loop; also validate the winner in `match()` and return null if exceeded.

### RC-9: patchRA/patchDec is the seed star position, not the constellation centroid

`match()` sets `patchRA/patchDec` to the seed star's coordinates. For `any-vertex`, the seed is
pinned to one skeleton vertex, so the centroid of the placed constellation can be far from the
seed. For `anchor-pair`, the seed is one endpoint of the principal axis; the opposite end is
15–25° away. For `single-sweep`, the seed is the skeleton centroid — this one is fine.

The test harness collects `patchStars` within a fixed 10° radius of `patchRA/patchDec`. For
off-centre placements, constellation stars outside that radius are absent from `starById` and
their edges are silently not drawn. This explains the sparse renderings beyond the n>m bug.

**Fix**: return the centroid of `physVerts` (mean RA, mean Dec) as `patchRA/patchDec` rather
than the seed star position. The seed star ID is already tracked separately for `excludeSeeds`.
Additionally, the harness should compute the display radius dynamically:
`max(PATCH_RADIUS_DEG, angularSize × 0.7)` so larger constellations fill the panel.

---

## Root Causes (Original)

### RC-1: Anchor pair over-constrains placement

Aligning the principal axis to a specific star pair forces both scale and rotation to be derived
from that pair. If the best constellation has its principal axis not aligned to any real star pair,
it is never found. The new generators explore the full placement space more freely.

### RC-2: Single score conflates assignment quality with shape fidelity

The edge-length ratio score measures proportion preservation but not whether stars ended up near
their intended positions. A constellation can score 90% on edge-ratio while having every star
offset by 3° from its vertex. The dual scores (vertex-fit + edge-ratio or Procrustes) separate
these two concerns.

### RC-3: Hard caps hide poor coverage

`maxConstellationStars = 8` silently drops vertices on complex skeletons. A 15-vertex guitar
skeleton rendered with 8 stars looks like a different shape. Removing caps forces the loss to
account for the whole skeleton.

## Not In Scope

- Second-star selection strategy in `any-vertex` generator — deferred, to be designed when
  implementing that generator
- Runtime multi-strategy arbitration (running several generators at query time and picking best) —
  offline comparison first, promote winner to default
- Phase-level `keepTop` tuning exposed as config — use sensible hardcoded defaults until a
  specific bottleneck is identified
- Constellation chain stars along edges (filling in intermediate stars between vertices)

## What Changes (Amendments After Permutation Run)

- **Phase 3 n>m guard**: `runPhase2And3` skips any candidate where `nearby.length < nVtx` before
  calling `hungarianAssign`. This prevents corrupted assignments and the "all edges = one line"
  failure mode.
- **Dynamic Phase 3 search radius**: radius per vertex set to
  `max(1.5°, interVertexSpacing × 1.5)` where `interVertexSpacing` is the median physical edge
  length of the skeleton at the candidate's scale. Replaces the fixed 3° / 6° radii.
- **Extended single-sweep scale range**: SCALES_DEG extended from `[5, 10, 15, 20]` to
  `[5, 10, 15, 20, 25, 30]`.
- **any-vertex multi-neighbour sweep**: for each (S, V) pair, enumerate all of V's skeleton
  neighbours (not just nearest); derive physScale from the expected total span
  (`physScale × maxAxisDist`), skip if outside [2°, maxSpanDeg].
- **Maximum constellation span constraint**: new `maxSpanDeg` config field (default 40°).
  Generators skip candidates where `expectedSpan > maxSpanDeg` during Phase 1. `match()` discards
  the winner if `maxPairwiseAngularDist(constellationStars) > maxSpanDeg`.
- **Constellation centroid as patch centre**: `patchRA/patchDec` in `MatchResult` set to the
  centroid of `physVerts` (mean RA/Dec), not the seed star position. Seed star ID tracked
  separately for `excludeSeeds`.
- **Adaptive display radius in test harness**: `patchStars` collected within
  `max(PATCH_RADIUS_DEG, angularSize × 0.7)` of the patch centre; `renderPatch` projection
  radius updated to match.
- **Per-match diagnostic logging**: after each match, save a `diagnostics.json` alongside
  `results.json` recording: generator, scorer, phase candidate counts, winning physVerts,
  seed star position, per-vertex assignment (star ID, distance, distance/span), nearbyStarCount,
  and all three scores. This enables offline inspection of exactly what the algorithm chose and why.

## Capabilities

### New Capabilities

- `matcher-generator`: pluggable placement generator, selectable via `MatcherConfig.generator`
- `constellation-evaluation`: dual scores (`shapeScore`, `vertexFitScore`, `procrustesScore`)
  computed and returned in `MatchResult`
- `match-diagnostics`: per-run JSON log with full per-vertex assignment detail, phase counts,
  and winning candidate position — written to `reports/{runId}/diagnostics.json`

### Modified Capabilities

- `star-matching`: `generator` + `scorer` config replaces fixed pipeline; no hard star-count caps
- `test-harness`: offline comparison report across generator × scorer combinations on 4-word set

## Impact

- `frontend/src/matcher.ts` — `MatcherConfig` extended; new generator functions; new scorer
  functions; `maxConstellationStars` / `minMatchedStars` removed; `MatchResult` extended
- `frontend/src/types.ts` — `MatchResult` gains `shapeScore`, `vertexFitScore`, optional
  `procrustesScore`
- `test-harness/run.ts` — comparison report across generator × scorer combinations
