## ADDED Requirements

### Requirement: SVG path parsing and normalisation
The SVG → skeleton extractor SHALL parse all `<path>` elements from an SVG string, resolve any `transform` attributes, and normalise all coordinates to a 0–1 space using the SVG's `viewBox` (or bounding box if no viewBox is present).

#### Scenario: ViewBox normalisation
- **WHEN** an SVG has `viewBox="0 0 256 256"`
- **THEN** all coordinates are divided by 256, producing values in [0,1]

#### Scenario: Multiple path elements flattened to a single point cloud
- **WHEN** an SVG contains multiple `<path>` elements or a path with multiple subpaths
- **THEN** all sampled points from all subpaths are normalised and merged into a single flat point cloud before contour extraction

### Requirement: Curvature-weighted point sampling
The extractor SHALL sample points along each path at intervals proportional to local curvature: more densely around curves and corners, more sparsely along straight segments. The sampling SHALL produce a dense intermediate point cloud (100–500 points) before thinning.

#### Scenario: Curve receives more samples than straight
- **WHEN** a path contains a Bezier curve adjacent to a straight segment
- **THEN** the curve segment has proportionally more sampled points per unit length

### Requirement: Swappable simplification algorithm
The extractor SHALL expose a simplification strategy parameter. The default algorithm SHALL be Ramer-Douglas-Peucker (RDP) with a tunable epsilon. Additional algorithms (e.g. Visvalingam-Whyatt) SHALL be registerable by passing an alternative strategy function. The simplification SHALL target a 15–40 point output, adjusting epsilon automatically if the initial pass produces fewer than 15 or more than 40 points.

#### Scenario: Default RDP produces 15–40 points
- **WHEN** L5 runs with default settings on a typical Phosphor icon SVG
- **THEN** the output skeleton has between 15 and 40 points

#### Scenario: Alternative algorithm can be substituted
- **WHEN** `simplify: visvalingamWhyatt` is passed as the strategy
- **THEN** the extractor uses Visvalingam-Whyatt instead of RDP

#### Scenario: Auto-adjust epsilon when point count out of range
- **WHEN** initial RDP produces fewer than 15 points
- **THEN** epsilon is reduced and RDP is retried until at least 15 points are produced (or a minimum epsilon floor is reached)

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges by connecting adjacent points along the extracted outer boundary contour. Both the concave hull and polygon-union strategies return a single closed contour; edges SHALL connect consecutive points `[i, i+1]` for all points, with an additional closing edge from the last point back to the first.

#### Scenario: Outer contour forms a closed loop
- **WHEN** either extractor returns a single closed contour
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: No cross-subpath bridging needed
- **WHEN** the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as both extraction strategies return one boundary

### Requirement: Sub-step caching
The extractor SHALL cache intermediate results keyed as follows:
- SVG parse + normalisation: keyed by SHA-256 hash of the raw svg_path string
- Dense point cloud: keyed by the same hash
- Simplified skeleton: keyed by `(svgHash, algorithmName, epsilon, strategy, "outline-v3")`

The `"outline-v3"` suffix SHALL be appended to all skeleton cache keys to distinguish strategy-aware skeletons from prior entries, ensuring stale cache entries are not served.

Cached results SHALL be stored in memory within a single Lambda invocation. A persistent disk cache MAY be used during local development (e.g. in `data/l5-cache/`).

#### Scenario: Re-run with different epsilon skips parse step
- **WHEN** the extractor is called twice with the same SVG but different epsilon values
- **THEN** the second call reuses the cached dense point cloud and only re-runs contour extraction and simplification

#### Scenario: Re-run with same parameters returns cached result
- **WHEN** the extractor is called twice with identical inputs and the same strategy
- **THEN** the second call returns the cached skeleton without recomputation

#### Scenario: Different strategies produce separate cache entries
- **WHEN** the extractor is called twice with the same SVG but different strategy values
- **THEN** each call computes and caches its own skeleton independently

### Requirement: Concavity option
The extractor SHALL accept a `concavity` parameter in `SvgToSkeletonOptions` that is forwarded to the concave hull extractor. Higher values produce a more convex hull; lower values produce a tighter fit. The default SHALL be 3.0, calibrated against the pilot word set to capture body-scale concavities while smoothing stroke-scale noise.

#### Scenario: Default concavity applied when not specified
- **WHEN** `svgToSkeleton` is called without a `concavity` option
- **THEN** the concave hull is computed with `concavity = 3.0`

#### Scenario: Custom concavity overrides default
- **WHEN** `svgToSkeleton` is called with `concavity: 1.5`
- **THEN** the concave hull is computed with that value, producing a tighter fit than the default

### Requirement: Contour extraction strategy option
The extractor SHALL accept a `strategy` parameter in `SvgToSkeletonOptions` with values `'concave-hull'` (default) or `'polygon-union'`. The selected strategy is forwarded to the outline extractor at step 3 of the pipeline.

#### Scenario: Default strategy is concave-hull
- **WHEN** `svgToSkeleton` is called without a `strategy` option
- **THEN** the concave hull extractor is used for contour extraction

#### Scenario: Polygon-union strategy selects correct extractor
- **WHEN** `svgToSkeleton` is called with `strategy: 'polygon-union'`
- **THEN** the polygon-union extractor is used and the resulting contour reflects merged subpath boundaries
