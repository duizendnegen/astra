## ADDED Requirements

### Requirement: IAU constellation stick figures rendered when show_lines flag is active
The system SHALL fetch `constellation-lines.json` lazily (only when `show_lines=1`) and render IAU constellation line segments within the current camera FOV as a faint overlay. Lines SHALL be drawn in a muted grey at approximately 25% opacity multiplied by the current `constellationAlpha` value, below the custom constellation layer.

#### Scenario: Lines visible when flag on
- **WHEN** `show_lines=1` is in the URL and a result is displayed
- **THEN** IAU constellation stick figures are visible in the result view as faint grey lines

#### Scenario: Lines absent when flag off
- **WHEN** `show_lines` is not in the URL
- **THEN** no IAU constellation lines are drawn and no line data is fetched

#### Scenario: Lines culled to result patch
- **WHEN** a result is displayed
- **THEN** only IAU constellations whose bounding box intersects the result patch bounding box (centred on the matched patch at 25° FOV) are rendered; constellations outside that area are skipped regardless of the current animated camera position

#### Scenario: Lines culled to FOV on landing
- **WHEN** no result is displayed (landing state)
- **THEN** only IAU constellations whose bounding box intersects the current camera FOV are rendered

#### Scenario: Custom constellation remains focal point
- **WHEN** both IAU lines and the custom constellation are rendered
- **THEN** IAU lines are drawn below the custom constellation layer and at lower opacity, keeping the custom constellation visually dominant

#### Scenario: Lines fade in with constellation alpha
- **WHEN** the camera is animating toward the result and `constellationAlpha` is between 0 and 1
- **THEN** IAU lines are drawn at `0.25 × constellationAlpha` opacity, fading in alongside the custom constellation

#### Scenario: Lines fade out on return transition
- **WHEN** the camera animates back to the landing state
- **THEN** IAU lines fade out smoothly as `constellationAlpha` animates from 1 to 0 over the return transition

### Requirement: Named star labels rendered when show_stars flag is active
The system SHALL render labels for up to 20 hardcoded well-known named stars (e.g. Sirius, Betelgeuse, Rigel, Polaris) that fall within the current camera FOV. Each label SHALL display the star's proper name as small text offset from the star dot. Label opacity SHALL be scaled by the current `constellationAlpha` value.

#### Scenario: Labels visible when flag on
- **WHEN** `show_stars=1` is in the URL and a result is displayed
- **THEN** named stars within the FOV are labelled with their proper names

#### Scenario: Labels absent when flag off
- **WHEN** `show_stars` is not in the URL
- **THEN** no named star labels are rendered

#### Scenario: Only in-FOV stars labelled
- **WHEN** a named star projects outside the current canvas bounds
- **THEN** that star's label is not rendered

#### Scenario: Labels fade in with constellation alpha
- **WHEN** the camera is animating toward the result and `constellationAlpha` is between 0 and 1
- **THEN** named star labels are drawn at `0.85 × constellationAlpha` opacity, fading in alongside the custom constellation

#### Scenario: Labels fade out on return transition
- **WHEN** the camera animates back to the landing state
- **THEN** named star labels fade out smoothly as `constellationAlpha` animates from 1 to 0 over the return transition

### Requirement: Overlay draw order preserves visual hierarchy
The system SHALL render overlays in the following order (bottom to top): background stars, IAU lines, named star labels, custom constellation lines, custom constellation stars.

#### Scenario: Draw order maintained
- **WHEN** both overlays are active (`show_lines=1&show_stars=1`)
- **THEN** IAU lines do not obscure custom constellation lines or star dots
