## Requirements

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

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in
`MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than
ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context
layer. When `features.showStarLabels` is `true`, each `constellationStar` with a known name SHALL additionally render a text label beside its dot; the label SHALL fade with `constellationAlpha`.

#### Scenario: Three-tier star brightness
- **WHEN** the constellation is rendered
- **THEN** `constellationStars` are the brightest, on-pattern context stars (`stars` minus `constellationStars`) are intermediate, and background stars are the dimmest

#### Scenario: On-pattern context layer visible
- **WHEN** the constellation region is shown
- **THEN** stars near skeleton edges but not in `constellationStars` are visibly brighter than the general background field

#### Scenario: Labels rendered when star labels on
- **WHEN** `features.showStarLabels` is `true` and a star in `constellationStars` has a name in the name map
- **THEN** a text label appears beside that star's dot, fading in with `constellationAlpha`

#### Scenario: Labels absent when star labels off
- **WHEN** `features.showStarLabels` is `false`
- **THEN** no labels are rendered on `constellationStars`

### Requirement: Background stars dimmed by distance from constellation centre
The system SHALL reduce the opacity of background stars based on their angular distance from the
constellation patch centre, creating a "portrait with context" framing.

#### Scenario: Stars near centre brighter
- **WHEN** the constellation is rendered
- **THEN** stars closer to the patch centre are rendered at higher opacity than stars further away

## REMOVED Requirements

### Requirement: drawNamedStars / 'named' mode
**Reason:** `drawNamedStars()` and `features.showStars === 'named'` are removed. The `'named'` mode rendered labels on all named stars in the viewport but had no UI entry point and was never reachable by users.
**Migration:** Delete `drawNamedStars()` from `renderer.ts`. Remove any call sites. `namedStars` state variable and `NAMED_STARS` import are also removed.
