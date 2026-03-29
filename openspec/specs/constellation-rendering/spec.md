## ADDED Requirements

### Requirement: Constellation edges drawn between matched stars
The system SHALL draw the constellation by rendering lines between matched star pairs as defined by the edge list. Lines SHALL be drawn on the canvas in the constellation line colour (#a7c8ff) at reduced opacity.

#### Scenario: Edges rendered
- **WHEN** a match result is available
- **THEN** a line is drawn between each pair of matched stars defined by the edge list

### Requirement: Matched stars brightened
The system SHALL render matched constellation stars larger and brighter than background stars of equivalent magnitude, making the constellation legible against the field.

#### Scenario: Constellation stars distinguished
- **WHEN** the constellation is rendered
- **THEN** matched stars are visually larger and brighter than surrounding background stars

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
