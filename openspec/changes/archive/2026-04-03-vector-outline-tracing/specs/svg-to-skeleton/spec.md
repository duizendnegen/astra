## MODIFIED Requirements

### Requirement: SVG path parsing and normalisation
The SVG → skeleton extractor SHALL parse all `<path>` elements from an SVG string, resolve any `transform` attributes, and normalise all coordinates to a 0–1 space using the SVG's `viewBox` (or bounding box if no viewBox is present).

#### Scenario: ViewBox normalisation
- **WHEN** an SVG has `viewBox="0 0 256 256"`
- **THEN** all coordinates are divided by 256, producing values in [0,1]

#### Scenario: Multiple path elements processed as separate subpath polygons
- **WHEN** an SVG contains multiple `<path>` elements or a path with multiple subpaths
- **THEN** each subpath is sampled into its own dense polygon and passed to the outline extractor, rather than being concatenated into a single point set

### Requirement: Edge derivation from path continuity
The extractor SHALL derive edges by connecting adjacent points along the extracted outer boundary contour. Since the outline extraction produces a single closed contour, edges SHALL connect consecutive points `[i, i+1]` for all points, with an additional closing edge from the last point back to the first.

#### Scenario: Outer contour forms a closed loop
- **WHEN** the outline extractor returns a single closed contour
- **THEN** edges connect every consecutive pair of simplified points and the last point connects back to the first

#### Scenario: No cross-subpath bridging needed
- **WHEN** the SVG contains multiple original subpaths
- **THEN** no special sub-path membership tracking is needed, as the union step merges them into one boundary before edge derivation

### Requirement: Sub-step caching
The extractor SHALL cache intermediate results keyed as follows:
- SVG parse + normalisation: keyed by SHA-256 hash of the raw svg_path string
- Dense point cloud: keyed by the same hash
- Simplified skeleton: keyed by `(svgHash, algorithmName, epsilon, "outline-v1")`

The `"outline-v1"` suffix SHALL be appended to all skeleton cache keys to distinguish outline-traced skeletons from legacy concatenated-path skeletons, ensuring stale cache entries are not served.

#### Scenario: Re-run with different epsilon skips parse step
- **WHEN** the extractor is called twice with the same SVG but different epsilon values
- **THEN** the second call reuses the cached dense point cloud and only re-runs outline extraction and simplification

#### Scenario: Re-run with same parameters returns cached result
- **WHEN** the extractor is called twice with identical inputs
- **THEN** the second call returns the cached skeleton without recomputation

#### Scenario: Legacy cache entries are not served
- **WHEN** a skeleton was previously cached without the `"outline-v1"` suffix
- **THEN** it is treated as a cache miss and a new outline-traced skeleton is generated
