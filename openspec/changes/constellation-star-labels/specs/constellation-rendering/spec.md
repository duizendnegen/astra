## MODIFIED Requirements

### Requirement: Matched stars brightened
The system SHALL render `constellationStars` fully bright and at increased size. Stars in `MatchResult.stars` that are not in `constellationStars` SHALL be rendered slightly brighter than ordinary background stars but dimmer than constellation stars, forming a visible on-pattern context layer. When `showStars === 'constellation'`, each `constellationStar` with a known name SHALL additionally render a text label beside its dot; the label SHALL fade with `constellationAlpha`.

#### Scenario: Three-tier star brightness
- **WHEN** the constellation is rendered
- **THEN** `constellationStars` are the brightest, on-pattern context stars (`stars` minus `constellationStars`) are intermediate, and background stars are the dimmest

#### Scenario: On-pattern context layer visible
- **WHEN** the constellation region is shown
- **THEN** stars near skeleton edges but not in `constellationStars` are visibly brighter than the general background field

#### Scenario: Labels rendered in constellation mode
- **WHEN** `showStars === 'constellation'` and a star in `constellationStars` has a name in the name map
- **THEN** a text label appears beside that star's dot, fading in with `constellationAlpha`

#### Scenario: Labels absent in named mode
- **WHEN** `showStars === 'named'`
- **THEN** no labels are rendered on `constellationStars` (named-star labels are handled by `drawNamedStars()`)
