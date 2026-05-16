## ADDED Requirements

### Requirement: Matched SVG inlined in DOM as a positioned overlay
When a constellation result is available and the "constellation image" feature is enabled, the system SHALL inject `match.svgPath` as the `innerHTML` of `#svg-overlay`, a `<div>` absolutely positioned over the canvas. The inner `<svg>` element SHALL receive `mix-blend-mode: screen`, `opacity: 0.35`, `stroke: white`, and `fill: none` via CSS, and SHALL have all existing fill/stroke attributes in the SVG source overridden.

When the result panel is closed, the system SHALL immediately hide and clear `#svg-overlay` in the same frame that `setConstellation(null)` removes the matched stars from the canvas.

#### Scenario: SVG injected on result with feature enabled
- **WHEN** a constellation result arrives and `showConstellationImage` is `true`
- **THEN** `#svg-overlay` contains the SVG markup and is visible

#### Scenario: SVG cleared when feature is disabled
- **WHEN** `showConstellationImage` is toggled to `false`
- **THEN** `#svg-overlay` is hidden (the SVG content may remain in DOM but must not be visible)

#### Scenario: SVG cleared immediately on result panel close
- **WHEN** the user closes the result panel
- **THEN** `#svg-overlay` is hidden and its innerHTML is cleared immediately, in the same render moment that matched stars are removed from the canvas

### Requirement: SVG positioned and transformed to align with the constellation
The system SHALL compute a CSS `transform` for the inner `<svg>` element using the following pipeline:

1. Project each point in `constellation.skeletonPoints` through the active D3 stereographic projection to obtain canvas-space coordinates `{x, y}[]`.
2. Compute the centroid `(cx, cy)` as the mean of those canvas coordinates.
3. Compute the scale factor `s` as `canvasExtent / svgViewBoxSize`, where `canvasExtent` is the diagonal of the bounding box of the projected skeletonPoints and `svgViewBoxSize` is the diagonal of the SVG's `viewBox`.
4. Use `constellation.procrustesAngle` (radians, from the backend) as the rotation `θ`.
5. Apply `transform: translate(calc(cx px - 50%), calc(cy px - 50%)) rotate(θ rad) scale(s)` to the `<svg>` element so that the SVG centre maps to `(cx, cy)` on the canvas.

During the `animateToResult` camera transition the transform SHALL be recalculated on every animation frame using the live (current-frame) projection, so that the image tracks the constellation's actual screen position throughout the transition.

#### Scenario: Transform applied on result render
- **WHEN** a constellation result is displayed with `showConstellationImage: true`
- **THEN** the `<svg>` element has a non-identity CSS transform derived from `skeletonPoints` and `procrustesAngle`

#### Scenario: Transform recalculated each animation frame during result transition
- **WHEN** the camera is animating toward the result via `animateToResult`
- **THEN** the SVG transform is updated on every animation frame using the current live projection, keeping the image aligned with the constellation's position on the canvas throughout the transition

#### Scenario: Transform recalculated on canvas resize
- **WHEN** the viewport is resized and the canvas dimensions change
- **THEN** the SVG transform is recalculated using the updated projection and new canvas dimensions

#### Scenario: No skeletonPoints — overlay hidden
- **WHEN** the response has no `skeletonPoints` field (e.g. legacy response)
- **THEN** the SVG overlay is not shown even if `showConstellationImage` is `true`

### Requirement: Backend returns Procrustes rotation angle
The backend SHALL include `procrustesAngle: number` (rotation angle in radians) in the `MatchResult` returned by `match()` and passed through to the API response `constellation` field. The angle is computed via a standalone `computeProcrustesAngle(constellationStars, skeletonRaDec)` function using the formula `atan2(h01 − h10, h00 + h11)` from the cross-covariance matrix H = B^T A (centred sky-space coordinates), which is mathematically equivalent to `atan2(R[1][0], R[0][0])` of the optimal 2×2 Procrustes rotation matrix.

#### Scenario: Angle present in successful response
- **WHEN** `match()` finds a constellation
- **THEN** the response `constellation.procrustesAngle` is a finite number in [-π, π]

#### Scenario: Angle absent when no match
- **WHEN** the retrieval pipeline finds no match and the endpoint returns 422
- **THEN** `procrustesAngle` is not present in the response body
