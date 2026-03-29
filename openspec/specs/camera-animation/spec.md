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
The system SHALL animate `constellationAlpha` from 0 to 1 during the final 40% of the forward (landing-to-result) camera transition. All constellation visual effects — edge lines, star dots, and background star distance-dimming — SHALL be scaled by `constellationAlpha` each frame, so they are invisible at the start of the transition and fully opaque on arrival. The return transition (result-to-landing) SHALL remain unchanged.

#### Scenario: Constellation invisible at transition start
- **WHEN** the camera begins animating toward the result
- **THEN** no constellation lines, star dots, or background dimming are visible — the starfield appears uniform

#### Scenario: Constellation fades in during final 40% of animation
- **WHEN** the camera animation has reached 60% of its eased progress
- **THEN** constellation lines, star dots, and background dimming begin fading in, reaching full opacity at animation completion

#### Scenario: Constellation fully visible on arrival
- **WHEN** the camera animation completes
- **THEN** `constellationAlpha` is 1 and all constellation visuals are rendered at their normal full opacity

#### Scenario: Overlays fade out during return transition
- **WHEN** the camera animates back to the landing state
- **THEN** `constellationAlpha` animates from 1 to 0 over the full return transition, causing IAU constellation lines and named star labels to fade out smoothly; custom constellation visuals (cleared by `setConstellation(null)` before the return begins) are already absent

### Requirement: Regenerate re-runs matching on a new patch
The system SHALL provide a secondary Regenerate action that re-runs the star matching algorithm on a different sky patch without re-querying the LLM, then animates the camera to the new patch centre.

#### Scenario: Regenerate produces new constellation
- **WHEN** the user activates Regenerate
- **THEN** matching runs with a new patch, the camera animates to the new centre, and the constellation updates
