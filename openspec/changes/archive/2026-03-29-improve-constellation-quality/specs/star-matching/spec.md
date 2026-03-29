## MODIFIED Requirements

### Requirement: Matched output includes HYG star IDs
The system SHALL return `stars` (all on-pattern matched stars ordered by effective distance), `constellationStars` (up to 8 vertex-anchored stars selected per the constellation-star-selection capability), the edge list from the skeleton, and the seed star's RA/Dec as the patch centre. An optional `variantIndex` SHALL indicate which skeleton variant produced the result.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains `stars` (full on-pattern set), `constellationStars` (up to 8), skeleton edges, patch centre RA/Dec, and optional `variantIndex`

## ADDED Requirements

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
