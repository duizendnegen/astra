## 1. Prerequisite

- [x] 1.1 Confirm `fix-normalization` is complete — model constants will be expressed in the stable physical frame

## 2. Types and Interface

- [x] 2.1 Add `MatcherConfig` interface to `matcher.ts`: required `model: 'simple' | 'vertex' | 'spread'` plus all optional numeric override fields (seedMaxMag, patchRadius, maxPatchRadius, patchRadiusStep, qualityThreshold, coverageThreshold, minMatchedStars, rotationSteps, distanceThreshold, vertexBonusEndpoint, vertexBonusJoint, vertexSigma, brightnessWeight, maxConstellationStars, spreadWeight)
- [x] 2.2 Add internal `ModelDefaults` type (all numeric fields required) and `ResolvedConfig` type (ModelDefaults with model name)
- [x] 2.3 Add internal `ScoringModel` interface with fields: `defaults: ModelDefaults`, `starLoss(d: number): number`, `vertexBonus(dVtx: number, degree: number, cfg: ResolvedConfig): number`, `spreadScore(matchedNorm: Point2D[], skelNorm: Point2D[], edges: [number,number][]): number`

## 3. Model Definitions

- [x] 3.1 Define the `simple` model object: `starLoss = d`, `vertexBonus = () => 0`, `spreadScore = () => 0`, defaults populated from current constants
- [x] 3.2 Define the `vertex` model object: `starLoss = d`, `vertexBonus` = Gaussian with endpoint/joint distinction, `spreadScore = () => 0`, defaults identical to current constants (this is the current algorithm)
- [x] 3.3 Define the `spread` model object: inherits vertex's `starLoss` and `vertexBonus`, adds `spreadScore` = edge-coverage fraction (edges with ≥1 matched star / total edges), defaults add `spreadWeight = 0.2`
- [x] 3.4 Create `MODELS` registry: `const MODELS: Record<'simple' | 'vertex' | 'spread', ScoringModel>`
- [x] 3.5 Implement `resolveConfig(config?: MatcherConfig): ResolvedConfig`: looks up model in registry, merges `model.defaults` with call overrides, returns flat resolved object

## 4. Refactor Internal Functions

- [x] 4.1 Add `cfg: ResolvedConfig` parameter to `effectiveDist`; replace all reads of `VERTEX_BONUS_ENDPOINT`, `VERTEX_BONUS_JOINT`, `VERTEX_SIGMA` with `cfg.*`; replace the Gaussian formula with a call to `model.vertexBonus` (accessed via cfg or passed explicitly)
- [x] 4.2 Add `cfg: ResolvedConfig` parameter to `scoreAndMatch`; replace all constant reads with `cfg.*`; replace score computation to call `model.spreadScore` and add the weighted bonus for the spread model
- [x] 4.3 Add `cfg: ResolvedConfig` parameter to `runSeedSweep`; replace `SEED_MAX_MAG`, `MIN_MATCHED_STARS`, `COVERAGE_THRESHOLD`, `ROTATION_STEPS` reads with `cfg.*`
- [x] 4.4 Add `cfg: ResolvedConfig` parameter to `selectConstellationStars`; replace `BRIGHTNESS_WEIGHT`, `MAX_MAG`, `MAX_CONSTELLATION_STARS` reads with `cfg.*`
- [x] 4.5 Remove the module-level constants block (all values now live in model defaults)

## 5. Update match() Public Signature

- [x] 5.1 Add optional `config?: MatcherConfig` as the fourth parameter to `match()`
- [x] 5.2 Call `resolveConfig(config)` at the top of `match()` to produce `cfg: ResolvedConfig`
- [x] 5.3 Pass `cfg` through to `runSeedSweep` and `match()`'s internal radius expansion loop; replace all remaining constant reads in `match()` with `cfg.*`

## 6. Test Harness Integration

- [x] 6.1 Add `--model <name>` CLI flag to `test-harness/run.ts`; validate it is one of `simple | vertex | spread`; default to `vertex`
- [x] 6.2 Pass the resolved model name as `{ model }` in the `match()` config argument in the runner

## 7. Validation

- [x] 7.1 Run `npm test` in `frontend/` — all existing unit tests must pass (no constant reads in test assertions should have broken)
- [x] 7.2 Run test harness with `--model vertex` and compare against the pre-abstraction baseline: score deltas must be zero for all words
- [x] 7.3 Run test harness with `--model simple` — confirm it produces valid results and scores are generally lower (no vertex bonus)
- [~] 7.4 Run test harness with `--model spread` — spread scores are NOT ≥ vertex: spread bonus inflates the score and causes early acceptance of poor-coverage patches (the bonus adds to the coverage ratio used for qualityThreshold and coverageThreshold checks, not just ranking). 34/42 words score lower than vertex. Needs a design fix: separate "search score" (for threshold checks) from "ranking score" (coverage + spread).
- [x] 7.5 Verify a constant override works end-to-end: `--model vertex --distanceThreshold 0.07` produces a different (stricter) result set — confirmed: drops from 0/19/23 to 0/3/39 green/amber/red. Note: required fixing `parseArgs()` to forward numeric override flags to `MatcherConfig`.
