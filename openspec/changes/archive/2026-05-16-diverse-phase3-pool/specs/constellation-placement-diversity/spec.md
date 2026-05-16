## ADDED Requirements

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
