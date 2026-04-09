## MODIFIED Requirements

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges according to the active strategy:
- For `concave-hull` and `polygon-union`: edges connect consecutive points `[i, i+1]` for all points, with a closing edge from the last point back to the first (single closed loop).
- For `subpath-components`: edges form closed loops within each subpath plus one proximity bridge edge per subpath to the nearest point in another subpath (see `skeleton-subpath-strategy` spec).

#### Scenario: Outer contour forms a closed loop
- **WHEN** strategy is `concave-hull` or `polygon-union`
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: Subpath-components produces a multi-component graph
- **WHEN** strategy is `subpath-components` and the SVG has multiple subpaths
- **THEN** edges form per-subpath closed loops connected by inter-subpath bridge edges, not a single outer loop

#### Scenario: No cross-subpath bridging for hull strategies
- **WHEN** strategy is `concave-hull` or `polygon-union` and the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as both extraction strategies return one boundary

## ADDED Requirements

### Requirement: subpath-components strategy option
The `strategy` parameter of `svgToSkeleton` SHALL accept `'subpath-components'` as a valid value in addition to the existing `'concave-hull'` and `'polygon-union'` options.

#### Scenario: Strategy option accepted without error
- **WHEN** `svgToSkeleton` is called with `{ strategy: 'subpath-components' }`
- **THEN** the function returns a valid Skeleton without throwing

#### Scenario: Cache key distinguishes subpath-components from other strategies
- **WHEN** the same SVG is processed with `strategy: 'concave-hull'` and then `strategy: 'subpath-components'`
- **THEN** the two results are cached under different keys and do not interfere with each other
