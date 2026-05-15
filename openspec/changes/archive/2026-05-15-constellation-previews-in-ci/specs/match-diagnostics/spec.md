## ADDED Requirements

### Requirement: MatchResult exposes diversity-selection metrics
`MatchResult` in `lambda/src/types.ts` SHALL gain five optional fields populated by `match()` whenever a match is found:

- `selectedScore?: number` — composite score of the selected placement (may differ from `topScore` when diversity selection chose a sky-distant candidate)
- `topScore?: number` — composite score of the highest-scoring candidate in the pool
- `nextBestScore?: number` — composite score of the second-highest candidate in the pool (undefined if pool has only one entry)
- `acceptableCount?: number` — number of candidates with `score >= topScore * (1 - DIVERSITY_TOLERANCE)` (the acceptable band)
- `distantCount?: number` — number of acceptable candidates whose sky centre is ≥ `DIVERSITY_MIN_DEG` from the champion

These fields SHALL be populated from the values already computed in the diversity-selection block of `match()` (pool sort, acceptable filter, distant filter) with no additional algorithmic work.

#### Scenario: All five fields present on successful match
- **WHEN** `match()` returns a non-null result
- **THEN** `selectedScore`, `topScore`, `acceptableCount`, and `distantCount` are all defined non-negative numbers

#### Scenario: nextBestScore undefined for single-candidate pool
- **WHEN** the pool contains exactly one candidate after Phase 3
- **THEN** `nextBestScore` is undefined

#### Scenario: selectedScore equals topScore when diversity not applied
- **WHEN** no distant acceptable candidates exist and the champion is selected
- **THEN** `selectedScore === topScore`

#### Scenario: selectedScore less than topScore when diversity applied
- **WHEN** a distant acceptable candidate is selected over the champion
- **THEN** `selectedScore < topScore` and `distantCount >= 1`

### Requirement: WordDiagnostic carries diversity-selection fields
The `WordDiagnostic` record written by the test harness SHALL include the five new `MatchResult` fields when available: `selectedScore`, `topScore`, `nextBestScore`, `acceptableCount`, `distantCount`. These SHALL be passed through from `MatchResult` in `run.ts` and written to `diagnostics.json`.

#### Scenario: Diagnostics include score fields on match
- **WHEN** a word is matched and diagnostics are written
- **THEN** the `WordDiagnostic` record for that word includes non-null `selectedScore`, `topScore`, `acceptableCount`, and `distantCount`
