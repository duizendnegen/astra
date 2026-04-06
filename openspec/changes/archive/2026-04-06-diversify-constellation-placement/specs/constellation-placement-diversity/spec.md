## ADDED Requirements

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
