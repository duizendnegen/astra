## Requirements

### Requirement: Stars matched to skeleton edges
The system SHALL compute each candidate star's effective distance as the minimum point-to-segment distance to any skeleton edge in the shared physical frame, modified by the active model's vertex bonus function. A star SHALL be considered matched if its effective distance is below `distanceThreshold` as resolved from the active `ResolvedConfig`. The scoring behaviour SHALL be determined entirely by the active `ScoringModel` — no scoring logic SHALL be hardcoded in `scoreAndMatch`.

#### Scenario: Star on edge interior
- **WHEN** a candidate star falls near the midpoint of a skeleton edge
- **THEN** its point-to-segment distance is small and it is counted as matched

#### Scenario: Star near endpoint vertex
- **WHEN** a candidate star falls near a degree-1 (endpoint) skeleton vertex and the active model is `vertex` or `spread`
- **THEN** its effective distance is reduced by the Gaussian endpoint bonus

#### Scenario: Simple model applies no vertex bonus
- **WHEN** a candidate star falls near a degree-1 endpoint vertex and the active model is `simple`
- **THEN** its effective distance equals the raw point-to-segment distance with no reduction

#### Scenario: Star off all edges
- **WHEN** a candidate star's effective distance exceeds `distanceThreshold` from ResolvedConfig
- **THEN** the star is not counted as matched

#### Scenario: distanceThreshold override respected
- **WHEN** `match()` is called with `{ model: 'vertex', distanceThreshold: 0.07 }`
- **THEN** stars at effective distance 0.08 are excluded, even though the vertex model default is 0.15

#### Scenario: DISTANCE_THRESHOLD meaning is stable across words
- **WHEN** the matcher processes two different words whose LLM-generated skeletons have very different point spreads
- **THEN** `distanceThreshold` represents the same angular distance (fraction of patch radius) for both words

#### Scenario: Patch radius expansion does not shift existing star positions
- **WHEN** the patch radius expands from 10° to 12.5° during the seed sweep
- **THEN** the normalised positions of stars already within the original 10° patch remain unchanged; only newly included stars are added at the periphery

### Requirement: Endpoint-weighted vertex proximity bonus
The `vertex` and `spread` models SHALL apply a Gaussian proximity bonus using constants from `ResolvedConfig`: `vertexBonusEndpoint`, `vertexBonusJoint`, and `vertexSigma`. The `simple` model SHALL apply no bonus.

#### Scenario: Bonus constants come from ResolvedConfig
- **WHEN** `match()` is called with `{ model: 'vertex', vertexSigma: 0.05 }`
- **THEN** the Gaussian falloff uses σ=0.05 rather than the model default

#### Scenario: Bonus stronger at endpoints than joints
- **WHEN** two stars are equidistant from their respective nearest vertices
- **THEN** the star nearest a degree-1 endpoint vertex receives a larger effective distance reduction than the star nearest a degree-2 joint vertex

### Requirement: Edge-coverage score
The system SHALL compute the base match score as `matched_stars / total_candidates` (coverage ratio) for all models. For the `spread` model, the final score SHALL additionally include the edge-coverage bonus as defined in the matcher-model-interface spec.

#### Scenario: Score computed correctly for simple and vertex models
- **WHEN** 8 of 15 candidate stars are within threshold
- **THEN** the score is 0.533 for both `simple` and `vertex` models

#### Scenario: Spread model score exceeds coverage ratio when edges are covered
- **WHEN** 8 of 15 candidate stars are matched and all skeleton edges have at least one matched star
- **THEN** the spread model score is 0.533 + spreadWeight * 1.0, higher than the vertex model score

### Requirement: Matched result is full on-pattern star set
The system SHALL return all stars with effective distance below `distanceThreshold` as the match result, ordered by effective distance ascending. This requirement is unchanged across all models.

#### Scenario: All on-pattern stars returned
- **WHEN** a match is accepted
- **THEN** `MatchResult.stars` contains every candidate star within threshold of any edge
