## ADDED Requirements

### Requirement: render_mode URL query parameter
The frontend SHALL read a `render_mode` query parameter from the page URL on load. Accepted values are `skeleton` (default) and `stars`. Any other value SHALL be treated as `skeleton`.

#### Scenario: Default render mode
- **WHEN** no `render_mode` query parameter is present
- **THEN** constellation lines are drawn between ideal skeleton positions (existing behaviour)

#### Scenario: render_mode=stars
- **WHEN** the URL contains `?render_mode=stars`
- **THEN** constellation lines are drawn between the actual positions of `constellationStars` rather than `skeletonPoints`

#### Scenario: render_mode=skeleton explicit
- **WHEN** the URL contains `?render_mode=skeleton`
- **THEN** constellation lines are drawn between ideal skeleton positions (same as default)

### Requirement: render_mode=stars connects constellation stars
When `render_mode=stars`, the system SHALL draw one line segment for each edge `[i, j]` in the skeleton edge list, connecting `constellationStars[i]` to `constellationStars[j]`. If `constellationStars` has fewer entries than the maximum edge index, those edges SHALL be skipped.

#### Scenario: Lines follow actual star positions
- **WHEN** render_mode=stars and a match is displayed
- **THEN** each constellation line begins and ends at the pixel position of a constellation star dot, not at an ideal skeleton vertex

#### Scenario: Missing stars skip edge
- **WHEN** a skeleton edge references an index beyond the length of constellationStars
- **THEN** that edge is not drawn and no error is thrown
