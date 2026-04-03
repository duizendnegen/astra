## ADDED Requirements

### Requirement: render_mode routing in renderer
The renderer SHALL accept a `renderMode: 'skeleton' | 'stars'` parameter. When `renderMode` is `stars`, constellation edge lines SHALL be drawn between the projected positions of `constellationStars` entries (indexed by edge pairs). When `renderMode` is `skeleton` (or unset), the existing behaviour SHALL be preserved: lines are drawn between `skeletonPoints`.

#### Scenario: skeleton mode preserves existing line positions
- **WHEN** renderMode is 'skeleton'
- **THEN** constellation lines connect ideal skeletonPoints positions (no change from baseline)

#### Scenario: stars mode connects actual star dots
- **WHEN** renderMode is 'stars'
- **THEN** constellation lines connect constellationStars positions and visually join the star dots
