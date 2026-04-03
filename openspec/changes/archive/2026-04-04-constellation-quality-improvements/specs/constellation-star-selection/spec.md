## MODIFIED Requirements

### Requirement: Constellation stars selected per skeleton vertex
The system SHALL select up to `maxConstellationStars` stars (from `ResolvedConfig`) from the on-pattern matched set to form `constellationStars`. The composite score SHALL be `d_vtx + brightnessWeight * (mag / MAX_MAG)`, where `brightnessWeight` comes from `ResolvedConfig`. Degree-1 (endpoint) vertices SHALL be processed before degree-2+ (joint) vertices. All constants used in selection SHALL come from `ResolvedConfig`, not from module-level globals.

The default value of `maxConstellationStars` SHALL be raised from 8 to 12, allowing up to one star per skeleton vertex for typical skeletons.

#### Scenario: Endpoint vertices filled first
- **WHEN** the skeleton has both endpoint and joint vertices
- **THEN** each endpoint vertex claims its best available star before any joint vertex is processed

#### Scenario: Uniqueness enforced
- **WHEN** a star has been claimed by one vertex
- **THEN** it is not available for selection by any subsequent vertex

#### Scenario: maxConstellationStars override respected
- **WHEN** `match()` is called with `{ model: 'vertex', maxConstellationStars: 5 }`
- **THEN** at most 5 stars appear in `constellationStars`

#### Scenario: Default allows up to 12 constellation stars
- **WHEN** `match()` is called without overriding maxConstellationStars
- **THEN** up to 12 stars may appear in constellationStars
