## Requirements

### Requirement: MatcherConfig type
The system SHALL export a `MatcherConfig` interface from `matcher.ts` with a required `model` field (`'simple' | 'vertex' | 'spread'`) and optional numeric override fields for every tunable constant in both the search strategy and scoring layers.

#### Scenario: Model field is required
- **WHEN** a caller constructs a MatcherConfig
- **THEN** omitting `model` is a TypeScript compile error

#### Scenario: All numeric constants are optional overrides
- **WHEN** a caller provides `{ model: 'vertex', distanceThreshold: 0.08 }`
- **THEN** the matcher uses the vertex model's defaults for all other constants and 0.08 for distanceThreshold

### Requirement: Named model registry
The system SHALL define three named models — `simple`, `vertex`, `spread` — each implementing the internal `ScoringModel` interface. Models SHALL be stored in a registry keyed by the model name string.

#### Scenario: Unknown model string is a type error
- **WHEN** a caller passes a string not in `'simple' | 'vertex' | 'spread'`
- **THEN** TypeScript reports a type error at compile time

#### Scenario: All three models are registered
- **WHEN** the module is loaded
- **THEN** `MODELS['simple']`, `MODELS['vertex']`, and `MODELS['spread']` all resolve to valid ScoringModel objects

### Requirement: Config resolution
The system SHALL merge the named model's defaults with any per-call overrides at the start of `match()`, producing a `ResolvedConfig`. Call-level overrides SHALL take precedence over model defaults.

#### Scenario: Override wins over model default
- **WHEN** the vertex model default for `distanceThreshold` is 0.15 and the caller passes `{ model: 'vertex', distanceThreshold: 0.07 }`
- **THEN** `ResolvedConfig.distanceThreshold` is 0.07

#### Scenario: Missing override falls back to model default
- **WHEN** the caller passes `{ model: 'simple' }` with no numeric overrides
- **THEN** all fields in `ResolvedConfig` take their values from the simple model's defaults

### Requirement: Default model is `vertex`
When `match()` is called without a config argument, the system SHALL behave as if `{ model: 'vertex' }` was passed, producing results identical to the pre-abstraction algorithm.

#### Scenario: No config produces vertex behaviour
- **WHEN** `match(catalogue, skeletons)` is called without a fourth argument
- **THEN** the result is identical to `match(catalogue, skeletons, undefined, { model: 'vertex' })`

### Requirement: `simple` model uses pure edge distance
The `simple` model SHALL score each star by minimum point-to-segment distance only, with no vertex bonus and no spread score. Its `vertexBonus` function SHALL return 0 for all inputs. Its `spreadScore` function SHALL return 0 for all inputs.

#### Scenario: Simple model ignores vertex proximity
- **WHEN** a star is near a skeleton endpoint vertex but farther from the edge interior
- **THEN** the simple model assigns no bonus — its effective distance equals the raw segment distance

### Requirement: `vertex` model uses Gaussian vertex bonus
The `vertex` model SHALL apply a Gaussian proximity reduction to the segment distance, with separate bonus magnitudes for degree-1 endpoint vertices (`vertexBonusEndpoint`) and degree-2+ joint vertices (`vertexBonusJoint`). Its `spreadScore` function SHALL return 0.

#### Scenario: Endpoint vertex receives larger bonus than joint
- **WHEN** two stars are equidistant from their respective nearest vertices under the vertex model
- **THEN** the star near a degree-1 endpoint receives a larger effective distance reduction

### Requirement: `spread` model adds edge-coverage score
The `spread` model SHALL use the same vertex bonus as `vertex` and additionally compute an edge-coverage fraction: the number of skeleton edges with at least one matched star within `distanceThreshold`, divided by total edge count. The final score SHALL be `coverageRatio + spreadWeight * edgeCoverageFraction`.

#### Scenario: Evenly distributed match scores higher than clustered match
- **WHEN** two candidate patches have the same raw coverage ratio but one has matched stars on every skeleton edge and the other has all matched stars on half the edges
- **THEN** the spread model assigns a higher score to the evenly distributed patch

#### Scenario: spreadWeight is overridable
- **WHEN** a caller passes `{ model: 'spread', spreadWeight: 0.4 }`
- **THEN** the edge-coverage bonus is weighted at 0.4 instead of the default 0.2
