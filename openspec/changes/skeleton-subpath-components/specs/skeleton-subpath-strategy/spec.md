## ADDED Requirements

### Requirement: Subpath-components strategy implementation
The `svgToSkeleton` function SHALL support a `strategy: 'subpath-components'` option that builds a multi-component skeleton graph by treating each SVG subpath as an independent structural element, rather than collapsing all subpaths into a single outer contour.

#### Scenario: Bicycle produces two circular subpath clusters
- **WHEN** `svgToSkeleton` is called with a bicycle SVG and `strategy: 'subpath-components'`
- **THEN** the resulting skeleton contains distinct point clusters corresponding to the two wheel subpaths, connected by bridge edges, rather than a single closed loop around the outer silhouette

#### Scenario: Single-subpath SVG falls back to concave-hull
- **WHEN** the SVG contains only one subpath and `strategy: 'subpath-components'` is used
- **THEN** the skeleton is produced identically to `strategy: 'concave-hull'`

### Requirement: Per-subpath point budget allocation
The strategy SHALL allocate the total point budget (`targetMax`) across subpaths proportionally to each subpath's raw sampled point count (used as a perimeter proxy). Each subpath SHALL receive a minimum of 3 points. If the sum of allocated points exceeds `targetMax`, the allocations SHALL be scaled down proportionally before simplification.

#### Scenario: Large subpaths receive more points
- **WHEN** one subpath has 100 raw points and another has 20, with targetMax=40
- **THEN** the first subpath receives approximately 33 points and the second approximately 7 (subject to minimum of 3)

#### Scenario: Minimum allocation enforced
- **WHEN** a subpath's proportional share is less than 3 points
- **THEN** it is allocated exactly 3 points

### Requirement: Intra-subpath closed loop edges
For each subpath, the strategy SHALL build a closed sequential edge loop connecting points within that subpath. Edge indices SHALL be globally offset by the cumulative point count of preceding subpaths.

#### Scenario: Two-subpath edge structure
- **WHEN** subpath A has 10 simplified points (indices 0–9) and subpath B has 8 (indices 10–17)
- **THEN** edges include [0,1],[1,2],…,[8,9],[9,0] for subpath A and [10,11],…,[16,17],[17,10] for subpath B

### Requirement: Inter-subpath proximity bridge edges
For each subpath, the strategy SHALL add one bridge edge connecting the nearest point in that subpath to the nearest point in any other subpath. Bridge edges SHALL not duplicate already-added bridges (if subpath A bridges to subpath B, subpath B need not add a separate bridge to A).

#### Scenario: Bridge connects closest subpaths
- **WHEN** the nearest cross-subpath point pair is point 5 (subpath A) and point 12 (subpath B)
- **THEN** edge [5, 12] is present in the skeleton

#### Scenario: No duplicate bridges
- **WHEN** subpath A's nearest neighbour is subpath B and vice versa
- **THEN** only one bridge edge [a, b] appears in the output, not two
