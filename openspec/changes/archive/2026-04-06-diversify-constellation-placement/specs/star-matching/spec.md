## MODIFIED Requirements

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
