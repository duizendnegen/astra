## MODIFIED Requirements

### Requirement: Constellation stars assigned via Hungarian algorithm
The system SHALL select `constellationStars` by solving a bipartite assignment problem between
skeleton vertices and nearby candidate stars. For each candidate from Phase 3 of the pairwise
anchor search, the K=20 nearest stars per vertex SHALL be gathered into a union pool. A cost matrix
of `distance + brightnessWeight × (mag / 6)` SHALL be built (rows = vertices up to
`maxConstellationStars`, columns = pooled stars) and solved using the Jonker-Volgenant Hungarian
algorithm to minimise total cost. The result SHALL be one star per vertex in skeleton vertex index
order, so `constellationStars[i]` is the star assigned to vertex `i`.

#### Scenario: Stars spread across full skeleton
- **WHEN** the candidate pool contains stars distributed across all skeleton vertices
- **THEN** the Hungarian assignment produces stars drawn from across the skeleton, not clustered in the densest region

#### Scenario: Vertex index order preserved
- **WHEN** the skeleton has vertices indexed 0–N
- **THEN** `constellationStars[i]` is the star assigned to vertex `i` for all i in 0–N

#### Scenario: Uniqueness enforced
- **WHEN** a star has been assigned to one vertex
- **THEN** it is not available for assignment to any other vertex (bipartite matching guarantees uniqueness)

#### Scenario: Brightness weighted in cost matrix
- **WHEN** two candidate stars are equidistant from a vertex
- **THEN** the brighter star (lower magnitude) receives the lower cost and is preferred

#### Scenario: maxConstellationStars caps vertex count
- **WHEN** `match()` is called with `{ maxConstellationStars: 5 }`
- **THEN** at most 5 vertices participate in assignment, producing at most 5 `constellationStars`

#### Scenario: brightnessWeight override respected
- **WHEN** `match()` is called with `{ brightnessWeight: 0.0 }`
- **THEN** assignment is based purely on angular distance with no brightness preference

### Requirement: Pool expansion when candidates are sparse
If fewer than `minMatchedStars` stars are found in the initial 3° pool for a candidate, that
candidate SHALL be skipped. For individual vertices where the initial 3° radius yields fewer than
K=20 stars, the search SHALL expand to 6°.

#### Scenario: Sparse region skips candidate
- **WHEN** the nearby star pool for a Phase 3 candidate contains fewer than `minMatchedStars` stars
- **THEN** that candidate is not assigned and the next Phase 3 candidate is evaluated
