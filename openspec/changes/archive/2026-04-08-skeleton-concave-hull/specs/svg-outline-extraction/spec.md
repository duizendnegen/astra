## REMOVED Requirements

### Requirement: Boolean union of subpath polygons
**Reason**: Boolean union of disconnected subpath polygons fails for line-art SVGs (e.g. vtracer output), where each stroke is a separate thin polygon that never merges with neighbours. The union produces hundreds of disjoint regions rather than a single silhouette. Replaced by concave hull.
**Migration**: Callers pass the full flat point cloud to the new concave hull extractor instead of per-subpath polygon rings.

### Requirement: Outer boundary extraction
**Reason**: Selecting the largest polygon from the union result silently discards all regions except the densest stroke cluster, producing skeletons that cover only a fraction of the original shape. Removed with the union step.
**Migration**: The concave hull extractor returns a single contour directly; no largest-polygon selection is needed.

### Requirement: Fallback on union error
**Reason**: The union step is removed; there is no union operation to fail.
**Migration**: The concave hull extractor is robust to sparse and disconnected point clouds and does not require a fallback.

## ADDED Requirements

### Requirement: Concave hull contour extraction
The outline extractor SHALL accept a flat array of normalised 2D points (the merged point cloud from all sampled subpaths) and return a single closed contour computed via concave hull. The hull SHALL be parameterised by a `concavity` scalar: higher values produce a more convex result (approaching the convex hull); lower values produce a tighter fit that captures finer concavities. The default `concavity` SHALL be tuned to capture body-scale negative space (e.g. the gap between an eagle's wing tips, the inner curve of a crescent) while smoothing over stroke-scale noise (e.g. gaps between individual feather strokes in line-art).

#### Scenario: Connected filled shape produces correct silhouette
- **WHEN** the point cloud consists of the boundary of a single filled polygon (e.g. a Phosphor icon path)
- **THEN** the concave hull contour closely follows the polygon boundary

#### Scenario: Disconnected line-art strokes produce whole-shape silhouette
- **WHEN** the point cloud consists of hundreds of thin disconnected stroke polygons (e.g. vtracer line-art output)
- **THEN** the concave hull contour encloses the entire word shape, not just the densest stroke cluster

#### Scenario: Body-scale concavities are preserved
- **WHEN** the shape has significant negative space at body scale (e.g. the gap between spread wings)
- **THEN** the hull contour reflects that concavity rather than bridging it with a straight edge

#### Scenario: Stroke-scale gaps are smoothed
- **WHEN** the point cloud has small gaps between nearby stroke segments (e.g. feather spacing in a bird drawing)
- **THEN** the hull contour bridges those gaps rather than following each individual stroke boundary

#### Scenario: Degenerate input returns null
- **WHEN** the point cloud contains fewer than 3 points
- **THEN** the extractor returns null rather than producing a degenerate contour
