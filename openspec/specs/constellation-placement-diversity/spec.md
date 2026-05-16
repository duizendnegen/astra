## Requirements

### Requirement: Diversity selection prefers sky-distant acceptable candidates
`match()` SHALL apply a diversity selection step after collecting all Phase 3 candidates across
all skeleton variants. The step SHALL:

1. Identify the top candidate by score (`topResult`).
2. Compute `acceptable` as all candidates where `score >= topResult.score * (1 - DIVERSITY_TOLERANCE)`, where `DIVERSITY_TOLERANCE = 0.10`.
3. Compute `distant` as all acceptable candidates where `distanceDeg(candidate.patchRA, candidate.patchDec, topResult.patchRA, topResult.patchDec) >= DIVERSITY_MIN_DEG`, where `DIVERSITY_MIN_DEG = 30`.
4. If `distant` is non-empty, return a uniformly random element from `distant`.
5. Otherwise, return `topResult`.

#### Scenario: Distant acceptable candidate preferred
- **WHEN** the top candidate scores 0.87 at (RA=102°, Dec=-17°) and a second candidate scores 0.84 at (RA=219°, Dec=+45°)
- **THEN** the second candidate is within 10% tolerance and 30°+ distant, so it is eligible for random selection

#### Scenario: Close acceptable candidate not preferred
- **WHEN** the top candidate scores 0.87 at (RA=102°, Dec=-17°) and a second candidate scores 0.86 at (RA=108°, Dec=-14°)
- **THEN** the second candidate is within 10% tolerance but only ~7° distant, so it is excluded from the distant pool and the top candidate is returned

#### Scenario: No distant candidate falls back to top
- **WHEN** all acceptable candidates are within 30° of the top match position
- **THEN** `match()` returns the top-scoring candidate unchanged

#### Scenario: Out-of-tolerance candidate never selected
- **WHEN** a candidate scores 0.75 and the top score is 0.87 (gap > 10%)
- **THEN** that candidate is not in `acceptable` and cannot be selected by diversity logic

### Requirement: Diversity constants are named and tunable
The tolerance and distance threshold SHALL be defined as named module-level constants
(`DIVERSITY_TOLERANCE` and `DIVERSITY_MIN_DEG`) rather than inline magic numbers,
so they can be adjusted without searching the hot path.

#### Scenario: Constants defined at module scope
- **WHEN** the matcher module is loaded
- **THEN** `DIVERSITY_TOLERANCE = 0.10` and `DIVERSITY_MIN_DEG = 30` are accessible as named constants

### Requirement: Phase 3 candidate pool is constructed with geographic spread
`runPhase2And3` SHALL select Phase 3 candidates using a greedy spatial-spread loop rather than
a plain score-sorted slice. The loop SHALL:

1. Iterate over Phase 2 candidates in descending score order.
2. Compute the centroid (`patchRA`, `patchDec`) of each candidate's `physVerts`.
3. Accept a candidate if its centroid is ≥ `PHASE3_MIN_SEP_DEG` from every already-accepted candidate's centroid, where `PHASE3_MIN_SEP_DEG = 30`.
4. If no distant candidate remains and the pool is not yet full (`HUNGARIAN_K`), fill remaining slots with the best-scoring remaining candidates regardless of distance.
5. Stop when `HUNGARIAN_K` candidates are accepted or the Phase 2 output is exhausted.

#### Scenario: Top candidate always included
- **WHEN** Phase 2 produces any ranked candidates
- **THEN** the highest-scoring candidate is always the first entry in the Phase 3 pool

#### Scenario: Second candidate placed ≥30° from first
- **WHEN** Phase 2 contains a second candidate whose centroid is ≥30° from the top candidate's centroid and whose score is within the top portion of the ranking
- **THEN** that candidate is included in the Phase 3 pool before any closer candidate of equal or lower rank

#### Scenario: Close candidate skipped when a distant one exists
- **WHEN** Phase 2 contains candidate A (score 0.80, centroid 5° from top) and candidate B (score 0.78, centroid 35° from top)
- **THEN** candidate B is added to the Phase 3 pool before candidate A

#### Scenario: Fallback fills pool when distant candidates are exhausted
- **WHEN** Phase 2 contains fewer than HUNGARIAN_K candidates that are ≥30° from all already-selected entries
- **THEN** remaining Phase 3 slots are filled from the best-scoring remaining candidates regardless of distance, so that Phase 3 always runs at its full budget

#### Scenario: Separation checked against all selected, not just top
- **WHEN** two non-top candidates are both ≥30° from the top but only 10° from each other
- **THEN** only the higher-scoring of the two is added; the lower-scoring one is deferred until no other distant candidates remain
