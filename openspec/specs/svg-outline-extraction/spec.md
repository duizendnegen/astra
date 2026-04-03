## ADDED Requirements

### Requirement: Boolean union of subpath polygons
The outline extractor SHALL accept a set of dense polygon rings (one per SVG subpath) and compute their boolean union, returning a single MultiPolygon result. The union SHALL correctly handle overlapping subpaths, self-touching regions, and subpaths with opposing winding directions.

#### Scenario: Overlapping subpaths merge into one region
- **WHEN** two subpath polygons overlap
- **THEN** the union result contains a single outer boundary enclosing both

#### Scenario: Non-overlapping subpaths produce separate regions
- **WHEN** two subpath polygons are fully disjoint
- **THEN** the union result contains two separate polygons

### Requirement: Outer boundary extraction
The outline extractor SHALL extract only the outer boundary ring from the union result. When the union produces multiple disjoint polygons, the extractor SHALL select the polygon with the largest outer-ring area. All hole rings SHALL be discarded.

#### Scenario: Largest region selected from disjoint union
- **WHEN** the union produces two disjoint polygons of different sizes
- **THEN** the outer ring of the larger polygon is returned

#### Scenario: Holes discarded
- **WHEN** the union result contains a polygon with hole rings (e.g. inner cutouts)
- **THEN** only the outer ring points are returned; hole ring points are omitted

### Requirement: Fallback on union error
The outline extractor SHALL catch any error thrown by the boolean union operation and fall back to returning the concatenated dense points of all subpaths (the pre-union behaviour). The fallback SHALL be logged for diagnostics.

#### Scenario: Union error triggers fallback
- **WHEN** the boolean union throws an exception (e.g. degenerate input)
- **THEN** the extractor returns the original concatenated dense point set without crashing
