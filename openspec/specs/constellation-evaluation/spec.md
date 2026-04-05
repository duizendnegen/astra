## Requirements

### Requirement: MatcherConfig accepts scorer field
`MatcherConfig` SHALL include an optional `scorer` field typed as
`'edge-ratio' | 'vertex-fit' | 'procrustes'`. When omitted, the matcher SHALL default to
`'edge-ratio'`, preserving existing behaviour.

#### Scenario: Default scorer is edge-ratio
- **WHEN** `match()` is called with no `scorer` field
- **THEN** candidates are ranked by edge-length ratio score, identical to pre-change behaviour

### Requirement: vertex-fit scorer
The `vertex-fit` scorer SHALL compute the normalised mean positional error between each
Hungarian-assigned star and its corresponding skeleton vertex physical position:
`loss = mean_i(distanceDeg(star_i, vertex_i_physical) / span)` where `span` is the maximum
pairwise distance between skeleton vertices in degrees.
Final score: `1 / (1 + loss)`. This scorer SHALL be used to select among Phase 3 candidates when
`scorer === 'vertex-fit'`.

#### Scenario: Perfect vertex fit scores 1.0
- **WHEN** every assigned star lands exactly on its skeleton vertex
- **THEN** `vertex-fit` score is 1.0

#### Scenario: Large offset reduces score
- **WHEN** the mean positional error is 0.5 × span
- **THEN** `vertex-fit` score is `1 / (1 + 0.5)` ≈ 0.667

### Requirement: procrustes scorer
The `procrustes` scorer SHALL, after Hungarian assignment, find the optimal rigid alignment
(rotation + uniform scale + translation) between the assigned star positions and the skeleton
vertices using the Procrustes method, then compute the mean residual distance between aligned
positions and targets. Final score: `1 / (1 + meanResidualDeg / span)`.
This scorer SHALL be used to select among Phase 3 candidates when `scorer === 'procrustes'`.
ICP iteration is NOT performed in the initial implementation (noted as `TODO(procrustes-icp)`).

#### Scenario: Procrustes score independent of global scale
- **WHEN** the constellation is correctly shaped but at a different scale than the skeleton
- **THEN** Procrustes optimal scaling normalises the scale difference and the residual is near zero

### Requirement: shapeScore and vertexFitScore always returned
`MatchResult` SHALL always include:
- `shapeScore: number` — the edge-length ratio score (existing field, previously unnamed in result)
- `vertexFitScore: number` — the vertex-fit score (always computed after Phase 3)

These SHALL be present regardless of which `scorer` was used for candidate selection.

#### Scenario: Both scores present with edge-ratio scorer
- **WHEN** `scorer === 'edge-ratio'` and a match is found
- **THEN** `result.shapeScore` and `result.vertexFitScore` are both populated

#### Scenario: Both scores present with vertex-fit scorer
- **WHEN** `scorer === 'vertex-fit'` and a match is found
- **THEN** `result.shapeScore` and `result.vertexFitScore` are both populated

### Requirement: procrustes-unit-scale scorer
The `procrustes-unit-scale` scorer SHALL perform Procrustes alignment with **scale fixed at 1.0**
(rotation + translation only; the free-scale step is omitted). The score SHALL be
`1 / (1 + meanResidualDeg / ORION_SPAN_DEG)` where `ORION_SPAN_DEG = 25` (a module-level
constant, not the actual physVerts span). The result SHALL be stored in `procrustesScore` in the
returned `MatchResult`.

During Phase 3 candidate comparison, when this scorer is active, the selection score SHALL be
`procrustesUnitScaleScore × spanFactor` where:
```
excess    = max(0, physSpan − 30°, 20° − physSpan)
spanFactor = exp(−excess / ORION_SPAN_DEG)
```
and `physSpan` is `computeSpan(physVerts)` for the candidate being evaluated. The span factor
SHALL NOT be stored in `MatchResult`; it is only used for candidate ranking.

#### Scenario: unit-scale Procrustes penalises inflated-size solution
- **WHEN** physVerts span is 25° but the Hungarian-assigned stars form a 33° arrangement
- **THEN** with `procrustes-unit-scale`, the residual after rotation+translation (no rescaling) is
  substantial, scoring lower than a 25° star arrangement of equal quality

#### Scenario: unit-scale Procrustes scores same as free-scale when scale = 1
- **WHEN** the assigned stars are exactly at their physVerts positions (scale = 1, no drift)
- **THEN** the `procrustes-unit-scale` score equals 1.0, identical to `procrustes`

#### Scenario: span factor is 1.0 within flat zone
- **WHEN** physVerts span is 22° (within [20°, 30°])
- **THEN** spanFactor = 1.0 and selection score equals the raw Procrustes-unit-scale score

#### Scenario: span factor penalises placements above 30°
- **WHEN** physVerts span is 40° (10° above flat zone top)
- **THEN** spanFactor = exp(−10/25) ≈ 0.67 and selection score is multiplied by 0.67

#### Scenario: span factor penalises placements below 20°
- **WHEN** physVerts span is 10° (10° below flat zone bottom)
- **THEN** spanFactor = exp(−10/25) ≈ 0.67 and selection score is multiplied by 0.67

### Requirement: procrustesScore returned when scorer is procrustes
`MatchResult` SHALL include an optional `procrustesScore?: number`. It SHALL be populated when
`scorer === 'procrustes'` and SHALL be omitted (or undefined) otherwise.

#### Scenario: procrustesScore present with procrustes scorer
- **WHEN** `scorer === 'procrustes'` and a match is found
- **THEN** `result.procrustesScore` is a number between 0 and 1

#### Scenario: procrustesScore absent with other scorers
- **WHEN** `scorer === 'edge-ratio'` and a match is found
- **THEN** `result.procrustesScore` is undefined
