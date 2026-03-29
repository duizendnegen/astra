## ADDED Requirements

### Requirement: Deterministic bright-star seed sweep
The system SHALL sweep all stars with magnitude ≤ `SEED_MAX_MAG` (3.0) as candidate seed centres, in ascending magnitude order (brightest first). For each seed, all catalogue stars within `PATCH_RADIUS_DEG` (30°) SHALL be gathered as candidates. All rotation steps SHALL be tested per seed.

#### Scenario: Sweep covers bright regions deterministically
- **WHEN** matching begins
- **THEN** every star at mag ≤ 3 is used as a seed, with no random sampling

#### Scenario: Seed neighbourhood gathered by radius
- **WHEN** a seed star is selected
- **THEN** all catalogue stars within 30° haversine distance are used as candidates

### Requirement: 60% coverage acceptance threshold
The system SHALL accept a match when the edge-coverage score (matched stars / total candidates) is ≥ `COVERAGE_THRESHOLD` (0.60) AND the matched star count is ≥ `MIN_MATCHED_STARS` (6). If no seed produces a match above threshold, the best-scoring result across all seeds SHALL be returned.

#### Scenario: Match accepted above threshold
- **WHEN** the edge-coverage score is ≥ 0.60 and matched count is ≥ 6
- **THEN** the match is accepted immediately and the sweep stops

#### Scenario: No seed exceeds threshold
- **WHEN** all 179 seeds are exhausted without a match above threshold
- **THEN** the best-scoring result found across all seeds is returned

### Requirement: Matched output includes HYG star IDs
The system SHALL return `stars` (all on-pattern matched stars ordered by effective distance), `constellationStars` (up to 8 vertex-anchored stars selected per the constellation-star-selection capability), the edge list from the skeleton, and the seed star's RA/Dec as the patch centre. An optional `variantIndex` SHALL indicate which skeleton variant produced the result.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains `stars` (full on-pattern set), `constellationStars` (up to 8), skeleton edges, patch centre RA/Dec, and optional `variantIndex`

### Requirement: match() accepts skeleton array
The `match()` function SHALL accept `skeletons: Skeleton[]` instead of a single `Skeleton`. It SHALL run the full seed sweep for each skeleton and return the `MatchResult` with the highest score across all variants.

#### Scenario: Single skeleton array
- **WHEN** `match()` is called with one skeleton
- **THEN** behaviour is identical to the previous single-skeleton interface

#### Scenario: Multiple skeletons compared
- **WHEN** `match()` is called with 3 skeletons
- **THEN** all 3 are evaluated and the highest-scoring result is returned

### Requirement: Skeleton y-coordinates negated before matching
The system SHALL negate skeleton y-coordinates (`y → −y`) before rotation and normalisation in `scoreAndMatch()` to correct for the LLM's screen-space coordinate convention (y=0 top) vs the sky's Dec-increasing-upward convention.

#### Scenario: Right-side-up constellation
- **WHEN** a skeleton describes a figure with head at top (y=0) and feet at bottom (y=1)
- **THEN** the matched constellation appears with head toward higher declination (upward in the sky view)

### Requirement: Constellation size logged as % of Orion
After a match is found, the system SHALL compute the maximum pairwise haversine distance between all matched stars and log it as a percentage of `ORION_SPAN_DEG` (25°).

#### Scenario: Size logged after successful match
- **WHEN** a match is returned
- **THEN** the console logs the angular span and its percentage of 25°, e.g. `[matcher] pattern size: 18.3° (73% of Orion)`
