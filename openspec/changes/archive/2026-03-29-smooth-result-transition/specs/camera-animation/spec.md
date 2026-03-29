## MODIFIED Requirements

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

#### Scenario: Return transition unaffected
- **WHEN** the camera animates back to the landing state
- **THEN** constellation visuals disappear immediately (as `setConstellation(null)` is called before the return animation) and the zoom-out proceeds unchanged
