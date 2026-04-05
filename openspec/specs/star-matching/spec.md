## Requirements

### Requirement: match() accepts skeleton array
The `match()` function SHALL accept `skeletons: Skeleton[]`, a `catalogue: Star[]` parameter,
an optional `excludeSeeds?: Set<number>` parameter, and an optional `config?: MatcherConfig`.
When `config` is omitted, defaults from `BASE_DEFAULTS` are used.
The function SHALL evaluate all skeletons via the pairwise anchor search pipeline and return the
highest-scoring result, or null if no result is found. Anchor stars whose HYG ID is in
`excludeSeeds` SHALL be skipped in Phase 1.

#### Scenario: Multiple skeletons compared
- **WHEN** `match()` is called with 3 skeletons
- **THEN** all 3 are evaluated and the skeleton with the highest edge-length ratio score wins

#### Scenario: Config constants overridable
- **WHEN** `match()` is called with `{ seedMaxMag: 4 }`
- **THEN** stars with magnitude ≤ 4 are used as primary anchors in Phase 1

#### Scenario: excludeSeeds skips anchors
- **WHEN** `match()` is called with `excludeSeeds` containing HYG ID 27989 (Betelgeuse)
- **THEN** Betelgeuse is not used as a primary or secondary anchor in Phase 1

### Requirement: SpatialGrid for O(1) star proximity
A `SpatialGrid` class SHALL index all catalogue stars in 2°×2° cells using a hash-map backing
store. It SHALL provide:
- `inRadius(ra, dec, radius)`: multi-cell scan returning all stars within the radius
- `nearest(ra, dec, maxRadius, used)`: nearest unassigned star within radius
- `hasStarNear(ra, dec)`: O(1) single-cell occupancy check with no distance computation

One `SpatialGrid` SHALL be constructed per `match()` call and shared across all skeletons.

#### Scenario: hasStarNear is O(1)
- **WHEN** checking vertex coverage during Phase 1 prescreen
- **THEN** a single cell-map lookup is performed, not a distance computation

### Requirement: Pairwise anchor search via three-phase pipeline
The matching pipeline SHALL use pairwise anchor search across three phases.

**Phase 1 — Cell-coverage prescreen:** For each primary anchor A (mag ≤ `seedMaxMag`) and each
neighbour B (mag ≤ 5.0, within 25°), the scale and rotation aligning the skeleton principal axis to
the A→B vector SHALL be computed. Physical vertex positions SHALL be computed in a reusable
in-place buffer (zero allocation per candidate). Prescreen score SHALL be
`coveredVertices / cappedVertices` using `hasStarNear` for each vertex. The top 500 candidates
SHALL be retained via batch-trim sort (sort only when buffer reaches 1000, not per insertion).

**Phase 2 — Greedy edge-length score:** For the top 500 × 10 Phase 1 candidates, greedy
nearest-neighbour assignment (3° fixed radius, `SpatialGrid.nearest`) SHALL be run per vertex.
Score SHALL be `1 / (1 + mean(|starEdgeLen/skelEdgeLen − 1|))` over skeleton edges. Top 50
SHALL advance to Phase 3.

**Phase 3 — Hungarian refinement:** For the top 20 Phase 2 candidates, the K=20 nearest stars per
vertex SHALL be gathered into a union set (expanding to 6° if fewer than K found). A cost matrix
of `distance + brightnessWeight × (mag / 6)` SHALL be built and solved with the Hungarian algorithm
(Jonker-Volgenant). The final score SHALL be the edge-length ratio on the Hungarian assignment.
The globally best result across all Phase 3 candidates SHALL be returned.

#### Scenario: Principal axis from maximum pairwise distance
- **WHEN** a skeleton is evaluated
- **THEN** the vertex pair with maximum pairwise distance defines the principal axis; skeletons where this distance is < 0.01 (normalised) return null

#### Scenario: Phase 1 batch-trim amortises sort cost
- **WHEN** the candidate buffer grows beyond 1000 entries
- **THEN** it is sorted and trimmed to 500 — sort does not run per-insertion

#### Scenario: Phase 3 assigns exactly one star per vertex
- **WHEN** a candidate completes Phase 3
- **THEN** one star is optimally assigned to each skeleton vertex (up to `maxConstellationStars`) via Hungarian algorithm

### Requirement: Matched output includes HYG star IDs
The system SHALL return `stars` (the Phase 3 nearby star pool), `constellationStars` (Hungarian-
assigned stars in skeleton vertex index order), the skeleton's edge list, and the winning anchor
star's RA/Dec as patch centre. An optional `variantIndex` SHALL indicate which skeleton variant
produced the result.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains `stars` (Phase 3 candidate pool), `constellationStars` (one per vertex, in vertex order), skeleton edges, patch centre RA/Dec, and `variantIndex`

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
