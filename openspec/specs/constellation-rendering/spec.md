## ADDED Requirements

### Requirement: Constellation edges drawn between matched stars
The system SHALL draw constellation lines between `constellationStars` pairs as defined by the skeleton edge list (with edges interpreted as indices into the skeleton vertex order, matched to `constellationStars` by position). Lines SHALL be drawn in the constellation line colour (#a7c8ff) at reduced opacity. Custom constellation lines SHALL always be drawn above any IAU orientation overlay lines.

#### Scenario: Edges rendered between constellation stars
- **WHEN** a match result with `constellationStars` is available
- **THEN** lines are drawn between `constellationStars` pairs defined by the skeleton edge list

#### Scenario: Custom constellation drawn above IAU overlay
- **WHEN** IAU orientation lines are also being rendered
- **THEN** the custom constellation lines are drawn in a subsequent pass, appearing above the IAU lines

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in `MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context layer.

#### Scenario: Three-tier star brightness
- **WHEN** the constellation is rendered
- **THEN** `constellationStars` are the brightest, on-pattern context stars (`stars` minus `constellationStars`) are intermediate, and background stars are the dimmest

#### Scenario: On-pattern context layer visible
- **WHEN** the constellation region is shown
- **THEN** stars near skeleton edges but not in `constellationStars` are visibly brighter than the general background field

### Requirement: Background stars dimmed by distance from constellation centre
The system SHALL reduce the opacity of background stars based on their angular distance from the constellation patch centre, creating a "portrait with context" framing where the constellation is the subject and the surrounding field recedes.

#### Scenario: Stars near centre brighter
- **WHEN** the constellation is rendered
- **THEN** stars closer to the patch centre are rendered at higher opacity than stars further away

### Requirement: Word overlay displayed
The system SHALL display the user's input word as a large, light-weight typographic overlay above or below the constellation using HTML/CSS positioned over the canvas. The generated constellation name SHALL appear as a smaller secondary label in lighter weight.

#### Scenario: Word and name displayed
- **WHEN** the constellation is rendered
- **THEN** the input word is shown as a large overlay and the generated constellation name as a smaller secondary label

### Requirement: RA/Dec metadata displayed
The system SHALL display the patch centre right ascension and declination as formatted text in the left margin of the result view.

#### Scenario: Coordinates shown
- **WHEN** the constellation result is displayed
- **THEN** declination and right ascension are shown in standard astronomical notation (e.g. +42° 14' 5.2", 0h 25m 43s)
