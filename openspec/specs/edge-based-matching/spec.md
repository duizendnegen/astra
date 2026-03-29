## ADDED Requirements

### Requirement: Stars matched to skeleton edges
The system SHALL compute each candidate star's effective distance as the minimum point-to-segment distance to any skeleton edge in normalised space, modified by an endpoint-weighted vertex proximity bonus. A star SHALL be considered matched if its effective distance is below `DISTANCE_THRESHOLD`.

#### Scenario: Star on edge interior
- **WHEN** a candidate star falls near the midpoint of a skeleton edge
- **THEN** its point-to-segment distance is small and it is counted as matched

#### Scenario: Star near endpoint vertex
- **WHEN** a candidate star falls near a degree-1 (endpoint) skeleton vertex
- **THEN** its effective distance is reduced by the endpoint vertex bonus, making it easier to match than a star at equal geometric distance from a joint vertex

#### Scenario: Star off all edges
- **WHEN** a candidate star's minimum distance to any skeleton edge exceeds `DISTANCE_THRESHOLD`
- **THEN** the star is not counted as matched and is not included in the result set

### Requirement: Endpoint-weighted vertex proximity bonus
The system SHALL apply a Gaussian proximity bonus `(1 - bonus * exp(-d_vtx² / σ²))` to the point-to-segment distance, where `bonus` is `VERTEX_BONUS_ENDPOINT` for degree-1 vertices and `VERTEX_BONUS_JOINT` for degree-2+ vertices, and `σ` is `VERTEX_SIGMA`.

#### Scenario: Bonus stronger at endpoints than joints
- **WHEN** two stars are equidistant from their respective nearest vertices
- **THEN** the star nearest a degree-1 endpoint vertex receives a larger effective distance reduction than the star nearest a degree-2 joint vertex

### Requirement: Edge-coverage score
The system SHALL compute match score as `matched_stars / total_candidates`. No minimum per-edge coverage is required; the global `COVERAGE_THRESHOLD` and `MIN_MATCHED_STARS` constants govern acceptance.

#### Scenario: Score computed correctly
- **WHEN** 8 of 15 candidate stars are within threshold of any edge
- **THEN** the score is 0.533 (8/15)

### Requirement: Matched result is full on-pattern star set
The system SHALL return all stars with effective distance below `DISTANCE_THRESHOLD` as the match result, ordered by match quality (effective distance ascending). The result is not skeleton-indexed and may contain more or fewer stars than the skeleton has points.

#### Scenario: All on-pattern stars returned
- **WHEN** a match is accepted
- **THEN** `MatchResult.stars` contains every candidate star within threshold of any edge, not just one per skeleton point
