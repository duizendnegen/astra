## ADDED Requirements

### Requirement: Camera defined by projection centre and field of view
The system SHALL represent the camera as a D3 stereographic projection parameterised by a centre (RA/Dec, stored as `rotate`) and a scale derived from the field of view and the short viewport dimension using the formula `scale = (shortDimension / 2) / (2 × tan(fov / 2))`.

#### Scenario: Scale computed from viewport
- **WHEN** the viewport dimensions change or the FOV changes
- **THEN** scale is recalculated from the current short dimension and target FOV

### Requirement: Pan and zoom transition to result
The system SHALL animate the camera from the landing state (Orion centre, 60° FOV) to the result state (matched patch centre, 25° FOV) once a match is found. Both `rotate` and `scale` SHALL be interpolated simultaneously over approximately 2 seconds with ease-in-out easing. Stars SHALL move and scale naturally throughout the transition as the projection updates each frame.

#### Scenario: Camera animates to matched patch
- **WHEN** a constellation match is found
- **THEN** the camera pans and zooms smoothly from the landing state to the matched patch centre at 25° FOV over ~2 seconds

#### Scenario: Stars move naturally during transition
- **WHEN** the camera is animating
- **THEN** stars move and scale continuously as the projection updates, with no visual discontinuity

### Requirement: Constellation renders after camera settles
The system SHALL apply the brightness dimming effect and render the constellation edges and overlays only after the camera animation completes.

#### Scenario: Constellation appears on settle
- **WHEN** the camera animation finishes
- **THEN** background stars dim by distance from centre, constellation edges appear, and the word overlay fades in

### Requirement: Regenerate re-runs matching on a new patch
The system SHALL provide a secondary Regenerate action that re-runs the star matching algorithm on a different sky patch without re-querying the LLM, then animates the camera to the new patch centre.

#### Scenario: Regenerate produces new constellation
- **WHEN** the user activates Regenerate
- **THEN** matching runs with a new patch, the camera animates to the new centre, and the constellation updates
