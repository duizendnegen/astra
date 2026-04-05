## MODIFIED Requirements

### Requirement: Matcher execution
For each word, the runner SHALL call `match(catalogue, skeletons.skeletons, undefined, cfg)` from
`lambda/src/matcher.ts` using the full star catalogue loaded from `frontend/public/data/stars.json`.
`cfg` SHALL include `generator` and `scorer` values derived from CLI flags `--generator` and
`--scorer` when provided. After matching, the runner SHALL call `renderPatch` and write the result
to `reports/{runId}/{word}.png`.

#### Scenario: Successful match
- **WHEN** the matcher returns a result
- **THEN** the runner records all metrics (including `shapeScore` and `vertexFitScore`) AND writes `{word}.png` to the run directory

#### Scenario: No match found
- **WHEN** `match()` returns null
- **THEN** the runner records score=0, writes a "no match" placeholder PNG to `{word}.png`

#### Scenario: Generator and scorer flags forwarded to matcher
- **WHEN** the runner is invoked with `--generator any-vertex --scorer vertex-fit`
- **THEN** `cfg.generator === 'any-vertex'` and `cfg.scorer === 'vertex-fit'` are passed to `match()`

## ADDED Requirements

### Requirement: --words flag for subset runs
The runner SHALL accept `--words <word1,word2,...>` as a CLI argument. When provided, the runner
SHALL process only the listed words (looked up against the full word list). Words not found in the
word list SHALL cause the runner to exit with a descriptive error. When omitted, all words are
processed as before.

#### Scenario: Subset run
- **WHEN** `--words guitar,crown,sword,bunny` is provided
- **THEN** only those four words are processed and the results file contains exactly four entries

#### Scenario: Unknown word rejected
- **WHEN** `--words guitar,nonexistent` is provided
- **THEN** the runner exits with an error identifying `nonexistent` as not in the word list

### Requirement: patchStars collection radius adapts to constellation size

When a match is found, the harness SHALL collect patch stars within
`max(PATCH_RADIUS_DEG, angularSize × 0.7)` degrees of `patchRA/patchDec`, where
`angularSize = maxPairwiseAngularDist(matchResult.stars)`. The effective radius SHALL be passed to
`renderPatch` via `RenderOpts.patchRadiusDeg` so the stereographic projection scales to show the
full constellation. When no match is found, `PATCH_RADIUS_DEG` (10°) is used.

#### Scenario: Large constellation fully visible
- **WHEN** the matched constellation spans 24° and the default patch radius is 10°
- **THEN** patchStars are collected within max(10°, 24° × 0.7) = 16.8° and the render shows the full shape

#### Scenario: Small constellation uses minimum radius
- **WHEN** the matched constellation spans 6°
- **THEN** patchStars collected within max(10°, 4.2°) = 10° — unchanged from default

### Requirement: Permutations bash script
A script `test-harness/run-permutations.sh` SHALL run all 9 generator × scorer combinations
(`anchor-pair`, `single-sweep`, `any-vertex`) × (`edge-ratio`, `vertex-fit`, `procrustes`) on the
fixed 4-word subset (`guitar`, `crown`, `sword`, `bunny`). Each combination SHALL be run with:
- `--run-id <generator>-<scorer>` (e.g. `anchor-pair-edge-ratio`)
- `--generator <generator>`
- `--scorer <scorer>`
- `--words guitar,crown,sword,bunny`
- `--fixtures-dir fixtures` (use existing fixtures; no API calls)

The script SHALL print a summary line for each combination as it starts and SHALL exit non-zero if
any individual run fails.

#### Scenario: All 9 combinations execute
- **WHEN** `run-permutations.sh` is run with all fixtures present
- **THEN** 9 run directories are created under `test-harness/reports/`, one per combination

#### Scenario: Script fails fast on error
- **WHEN** one combination's `run.ts` invocation exits non-zero
- **THEN** the script exits immediately with a non-zero status and prints which combination failed

#### Scenario: Idempotent re-run
- **WHEN** `run-permutations.sh` is run a second time
- **THEN** existing run directories are overwritten (runner uses explicit `--run-id`; no conflict)
