## ADDED Requirements

### Requirement: Hungarian algorithm patch matching
The system SHALL match skeleton keypoints to real stars using the Hungarian algorithm (optimal assignment). Matching SHALL run entirely client-side after the skeleton is received. Both the skeleton points and candidate star positions SHALL be normalised to the same unit scale before matching. Rotation tolerance SHALL be applied by testing multiple orientations.

#### Scenario: Skeleton matched to stars
- **WHEN** a skeleton is received from the API
- **THEN** the Hungarian algorithm assigns each skeleton point to a real star in the candidate patch, minimising total distance

#### Scenario: Rotation tolerance applied
- **WHEN** the skeleton is rotated relative to the star pattern
- **THEN** multiple orientations are tested and the best-scoring assignment is used

### Requirement: 25° candidate patch selection
The system SHALL select candidate star patches of 25° radius from the full HYG catalogue. The N brightest stars in the patch SHALL be selected where N approximates the skeleton point count. Patch centres SHALL be sampled until a match scoring ≥ 60% is found.

#### Scenario: Patch with sufficient stars
- **WHEN** a 25° patch is sampled
- **THEN** the N brightest stars (N ≈ skeleton point count) are used as candidates

#### Scenario: Low-density patch rejected
- **WHEN** fewer than the required number of stars exist in a patch
- **THEN** a new patch centre is sampled

### Requirement: 60% coverage acceptance threshold
The system SHALL accept a match when ≥ 60% of skeleton points are matched within a distance threshold after normalisation. If the threshold is not met, a new patch SHALL be sampled and matching retried.

#### Scenario: Match accepted
- **WHEN** ≥ 60% of skeleton points match within threshold
- **THEN** the match is accepted and the matched star set is returned

#### Scenario: Match rejected, retry
- **WHEN** fewer than 60% of skeleton points match within threshold
- **THEN** a new patch centre is sampled and matching retried

### Requirement: Matched output includes HYG star IDs
The system SHALL return the HYG star ID for each matched star, the edge list (as index pairs into the matched star array), and the patch centre (RA/Dec). These values are used for rendering and share link encoding.

#### Scenario: Match result structure
- **WHEN** a successful match is found
- **THEN** the result contains HYG star IDs, edges, and patch centre RA/Dec
