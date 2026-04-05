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

## ADDED Requirements

### Requirement: Skeleton overlay rendered from API-provided skeleton field
When the API response includes a `skeleton` field, the frontend MAY render it as an overlay using
the normalised coordinates provided. The `skeleton.points` array SHALL be projected into screen
space using the same patch-to-canvas transform used for constellation stars. The overlay SHALL be
opt-in (e.g. gated by a query parameter or feature flag) and SHALL NOT appear by default.

#### Scenario: Skeleton overlay projected correctly
- **WHEN** `?render_mode=skeleton` is set and the API response contains a `skeleton` field
- **THEN** skeleton points are rendered at the screen positions derived from the API-provided normalised coordinates, not recomputed client-side

#### Scenario: No overlay when skeleton field absent
- **WHEN** the API response does not include a `skeleton` field
- **THEN** no skeleton overlay is rendered and no error is thrown
