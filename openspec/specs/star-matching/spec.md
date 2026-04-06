## Requirements

### Requirement: match() accepts skeleton array
The `match()` function SHALL accept `skeletons: Skeleton[]`, a `catalogue: Star[]` parameter,
an optional `excludeSeeds?: Set<number>` parameter, and an optional `config?: MatcherConfig`.
When `config` is omitted, defaults from `BASE_DEFAULTS` are used.
The function SHALL evaluate all skeletons using the generator and scorer specified in `config`
(defaulting to `'anchor-pair'` and `'edge-ratio'`) and return the highest-scoring result, or null
if no result is found. Anchor stars whose HYG ID is in `excludeSeeds` SHALL be skipped in Phase 1
for generators that use anchor pairs.

#### Scenario: Multiple skeletons compared
- **WHEN** `match()` is called with 3 skeletons
- **THEN** all 3 are evaluated and the skeleton with the highest scorer-selected score wins

#### Scenario: Config constants overridable
- **WHEN** `match()` is called with `{ model: 'vertex-penalty', seedMaxMag: 4 }`
- **THEN** stars with magnitude ≤ 4 are used as primary anchors in Phase 1

#### Scenario: excludeSeeds skips anchors
- **WHEN** `match()` is called with `excludeSeeds` containing HYG ID 27989 (Betelgeuse)
- **THEN** Betelgeuse is not used as a primary anchor

#### Scenario: Generator and scorer default to existing pipeline
- **WHEN** `match()` is called with `{ model: 'vertex-penalty' }` (no generator/scorer)
- **THEN** behaviour is identical to pre-change (`anchor-pair` + `edge-ratio`)

### Requirement: Pairwise anchor search via three-phase pipeline
The matching pipeline SHALL use pairwise anchor search across three phases when
`generator === 'anchor-pair'` (or when generator is omitted).

**Phase 1 — Cell-coverage prescreen:** For each primary anchor A (mag ≤ `seedMaxMag`) and each
neighbour B (mag ≤ 5.0, within 25°), the scale and rotation aligning the skeleton principal axis to
the A→B vector SHALL be computed. Physical vertex positions SHALL be computed in a reusable
in-place buffer (zero allocation per candidate). Prescreen score SHALL be
`coveredVertices / totalVertices` using `hasStarNear` for each vertex. The top 500 candidates
SHALL be retained via batch-trim sort (sort only when buffer reaches 1000, not per insertion).

**Phase 2 — Greedy edge-length score:** For the top 500 × 10 Phase 1 candidates, greedy
nearest-neighbour assignment (3° fixed radius, `SpatialGrid.nearest`) SHALL be run per vertex.
Score SHALL be `1 / (1 + mean(|starEdgeLen/skelEdgeLen − 1|))` over skeleton edges. Top 50
SHALL advance to Phase 3.

**Phase 3 — Hungarian refinement:** For the top 20 Phase 2 candidates, the K=20 nearest stars per
vertex SHALL be gathered into a union set (expanding to 6° if fewer than K found). A cost matrix
of `distance + brightnessWeight × (mag / 6)` SHALL be built and solved with the Hungarian
algorithm (Jonker-Volgenant). The selected scorer then ranks Phase 3 candidates. `runPhase2And3`
SHALL return ALL Phase 3 candidates in descending score order (not just the best). `match()` SHALL
apply diversity selection across the combined candidate pool from all skeleton variants before
returning a result.

#### Scenario: Principal axis from maximum pairwise distance
- **WHEN** a skeleton is evaluated
- **THEN** the vertex pair with maximum pairwise distance defines the principal axis; skeletons where this distance is < 0.01 (normalised) return null

#### Scenario: Phase 1 batch-trim amortises sort cost
- **WHEN** the candidate buffer grows beyond 1000 entries
- **THEN** it is sorted and trimmed to 500 — sort does not run per-insertion

#### Scenario: Phase 3 assigns exactly one star per vertex
- **WHEN** a candidate completes Phase 3
- **THEN** one star is optimally assigned to each skeleton vertex via Hungarian algorithm

#### Scenario: All Phase 3 candidates returned
- **WHEN** `runPhase2And3` evaluates 20 Phase 3 candidates
- **THEN** it returns all 20 results in descending score order, not just the top-1

### Requirement: Phase 3 skips candidates where nearby star count < vertex count (n>m guard)
`runPhase2And3` SHALL skip any Phase 3 candidate where `nearby.length < nVtx` before calling
`hungarianAssign`. The Jonker-Volgenant implementation requires `n ≤ m`; calling it with `n > m`
corrupts the assignment, mapping multiple vertices to the same star and rendering all skeleton
edges as a single line.

#### Scenario: Sparse sky candidate skipped
- **WHEN** a candidate placement has only 4 stars in the nearby union set and the skeleton has 7 vertices
- **THEN** the candidate is skipped without calling hungarianAssign

#### Scenario: Sufficient stars proceed normally
- **WHEN** a candidate has 10 nearby stars and the skeleton has 7 vertices
- **THEN** Hungarian is called on a 7×10 cost matrix and assigns each vertex a unique star

