## ADDED Requirements

### Requirement: Server-side patch PNG rendering
The system SHALL provide a `renderPatch(result: WordResult, opts: RenderOpts) => Buffer` function in `test-harness/render-patch.ts` that produces a PNG buffer using `node-canvas` and `d3`. It SHALL NOT import from `frontend/src/renderer.ts`. The visual style SHALL match the frontend closely: same star colour palette, same magnitude-to-radius formula, same edge line style.

#### Scenario: Matched word renders non-empty PNG
- **WHEN** `renderPatch` is called with a matched WordResult
- **THEN** it returns a non-empty Buffer whose first bytes are a valid PNG header (`\x89PNG`)

#### Scenario: Unmatched word renders placeholder
- **WHEN** `renderPatch` is called with a result where `matched` is false
- **THEN** it returns a PNG showing only the dark background with "no match" text

### Requirement: Rendering layers
The renderer SHALL draw in this order: dark background fill, faint background patch stars, brighter on-pattern matched stars, white constellation stars, pale blue skeleton edges. This matches the visual layering in the frontend.

#### Scenario: Constellation stars on top of matched stars
- **WHEN** a constellation star and a non-constellation matched star overlap at the same projected position
- **THEN** the constellation star (white) is drawn on top

### Requirement: Magnitude-based star sizing
Star radius SHALL be `max(0.5, 2.2 - mag * 0.25)` px at default 300×300 resolution. Background patch stars SHALL render at reduced opacity. On-pattern matched stars SHALL render slightly brighter. Constellation stars SHALL render white.

#### Scenario: Bright star larger than dim star
- **WHEN** two patch stars have magnitudes 1.0 and 5.0
- **THEN** the mag-1 star's rendered radius is larger than the mag-5 star's rendered radius

### Requirement: Stereographic projection
The renderer SHALL use `d3.geoStereographic` centred on `patchRA` / `patchDec` and scaled to fit `patchRadiusDeg` within the image bounds. This is the same projection used by the frontend renderer and the existing in-browser harness render.

#### Scenario: Patch centre maps to image centre
- **WHEN** a star at exactly `(patchRA, patchDec)` is projected
- **THEN** its pixel position is at approximately `(width/2, height/2)`
