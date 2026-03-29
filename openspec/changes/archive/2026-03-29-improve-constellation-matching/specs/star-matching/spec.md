## REMOVED Requirements

### Requirement: Hungarian algorithm patch matching
**Reason**: Replaced by edge-based scoring. Hungarian 1-to-1 vertex assignment produces poor results because skeleton vertices are geometric corners, not star positions. Edge-coverage scoring matches stars to line segments instead.
**Migration**: See `edge-based-matching` capability for the new matching algorithm.

### Requirement: 25° candidate patch selection
**Reason**: Replaced by deterministic bright-star seed sweep.
**Migration**: The system now seeds from all stars at mag ≤ 3 and gathers neighbours within 30° of each seed. See ADDED requirements below.

## MODIFIED Requirements

### Requirement: 60% coverage acceptance threshold
The system SHALL accept a match when the edge-coverage score (matched stars / total candidates) is ≥ `COVERAGE_THRESHOLD` (0.60) AND the matched star count is ≥ `MIN_MATCHED_STARS` (6). If no seed produces a match above threshold, the best-scoring result across all seeds SHALL be returned.

#### Scenario: Match accepted above threshold
- **WHEN** the edge-coverage score is ≥ 0.60 and matched count is ≥ 6
- **THEN** the match is accepted immediately and the sweep stops

#### Scenario: No seed exceeds threshold
- **WHEN** all 179 seeds are exhausted without a match above threshold
- **THEN** the best-scoring result found across all seeds is returned

### Requirement: Matched output includes HYG star IDs
The system SHALL return the HYG star IDs for all on-pattern matched stars, the edge list from the skeleton, and the seed star's RA/Dec as the patch centre. The matched stars array is ordered by effective distance ascending and is not skeleton-indexed.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains HYG star IDs for all on-pattern stars, the skeleton edge list, and the seed RA/Dec as patch centre

## ADDED Requirements

### Requirement: Deterministic bright-star seed sweep
The system SHALL sweep all stars with magnitude ≤ `SEED_MAX_MAG` (3.0) as candidate seed centres, in ascending magnitude order (brightest first). For each seed, all catalogue stars within `PATCH_RADIUS_DEG` (30°) SHALL be gathered as candidates. All rotation steps SHALL be tested per seed.

#### Scenario: Sweep covers bright regions deterministically
- **WHEN** matching begins
- **THEN** every star at mag ≤ 3 is used as a seed, with no random sampling

#### Scenario: Seed neighbourhood gathered by radius
- **WHEN** a seed star is selected
- **THEN** all catalogue stars within 30° haversine distance are used as candidates

### Requirement: Constellation size logged as % of Orion
After a match is found, the system SHALL compute the maximum pairwise haversine distance between all matched stars and log it as a percentage of `ORION_SPAN_DEG` (25°).

#### Scenario: Size logged after successful match
- **WHEN** a match is returned
- **THEN** the console logs the angular span and its percentage of 25°, e.g. `[matcher] pattern size: 18.3° (73% of Orion)`
