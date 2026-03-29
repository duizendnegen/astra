## MODIFIED Requirements

### Requirement: Constellation edges drawn between matched stars
The system SHALL draw constellation lines between `constellationStars` pairs as defined by the skeleton edge list (with edges interpreted as indices into the skeleton vertex order, matched to `constellationStars` by position). Lines SHALL be drawn in the constellation line colour (#a7c8ff) at reduced opacity. Custom constellation lines SHALL always be drawn above any IAU orientation overlay lines.

#### Scenario: Edges rendered between constellation stars
- **WHEN** a match result with `constellationStars` is available
- **THEN** lines are drawn between `constellationStars` pairs defined by the skeleton edge list

#### Scenario: Custom constellation drawn above IAU overlay
- **WHEN** IAU orientation lines are also being rendered
- **THEN** the custom constellation lines are drawn in a subsequent pass, appearing above the IAU lines
