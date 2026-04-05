## Requirements

### Requirement: MatcherConfig accepts generator field
`MatcherConfig` SHALL include an optional `generator` field typed as
`'anchor-pair' | 'single-sweep' | 'any-vertex'`. When omitted, the matcher SHALL default to
`'anchor-pair'`, preserving existing behaviour.

#### Scenario: Default generator is anchor-pair
- **WHEN** `match()` is called with `{ model: 'vertex-penalty' }` (no `generator` field)
- **THEN** the matcher runs the pairwise anchor search pipeline, identical to pre-change behaviour

#### Scenario: Explicit generator selection
- **WHEN** `match()` is called with `{ model: 'vertex-penalty', generator: 'single-sweep' }`
- **THEN** the matcher uses the single-sweep placement generator

### Requirement: anchor-pair generator wraps existing three-phase pipeline
The `anchor-pair` generator SHALL run the existing Phase 1 / Phase 2 / Phase 3 pairwise anchor
search pipeline unchanged and yield the set of Hungarian-assigned candidates for scorer selection.

#### Scenario: anchor-pair produces same candidates as pre-change
- **WHEN** `generator` is `'anchor-pair'` and the word is `guitar`
- **THEN** the set of Phase 3 candidates produced is identical to the pre-change matcher output

### Requirement: single-sweep generator
The `single-sweep` generator SHALL enumerate every star in the catalogue as a seed and, for each
seed, sweep rotations at `rotationSteps` intervals (default 24, i.e. every 15°) across six scale
factors (5°, 10°, 15°, 20°, 25°, 30° span). For each (seed, rotation, scale) triple the skeleton
SHALL be physically placed with the skeleton centroid pinned to the seed star, then prescreened
with `hasStarNear`. The top 2000 candidates by prescreen score SHALL advance to Phase 2 greedy
scoring, then Phase 3 Hungarian refinement.

#### Scenario: Unconstrained orientation found
- **WHEN** the best constellation has its principal axis not aligned to any real star pair
- **THEN** single-sweep finds it because rotation is enumerated independently of star positions

#### Scenario: Candidate cap applied
- **WHEN** Phase 1 prescreen produces more than 2000 candidates
- **THEN** only the top 2000 (by prescreen score) advance to Phase 2

#### Scenario: Large constellation scale covered
- **WHEN** the natural star-matching scale for guitar is ~25°
- **THEN** single-sweep evaluates a 25° span placement and it may advance through Phase 2 and 3

### Requirement: any-vertex generator
The `any-vertex` generator SHALL enumerate every (star S, skeleton vertex V) pair. For each pair,
the generator SHALL enumerate all of V's skeleton neighbours (not just the nearest). For each
neighbour U, the rotation SHALL be derived by aligning the V→U skeleton direction to the S→T sky
direction, where T is S's nearest star within 15°. The derived physScale SHALL be clamped to
[2°, 30°] per normalised unit and pairs outside this range SHALL be skipped. Physical vertex
positions SHALL be computed and prescreened with `hasStarNear`. The top 2000 candidates by
prescreen score SHALL advance to Phase 2 and Phase 3.

#### Scenario: All skeleton neighbours explored per vertex
- **WHEN** vertex V has 3 skeleton neighbours and star S has a second star within 15°
- **THEN** 3 candidate placements are generated (one per skeleton neighbour)

#### Scenario: Scale out-of-range pair skipped
- **WHEN** the derived physScale for a (S, V, U) triple would place the skeleton at 60° span
- **THEN** the triple is skipped without error

#### Scenario: Missing second star skips pair
- **WHEN** star S has no star within 15°
- **THEN** all (S, V) pairs are skipped without error

#### Scenario: Candidate cap applied
- **WHEN** Phase 1 prescreen produces more than 2000 candidates
- **THEN** only the top 2000 advance to Phase 2
