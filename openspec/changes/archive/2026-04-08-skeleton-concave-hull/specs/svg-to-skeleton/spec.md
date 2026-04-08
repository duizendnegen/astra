## MODIFIED Requirements

### Requirement: SVG path parsing and normalisation
The SVG → skeleton extractor SHALL parse all `<path>` elements from an SVG string, resolve any `transform` attributes, and normalise all coordinates to a 0–1 space using the SVG's `viewBox` (or bounding box if no viewBox is present).

#### Scenario: ViewBox normalisation
- **WHEN** an SVG has `viewBox="0 0 256 256"`
- **THEN** all coordinates are divided by 256, producing values in [0,1]

#### Scenario: Multiple path elements flattened to a single point cloud
- **WHEN** an SVG contains multiple `<path>` elements or a path with multiple subpaths
- **THEN** all sampled points from all subpaths are normalised and merged into a single flat point cloud before contour extraction

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges by connecting adjacent points along the extracted outer boundary contour. Since the concave hull extraction produces a single closed contour, edges SHALL connect consecutive points `[i, i+1]` for all points, with an additional closing edge from the last point back to the first.

#### Scenario: Outer contour forms a closed loop
- **WHEN** the concave hull extractor returns a single closed contour
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: No cross-subpath bridging needed
- **WHEN** the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as the concave hull step operates on the unified point cloud and returns one boundary

### Requirement: Sub-step caching
The extractor SHALL cache intermediate results keyed as follows:
- SVG parse + normalisation: keyed by SHA-256 hash of the raw svg_path string
- Dense point cloud: keyed by the same hash
- Simplified skeleton: keyed by `(svgHash, algorithmName, epsilon, "outline-v2")`

The `"outline-v2"` suffix SHALL be appended to all skeleton cache keys to distinguish concave-hull skeletons from prior union-based skeletons (`"outline-v1"`), ensuring stale cache entries are not served.

Cached results SHALL be stored in memory within a single Lambda invocation. A persistent disk cache MAY be used during local development (e.g. in `data/l5-cache/`).

#### Scenario: Re-run with different epsilon skips parse step
- **WHEN** the extractor is called twice with the same SVG but different epsilon values
- **THEN** the second call reuses the cached dense point cloud and only re-runs contour extraction and simplification

#### Scenario: Re-run with same parameters returns cached result
- **WHEN** the extractor is called twice with identical inputs
- **THEN** the second call returns the cached skeleton without recomputation

#### Scenario: Prior union-based cache entries are not served
- **WHEN** a skeleton was previously cached with the `"outline-v1"` suffix
- **THEN** it is treated as a cache miss and a new concave-hull skeleton is generated

## ADDED Requirements

### Requirement: Concavity option
The extractor SHALL accept a `concavity` parameter in `SvgToSkeletonOptions` that is forwarded to the concave hull extractor. Higher values produce a more convex hull; lower values produce a tighter fit. The default SHALL be 3.0, calibrated against the pilot word set to capture body-scale concavities while smoothing stroke-scale noise.

#### Scenario: Default concavity applied when not specified
- **WHEN** `svgToSkeleton` is called without a `concavity` option
- **THEN** the concave hull is computed with `concavity = 3.0`

#### Scenario: Custom concavity overrides default
- **WHEN** `svgToSkeleton` is called with `concavity: 1.5`
- **THEN** the concave hull is computed with that value, producing a tighter fit than the default
