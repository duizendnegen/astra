## ADDED Requirements

### Requirement: vertex-penalty scoring model
The system SHALL provide a `vertex-penalty` scoring model in `matcher.ts`. This model SHALL behave identically to the `vertex` model in star loss and vertex bonus calculations, with one addition: the final score SHALL be reduced by `penaltyWeight * uncoveredVertexFraction`, where `uncoveredVertexFraction` is the proportion of skeleton vertices that have no matched star within `distanceThreshold`, and `penaltyWeight` defaults to `0.3`.

#### Scenario: All vertices covered — no penalty
- **WHEN** every skeleton vertex has at least one matched star within distanceThreshold
- **THEN** the vertex-penalty score equals the vertex model score for the same patch

#### Scenario: Half vertices uncovered — partial penalty
- **WHEN** half of the skeleton vertices have no nearby matched star
- **THEN** the score is reduced by 0.5 * penaltyWeight compared to the base coverage ratio

#### Scenario: All vertices uncovered — full penalty
- **WHEN** no skeleton vertex has a nearby matched star
- **THEN** the score is reduced by penaltyWeight (0.3 by default), which may push it below coverageThreshold

### Requirement: vertex-penalty available in harness
The `vertex-penalty` model name SHALL be accepted by the test harness `--model` flag. Running `npm run harness -- --model vertex-penalty` SHALL produce a valid run with results and PNG thumbnails.

#### Scenario: Harness run with vertex-penalty model
- **WHEN** `npm run harness -- --model vertex-penalty` is executed
- **THEN** a report is generated without errors and all words are processed
