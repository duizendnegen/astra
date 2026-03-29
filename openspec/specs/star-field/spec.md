## ADDED Requirements

### Requirement: HYG catalogue loaded on page load
The system SHALL load the HYG star catalogue (filtered to visual magnitude ≤ 6, ~9,000 stars) as a static bundled asset on page load. The submit action SHALL be disabled until the catalogue is fully parsed and ready.

#### Scenario: Catalogue loads successfully
- **WHEN** the page loads
- **THEN** the star catalogue is fetched and parsed before the user can submit a word

#### Scenario: Submit blocked during load
- **WHEN** the catalogue has not yet finished loading
- **THEN** the submit button is disabled and a subtle loading indicator is shown

### Requirement: Star field rendered on Canvas
The system SHALL render the star field on a single HTML `<canvas>` element using D3 stereographic projection to convert RA/Dec coordinates to screen x,y positions. Stars SHALL be drawn as filled circles with radius and opacity scaled by visual magnitude.

#### Scenario: Stars visible on load
- **WHEN** the catalogue is loaded and the canvas is initialised
- **THEN** stars are rendered at their correct projected positions with magnitude-appropriate sizing

#### Scenario: Canvas fills the viewport
- **WHEN** the page is rendered at any viewport size
- **THEN** the canvas covers the full browser viewport with no gaps

### Requirement: Responsive canvas resize
The system SHALL reproject and redraw the star field when the browser window is resized, recalculating scale from the updated short viewport dimension.

#### Scenario: Window resized
- **WHEN** the user resizes the browser window
- **THEN** the canvas dimensions update and stars are redrawn at correct positions for the new size

### Requirement: Landing camera state
The system SHALL initialise the camera centred on RA 83.8°, Dec −5.4° (Orion, near Alnilam) with a 60° field of view anchored to the short viewport dimension.

#### Scenario: Landing view shows Orion region
- **WHEN** the page first renders
- **THEN** the star field is centred on the Orion region with approximately 60° of sky visible in the short viewport dimension
