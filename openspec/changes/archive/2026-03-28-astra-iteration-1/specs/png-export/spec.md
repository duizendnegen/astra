## ADDED Requirements

### Requirement: PNG exported from canvas
The system SHALL export the current result view as a PNG using `canvas.toDataURL("image/png")`. The export SHALL include the star field, constellation edges, brightened matched stars, and the word overlay composited via `ctx.fillText()`. A credit line reading "astra.plusx.black" SHALL appear in the lower corner.

#### Scenario: Export produces PNG
- **WHEN** the user activates Export PNG
- **THEN** a PNG file is downloaded containing the star field, constellation, word overlay, and credit line

#### Scenario: Credit line present
- **WHEN** the PNG is exported
- **THEN** "astra.plusx.black" appears in small text in the lower corner of the image

### Requirement: Web fonts loaded before export
The system SHALL wait for `document.fonts.ready` to resolve before compositing text onto the canvas for export, ensuring the correct typeface is used rather than a system fallback.

#### Scenario: Font loaded before export
- **WHEN** the user activates Export PNG
- **THEN** the system confirms fonts are ready before drawing text onto the canvas

### Requirement: Export contains no UI chrome
The PNG output SHALL not include action buttons, input fields, navigation, or any interface elements beyond the star field, constellation, word overlay, constellation name, and credit line.

#### Scenario: Clean export
- **WHEN** the PNG is downloaded
- **THEN** no UI controls or chrome are visible in the exported image
