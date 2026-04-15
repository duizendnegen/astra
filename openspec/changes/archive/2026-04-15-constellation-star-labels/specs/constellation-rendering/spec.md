## MODIFIED Requirements

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in `MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context layer. When `features.showStarLabels` is `true`, each `constellationStar` with a known name SHALL additionally render a text label beside its dot; the label SHALL fade with `constellationAlpha`.

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

## REMOVED Requirements

### Requirement: drawNamedStars / 'named' mode
**Reason:** `drawNamedStars()` and `features.showStars === 'named'` are removed. The `'named'` mode rendered labels on all named stars in the viewport but had no UI entry point and was never reachable by users.
**Migration:** Delete `drawNamedStars()` from `renderer.ts`. Remove any call sites. `namedStars` state variable and `NAMED_STARS` import are also removed.
