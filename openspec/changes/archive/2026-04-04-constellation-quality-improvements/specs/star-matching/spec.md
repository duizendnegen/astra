## MODIFIED Requirements

### Requirement: Deterministic bright-star seed sweep
The system SHALL sweep all stars with magnitude ≤ `seedMaxMag` (from ResolvedConfig) as candidate seed centres, in ascending magnitude order. For each seed, all catalogue stars within `patchRadius` (from ResolvedConfig) SHALL be gathered as candidates. All rotation steps (count from `rotationSteps` in ResolvedConfig) SHALL be tested per seed.

For each seed, the system SHALL additionally try anchoring the skeleton at each of its skeleton vertex positions (not only at the skeleton centroid). The effective seed position for scoring SHALL be the seed star projected onto the vertex-anchored skeleton frame. The best (vertex-anchor, rotation) combination SHALL be retained for that seed.

#### Scenario: Sweep covers bright regions deterministically
- **WHEN** matching begins
- **THEN** every star at mag ≤ seedMaxMag is used as a seed with no random sampling

#### Scenario: rotationSteps override changes sweep granularity
- **WHEN** `match()` is called with `{ model: 'vertex', rotationSteps: 24 }`
- **THEN** 24 rotation orientations are tested per seed (every 15°) instead of the model default 12 (every 30°)

#### Scenario: Vertex anchoring tried for each seed
- **WHEN** a seed star is evaluated against a skeleton with N vertices
- **THEN** N vertex-anchor positions are tested, each with the full rotation sweep, and the best is retained

### Requirement: Vertex bonus uses subtractive Gaussian formulation
The vertex model's effective distance calculation SHALL use a subtractive Gaussian: `effectiveDist = max(0, dSeg - bonus * exp(-(dVtx² / vertexSigma²)))`, where `bonus` is `vertexBonusEndpoint` for degree-1 vertices and `vertexBonusJoint` for degree-2+ vertices. This replaces the previous multiplicative `dSeg * (1 - bonus)` formula. Effective distance SHALL be clamped to zero and never go negative.

#### Scenario: Star exactly at endpoint vertex gets zero effective distance
- **WHEN** a star coincides with a degree-1 skeleton vertex (dVtx ≈ 0) and vertexBonusEndpoint ≥ dSeg
- **THEN** effectiveDist is clamped to 0

#### Scenario: Star far from all vertices uses edge distance
- **WHEN** a star is far from all vertices (dVtx >> vertexSigma)
- **THEN** the Gaussian term approaches 0 and effectiveDist ≈ dSeg

## ADDED Requirements

### Requirement: vertex-penalty model registered
The `vertex-penalty` model SHALL be registered in the `MODELS` record and accepted by `resolveConfig`. Its scoring function is defined in the `vertex-penalty-model` capability spec.

#### Scenario: vertex-penalty model resolves without error
- **WHEN** `resolveConfig({ model: 'vertex-penalty' })` is called
- **THEN** a valid ResolvedConfig is returned with the vertex-penalty model's defaults
