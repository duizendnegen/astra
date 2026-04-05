## MODIFIED Requirements

### Requirement: Constellation edges drawn between matched stars
The system SHALL draw constellation lines between `constellationStars` pairs as defined by the
skeleton edge list. For each edge `[i, j]`, the line SHALL connect `constellationStars[i]` to
`constellationStars[j]`. If either index is out of bounds for `constellationStars`, that edge SHALL
be skipped without error. Lines SHALL be drawn in the constellation line colour (#a7c8ff) at
reduced opacity. This SHALL be the default rendering behaviour with no query parameter required.

#### Scenario: Default render uses actual star positions
- **WHEN** no `render_mode` query parameter is present
- **THEN** constellation lines are drawn between actual `constellationStars` positions (not ideal skeleton positions)

#### Scenario: Edges rendered between constellation stars
- **WHEN** a match result with `constellationStars` is available
- **THEN** lines are drawn between `constellationStars[i]` and `constellationStars[j]` for each edge `[i, j]`

#### Scenario: Missing constellation star skips edge
- **WHEN** a skeleton edge `[i, j]` references an index beyond the length of `constellationStars`
- **THEN** that edge is not drawn and no error is thrown

#### Scenario: render_mode=skeleton override available for debugging
- **WHEN** the URL contains `?render_mode=skeleton`
- **THEN** constellation lines are drawn between ideal skeleton positions (the pre-change behaviour)

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in
`MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than
ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context
layer.

#### Scenario: Three-tier star brightness
- **WHEN** the constellation is rendered
- **THEN** `constellationStars` are the brightest, on-pattern context stars (`stars` minus `constellationStars`) are intermediate, and background stars are the dimmest

#### Scenario: On-pattern context layer visible
- **WHEN** the constellation region is shown
- **THEN** stars near skeleton edges but not in `constellationStars` are visibly brighter than the general background field

### Requirement: Background stars dimmed by distance from constellation centre
The system SHALL reduce the opacity of background stars based on their angular distance from the
constellation patch centre, creating a "portrait with context" framing.

#### Scenario: Stars near centre brighter
- **WHEN** the constellation is rendered
- **THEN** stars closer to the patch centre are rendered at higher opacity than stars further away
