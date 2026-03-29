## MODIFIED Requirements

### Requirement: Constellation edges drawn between matched stars
The system SHALL draw constellation lines between `constellationStars` pairs as defined by the skeleton edge list (with edges interpreted as indices into the skeleton vertex order, matched to `constellationStars` by position). Lines SHALL be drawn in the constellation line colour (#a7c8ff) at reduced opacity.

#### Scenario: Edges rendered between constellation stars
- **WHEN** a match result with `constellationStars` is available
- **THEN** lines are drawn between `constellationStars` pairs defined by the skeleton edge list

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in `MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context layer.

#### Scenario: Three-tier star brightness
- **WHEN** the constellation is rendered
- **THEN** `constellationStars` are the brightest, on-pattern context stars (`stars` minus `constellationStars`) are intermediate, and background stars are the dimmest

#### Scenario: On-pattern context layer visible
- **WHEN** the constellation region is shown
- **THEN** stars near skeleton edges but not in `constellationStars` are visibly brighter than the general background field
