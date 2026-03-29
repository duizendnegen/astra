## Requirements

### Requirement: match() accepts skeleton array
The `match()` function SHALL accept `skeletons: Skeleton[]` and an optional fourth parameter `config?: MatcherConfig`. When `config` is omitted, the function SHALL behave identically to passing `{ model: 'vertex' }`.

#### Scenario: No config defaults to vertex model
- **WHEN** `match(catalogue, skeletons)` is called without a config argument
- **THEN** the result is identical to calling with `{ model: 'vertex' }`

#### Scenario: Model is selected by string
- **WHEN** `match(catalogue, skeletons, excludeSeeds, { model: 'simple' })`
- **THEN** the simple scoring model is used for all candidate evaluation in this call

#### Scenario: Constants overridable without changing model
- **WHEN** `match(catalogue, skeletons, excludeSeeds, { model: 'vertex', rotationSteps: 24 })`
- **THEN** the vertex scoring model is used with 24 rotation steps instead of the model default

#### Scenario: Multiple skeletons compared
- **WHEN** `match()` is called with 3 skeletons
- **THEN** all 3 are evaluated and the highest-scoring result is returned

### Requirement: Deterministic bright-star seed sweep
The system SHALL sweep all stars with magnitude ≤ `seedMaxMag` (from ResolvedConfig) as candidate seed centres, in ascending magnitude order. For each seed, all catalogue stars within `patchRadius` (from ResolvedConfig) SHALL be gathered as candidates. All rotation steps (count from `rotationSteps` in ResolvedConfig) SHALL be tested per seed.

#### Scenario: Sweep covers bright regions deterministically
- **WHEN** matching begins
- **THEN** every star at mag ≤ seedMaxMag is used as a seed with no random sampling

#### Scenario: rotationSteps override changes sweep granularity
- **WHEN** `match()` is called with `{ model: 'vertex', rotationSteps: 24 }`
- **THEN** 24 rotation orientations are tested per seed (every 15°) instead of the model default 12 (every 30°)

### Requirement: Quality threshold acceptance
The system SHALL accept a match when the score meets or exceeds `qualityThreshold` (from ResolvedConfig) and the matched star count meets or exceeds `minMatchedStars` (from ResolvedConfig). If no seed produces a qualifying match, the best-scoring result across all seeds SHALL be returned.

#### Scenario: qualityThreshold override changes acceptance bar
- **WHEN** `match()` is called with `{ model: 'spread', qualityThreshold: 0.70 }`
- **THEN** a match scoring 0.72 is accepted, whereas the default threshold of 0.80 would have rejected it

### Requirement: Skeleton y-coordinates negated before matching
The system SHALL negate skeleton y-coordinates (`y → −y`) before rotation and normalisation in `scoreAndMatch()` to correct for the LLM's screen-space coordinate convention (y=0 top) vs the sky's Dec-increasing-upward convention. This requirement is unchanged across all models.

#### Scenario: Right-side-up constellation
- **WHEN** a skeleton describes a figure with head at top (y=0) and feet at bottom (y=1)
- **THEN** the matched constellation appears with head toward higher declination regardless of which model is active

### Requirement: Matched output includes HYG star IDs
The system SHALL return `stars` (all on-pattern matched stars ordered by effective distance), `constellationStars` (up to `maxConstellationStars` vertex-anchored stars selected per the constellation-star-selection capability), the edge list from the skeleton, and the seed star's RA/Dec as the patch centre. An optional `variantIndex` SHALL indicate which skeleton variant produced the result.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains `stars` (full on-pattern set), `constellationStars`, skeleton edges, patch centre RA/Dec, and optional `variantIndex`

### Requirement: Constellation size logged as % of Orion
After a match is found, the system SHALL compute the maximum pairwise haversine distance between all matched stars and log it as a percentage of `ORION_SPAN_DEG` (25°).

#### Scenario: Size logged after successful match
- **WHEN** a match is returned
- **THEN** the console logs the angular span and its percentage of 25°, e.g. `[matcher] pattern size: 18.3° (73% of Orion)`
