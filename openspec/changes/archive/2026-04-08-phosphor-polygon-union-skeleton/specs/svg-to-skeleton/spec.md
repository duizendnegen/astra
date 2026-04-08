## MODIFIED Requirements

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

### Requirement: Contour extraction strategy option
The extractor SHALL accept a `strategy` parameter in `SvgToSkeletonOptions` with values `'concave-hull'` (default) or `'polygon-union'`. The selected strategy is forwarded to the outline extractor at step 3 of the pipeline.

#### Scenario: Default strategy is concave-hull
- **WHEN** `svgToSkeleton` is called without a `strategy` option
- **THEN** the concave hull extractor is used for contour extraction

#### Scenario: Polygon-union strategy selects correct extractor
- **WHEN** `svgToSkeleton` is called with `strategy: 'polygon-union'`
- **THEN** the polygon-union extractor is used and the resulting contour reflects merged subpath boundaries

## MODIFIED Requirements

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges by connecting adjacent points along the extracted outer boundary contour. Both the concave hull and polygon-union strategies return a single closed contour; edges SHALL connect consecutive points `[i, i+1]` for all points, with an additional closing edge from the last point back to the first.

#### Scenario: Outer contour forms a closed loop
- **WHEN** either extractor returns a single closed contour
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: No cross-subpath bridging needed
- **WHEN** the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as both extraction strategies return one boundary
