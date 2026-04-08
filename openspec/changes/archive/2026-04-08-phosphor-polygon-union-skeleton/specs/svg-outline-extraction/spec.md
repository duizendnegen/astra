## MODIFIED Requirements

### Requirement: Concave hull contour extraction
The outline extractor SHALL accept a flat array of normalised 2D points (the merged point cloud from all sampled subpaths) and return a single closed contour computed via concave hull. The hull SHALL be parameterised by a `concavity` scalar: higher values produce a more convex result (approaching the convex hull); lower values produce a tighter fit that captures finer concavities. The default `concavity` SHALL be tuned to capture body-scale negative space (e.g. the gap between an eagle's wing tips, the inner curve of a crescent) while smoothing over stroke-scale noise (e.g. gaps between individual feather strokes in line-art).

This strategy SHALL be used when `strategy` is `'concave-hull'` (the default). It is appropriate for LLM-generated SVGs and line-art silhouettes.

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

## ADDED Requirements

### Requirement: Polygon-union contour extraction
The outline extractor SHALL support a second contour strategy: `'polygon-union'`. When selected, it SHALL treat each sampled subpath as a polygon, compute the boolean union of all subpath polygons using `polygon-clipping`, and return the outer ring of the largest resulting polygon by area.

This strategy SHALL be used for filled vector icons (Phosphor) where subpaths use even-odd fill rules that create holes and cutouts. It correctly merges overlapping shapes and preserves negative space rather than filling it.

If the union computation fails (e.g. degenerate geometry), the extractor SHALL fall back to concatenating all subpath points and returning them as the contour.

#### Scenario: Filled icon with hole produces correct outer boundary
- **WHEN** a Phosphor icon has a circle cutout inside a square (two subpaths with even-odd fill)
- **THEN** the polygon-union contour traces the outer square boundary, not a blob that fills the hole

#### Scenario: Multiple non-overlapping subpaths produce largest region
- **WHEN** an icon has two disconnected filled regions of different sizes
- **THEN** the polygon-union contour returns the outer ring of the larger region

#### Scenario: Union failure falls back gracefully
- **WHEN** the polygon-clipping union raises an error (e.g. degenerate collinear input)
- **THEN** the extractor falls back to the concatenated flat point list rather than returning null

#### Scenario: Degenerate input returns empty
- **WHEN** the subpath list is empty or contains fewer than 3 total points
- **THEN** the extractor returns an empty array
