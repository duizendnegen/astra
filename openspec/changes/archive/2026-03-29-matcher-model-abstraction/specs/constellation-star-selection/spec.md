## MODIFIED Requirements

### Requirement: Constellation stars selected per skeleton vertex
The system SHALL select up to `maxConstellationStars` stars (from `ResolvedConfig`) from the on-pattern matched set to form `constellationStars`. The composite score SHALL be `d_vtx + brightnessWeight * (mag / MAX_MAG)`, where `brightnessWeight` comes from `ResolvedConfig`. Degree-1 (endpoint) vertices SHALL be processed before degree-2+ (joint) vertices. All constants used in selection SHALL come from `ResolvedConfig`, not from module-level globals.

#### Scenario: Endpoint vertices filled first
- **WHEN** the skeleton has both endpoint and joint vertices
- **THEN** each endpoint vertex claims its best available star before any joint vertex is processed

#### Scenario: Uniqueness enforced
- **WHEN** a star has been claimed by one vertex
- **THEN** it is not available for selection by any subsequent vertex

#### Scenario: maxConstellationStars override respected
- **WHEN** `match()` is called with `{ model: 'vertex', maxConstellationStars: 5 }`
- **THEN** at most 5 stars appear in `constellationStars`

#### Scenario: brightnessWeight override respected
- **WHEN** `match()` is called with `{ model: 'spread', brightnessWeight: 0.0 }`
- **THEN** vertex star selection is based purely on geometric distance with no brightness preference

### Requirement: Brightness weighting in vertex star selection
`brightnessWeight` and `MAX_MAG` SHALL be read from `ResolvedConfig`. Their effect on selection is unchanged: a significantly brighter star at slightly greater distance may score better than a dimmer star at minimum distance.

#### Scenario: Bright star preferred over dim star at same proximity
- **WHEN** two matched stars are near the same vertex with similar distances
- **THEN** the brighter star receives the lower composite score and is selected

### Requirement: Edge fallback for unmatched vertices
If no matched star is within `distanceThreshold` of a vertex's position, the system SHALL consider all matched stars on the vertex's adjacent edges as candidates. This requirement is unchanged across all models.

#### Scenario: Vertex with no nearby star uses edge candidates
- **WHEN** no matched star falls within threshold of a vertex
- **THEN** the nearest matched star on any adjacent edge is used as the candidate for that vertex slot
