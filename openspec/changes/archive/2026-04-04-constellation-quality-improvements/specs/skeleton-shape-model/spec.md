## ADDED Requirements

### Requirement: skeleton-shape scoring model
The system SHALL provide a `skeleton-shape` scoring model in `matcher.ts`. This model scores a placement by comparing **star-to-star edge lengths** in the matched patch against **skeleton edge lengths** after scale+rotation alignment, rather than scoring individual star-to-vertex distances.

For a given seed+anchor-vertex+rotation placement:
1. An initial nearest-neighbour assignment maps each skeleton vertex `k` to the closest unassigned candidate star within `patchRadius`. Call this `assignment[k]`.
2. For each skeleton edge `[i, j]`, compute `starEdgeLen[i,j] = angularDist(stars[assignment[i]], stars[assignment[j]])`.
3. For each skeleton edge `[i, j]`, compute `skelEdgeLen[i,j]` from the aligned (scaled+rotated) skeleton.
4. Score = `1 / (1 + mean(|starEdgeLen[i,j] - skelEdgeLen[i,j]|))` over all edges. Score is in `(0, 1]`; higher is better.

If `skeletonShapeRefine` is enabled in `MatcherConfig`, the model SHALL additionally apply a hill-climbing swap step: for each pair of assigned vertices `(a, b)`, swap their star assignments if the swap reduces total edge-length mismatch; repeat until convergence or a maximum of 50 iterations, whichever comes first.

#### Scenario: Perfect shape match scores near 1
- **WHEN** the assigned stars sit exactly at scaled skeleton vertex positions
- **THEN** all `|starEdgeLen - skelEdgeLen|` terms are zero and score = 1.0

#### Scenario: Edge-length mismatch reduces score
- **WHEN** the assigned stars produce edge lengths that deviate from skeleton edge lengths by 0.1° on average
- **THEN** the score is less than `1 / (1 + 0.1)` ≈ 0.91

#### Scenario: Score is independent of vertex-distance details
- **WHEN** stars are assigned but some sit between vertices (not at them)
- **THEN** the score still reflects only edge-length match, not proximity to individual vertices

### Requirement: skeleton-shape model registered
The `skeleton-shape` model SHALL be registered in the `MODELS` record and accepted by `resolveConfig`. Its `ModelDefaults` SHALL include `skeletonShapeRefine: false`.

#### Scenario: skeleton-shape model resolves without error
- **WHEN** `resolveConfig({ model: 'skeleton-shape' })` is called
- **THEN** a valid `ResolvedConfig` is returned with `skeletonShapeRefine: false`

### Requirement: skeleton-shape available in harness
The `skeleton-shape` model name SHALL be accepted by the test harness `--model` flag. A `--skeleton-shape-refine` boolean flag SHALL be accepted and forwarded to `MatcherConfig`. Running `npm run harness -- --model skeleton-shape` SHALL produce a valid run with results and PNG thumbnails.

#### Scenario: Harness run with skeleton-shape model
- **WHEN** `npm run harness -- --model skeleton-shape` is executed
- **THEN** a report is generated without errors and all words are processed

#### Scenario: Harness run with refinement enabled
- **WHEN** `npm run harness -- --model skeleton-shape --skeleton-shape-refine` is executed
- **THEN** each word's score uses the hill-climbing swap step and the report is generated without errors