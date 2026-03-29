## MODIFIED Requirements

### Requirement: Constellation stars selected per skeleton vertex
The system SHALL select up to `MAX_CONSTELLATION_STARS` (8) stars from the on-pattern matched set to form `constellationStars`. For each skeleton vertex, the best unclaimed matched star SHALL be selected by composite score `d_vtx + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)`, where lower score is better. Degree-1 (endpoint) vertices SHALL be processed before degree-2+ (joint) vertices. Both `d_vtx` and `BRIGHTNESS_WEIGHT` SHALL operate in the shared physical frame (fraction of patch radius), so the balance between geometry and brightness is consistent across dense and sparse patches.

#### Scenario: Endpoint vertices filled first
- **WHEN** the skeleton has both endpoint and joint vertices
- **THEN** each endpoint vertex claims its best available star before any joint vertex is processed

#### Scenario: Uniqueness enforced
- **WHEN** a star has been claimed by one vertex
- **THEN** it is not available for selection by any subsequent vertex

#### Scenario: Cap at eight stars
- **WHEN** the skeleton has more than 8 vertices
- **THEN** at most 8 stars are included in `constellationStars`, with endpoint vertices prioritised

#### Scenario: Brightness weight stable across patch densities
- **WHEN** two patches have very different star densities (dense cluster vs. sparse field)
- **THEN** `BRIGHTNESS_WEIGHT` contributes the same relative influence on vertex star selection in both cases, because `d_vtx` is in a fixed physical frame rather than a density-dependent normalised space

### Requirement: Brightness weighting in vertex star selection
A star's selection score SHALL be `d_vtx + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)` where `BRIGHTNESS_WEIGHT = 0.3` and `MAX_MAG = 6.0`. `d_vtx` SHALL be the distance from the star to the skeleton vertex in the shared physical frame (fraction of patch radius). Among matched stars near a vertex, a significantly brighter star at slightly greater distance MAY score better than a dimmer star at minimum distance.

#### Scenario: Bright star preferred over dim star at same proximity
- **WHEN** two matched stars are near the same vertex with similar distances
- **THEN** the brighter star (lower magnitude) receives the lower composite score and is selected

#### Scenario: Very distant bright star does not displace proximate dim star
- **WHEN** a bright star is far outside the effective distance range for a vertex
- **THEN** the closer dim star is selected (proximity dominates at large distance differences)

### Requirement: Edge fallback for unmatched vertices
If no matched star is within `DISTANCE_THRESHOLD` of a vertex's position, the system SHALL consider all matched stars on the vertex's adjacent edges as candidates for that vertex's slot.

#### Scenario: Vertex with no nearby star uses edge candidates
- **WHEN** no matched star falls within threshold of a vertex
- **THEN** the nearest matched star on any adjacent edge is used as the candidate for that vertex slot
