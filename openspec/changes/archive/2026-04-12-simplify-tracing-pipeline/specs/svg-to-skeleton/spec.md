## REMOVED Requirements

### Requirement: Contour extraction strategy option
**Reason**: `polygon-union` is now the sole strategy. The strategy parameter added indirection without benefit once `concave-hull` and `subpath-components` were evaluated and rejected.
**Migration**: Remove the `strategy` field from `SvgToSkeletonOptions`. All callers that passed `strategy: 'polygon-union'` need no change beyond removing the now-redundant field. Callers that passed `'concave-hull'` or `'subpath-components'` must be updated to use `polygon-union` (the sole remaining strategy).

### Requirement: Concavity option
**Reason**: The `concavity` parameter was only used by the `concave-hull` extractor. With that strategy removed, the parameter has no effect.
**Migration**: Remove the `concavity` field from `SvgToSkeletonOptions`. Remove the `/api/word/:word?concavity=N` tuning endpoint from the vetting server.

## MODIFIED Requirements

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges by connecting adjacent points along the extracted outer boundary contour. The `polygon-union` strategy returns a single closed contour; edges SHALL connect consecutive points `[i, i+1]` for all points, with an additional closing edge from the last point back to the first.

#### Scenario: Outer contour forms a closed loop
- **WHEN** the extractor returns a contour
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: No cross-subpath bridging needed
- **WHEN** the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as polygon-union returns one merged boundary

### Requirement: Sub-step caching
The extractor SHALL cache intermediate results keyed as follows:
- SVG parse + normalisation: keyed by SHA-256 hash of the raw svg_path string
- Dense point cloud: keyed by the same hash
- Simplified skeleton: keyed by `(svgHash, algorithmName, epsilon, "outline-v3")`

The strategy is no longer included in the cache key as `polygon-union` is the only strategy. The `"outline-v3"` suffix SHALL remain to distinguish from prior cache entries.

Cached results SHALL be stored in memory within a single Lambda invocation. A persistent disk cache MAY be used during local development (e.g. in `data/l5-cache/`).

#### Scenario: Re-run with different epsilon skips parse step
- **WHEN** the extractor is called twice with the same SVG but different epsilon values
- **THEN** the second call reuses the cached dense point cloud and only re-runs contour extraction and simplification

#### Scenario: Re-run with same parameters returns cached result
- **WHEN** the extractor is called twice with identical inputs
- **THEN** the second call returns the cached skeleton without recomputation