### Requirement: Phase 3 search radius proportional to inter-vertex spacing
The per-vertex search radius in Phase 3 SHALL be `max(1.5°, medianEdgeLength × 1.5)`, where
`medianEdgeLength` is the median of all physical edge lengths (in degrees) for the candidate
placement. The fixed 3° / 6° radii are removed. This prevents dense skeletons (many closely-
spaced vertices) from collapsing to a single shared star pool across all vertices.

#### Scenario: Dense skeleton gets tight radius
- **WHEN** a guitar-like skeleton at 20° span has median edge length ≈ 1.3°
- **THEN** per-vertex radius = max(1.5°, 1.95°) = 1.95°

#### Scenario: Sparse skeleton gets wider radius
- **WHEN** a triangle at 10° span has median edge length ≈ 5°
- **THEN** per-vertex radius = max(1.5°, 7.5°) = 7.5°

#### Scenario: Minimum radius clamped at 1.5°
- **WHEN** physScale produces median edge length < 1°
- **THEN** search radius is 1.5°

### Requirement: maxSpanDeg enforced on candidate expected span and on final result

`MatcherConfig` SHALL include `maxSpanDeg?: number` (default 40°). Every generator SHALL skip
Phase 1 candidates where `physScale × maxAxisDist > cfg.maxSpanDeg`. `match()` SHALL additionally
discard the winning candidate if `maxPairwiseAngularDist(constellationStars) > cfg.maxSpanDeg`
and return null. This prevents both 79°-class placements from advancing through the pipeline and
edge cases where the final star assignment happens to be larger than expected.

#### Scenario: Oversized candidate skipped in Phase 1
- **WHEN** `any-vertex` computes a placement with expectedSpan = 79° and `maxSpanDeg = 40°`
- **THEN** the candidate is not prescreened and never reaches Phase 2

#### Scenario: Final result discarded if oversized
- **WHEN** the winning Phase 3 result has `maxPairwiseAngularDist(constellationStars) = 45°` and `maxSpanDeg = 40°`
- **THEN** `match()` returns null rather than returning the oversized result

#### Scenario: Legitimate large constellation accepted
- **WHEN** a guitar match at 28° span is found with `maxSpanDeg = 40°`
- **THEN** `match()` returns it normally

### Requirement: patchRA/patchDec is the physVerts centroid, not the seed star

`match()` SHALL set `patchRA` to the arithmetic mean RA of `physVerts` and `patchDec` to the
arithmetic mean Dec of `physVerts` of the winning candidate. The seed star ID is still added to
`excludeSeeds` before this computation. For `single-sweep` (seed at skeleton centroid) this
changes nothing observable; for `anchor-pair` and `any-vertex` it moves the patch centre to the
constellation centre.

#### Scenario: anchor-pair patch centre at constellation centroid
- **WHEN** `anchor-pair` finds a guitar match with seed at one axis endpoint (RA=102°, Dec=8°) and physVerts centroid at (98°, 6°)
- **THEN** `result.patchRA = 98°, result.patchDec = 6°`

### Requirement: Matched output includes HYG star IDs
The system SHALL return `stars` (the Phase 3 nearby star pool), `constellationStars` (Hungarian-
assigned stars in skeleton vertex index order), the skeleton's edge list, and the winning anchor
star's RA/Dec as patch centre. An optional `variantIndex` SHALL indicate which skeleton variant
produced the result.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains `stars`, `constellationStars`, skeleton edges, patch centre RA/Dec,
  `variantIndex`, `shapeScore`, and `vertexFitScore`

### Requirement: Constellation size logged as % of Orion
After a match is found, the system SHALL compute the maximum pairwise haversine distance between
all `constellationStars` and log it as a percentage of `ORION_SPAN_DEG` (25°).

#### Scenario: Size logged after successful match
- **WHEN** a match is returned
- **THEN** the console logs the angular span and percentage, e.g. `[matcher] pattern size: 18.3° (73% of Orion)`

## Removed Requirements

### Requirement: Client-side catalogue loading
**Reason**: The star catalogue is now loaded server-side. The frontend no longer needs `stars.json`.
**Migration**: Remove `loadCatalogue()` and `getCatalogue()` calls from `frontend/src/main.ts`.
The `loadConstellationLines()` function in `frontend/src/catalogue.ts` is unaffected and remains.

### Requirement: Client-side match() call
**Reason**: Matching now runs in the backend as part of `/api/constellation`. The frontend
receives a ready-to-render `constellation` result directly.
**Migration**: Remove the `import { match } from './matcher'` import and the `match()` call
from `frontend/src/main.ts`. Delete `frontend/src/matcher.ts`.

### Requirement: maxConstellationStars cap
**Reason**: Hard cap silently drops vertices on complex skeletons, causing the rendered shape to
differ from the target. Unmatched vertices now contribute high cost in the Hungarian cost matrix naturally.
**Migration**: Remove `maxConstellationStars` from `MatcherConfig` and all internal uses. Remove
`--max-constellation-stars` from `test-harness/run.ts` CLI parsing.

### Requirement: minMatchedStars threshold
**Reason**: Replaced by the scorer loss: poor coverage results in a high loss score and the
candidate is naturally ranked below better-coverage alternatives.
**Migration**: Remove `minMatchedStars` from `MatcherConfig` and all internal uses. Remove
`--min-matched-stars` from `test-harness/run.ts` CLI parsing.
