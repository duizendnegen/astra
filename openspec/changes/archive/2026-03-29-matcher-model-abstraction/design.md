## Context

`matcher.ts` currently reads ~12 module-level constants directly in `scoreAndMatch`, `effectiveDist`, `runSeedSweep`, and `selectConstellationStars`. Adding a model system means those reads must go through a config object instead. The refactor is mechanical but touches every internal function. The public `match()` API is unchanged in shape — only an optional fourth parameter is added.

## Goals / Non-Goals

**Goals:**
- Three named models selectable by string, each with independent defaults and scoring logic
- All constants overridable per call without defining a new model
- `{ model: 'vertex' }` (the default) produces bit-identical results to the current algorithm
- Test harness can pass `--model simple` / `--model spread` to compare runs

**Non-Goals:**
- Loss function variants (d², √d, Gaussian on edges) — that is future work; models today all use linear d for starLoss
- Runtime model switching mid-match
- Persisting model choice to share links or exports

## Decisions

### D1: ScoringModel interface holds logic + defaults, not just logic

Each model object bundles both its scoring functions and its default constant values:

```typescript
interface ScoringModel {
  defaults: ModelDefaults        // numeric constants for this model
  starLoss(d: number): number
  vertexBonus(dVtx: number, degree: number, cfg: ResolvedConfig): number
  spreadScore(matchedNorm: Point2D[], skelNorm: Point2D[], edges: [number,number][]): number
}
```

`ModelDefaults` contains every tunable constant. This keeps each model self-contained and makes it easy to inspect what a model does by reading one object.

**Alternative considered:** Separate default objects from scoring functions (defaults as plain constants, functions separately). Rejected: splitting them makes it harder to see what a model does at a glance.

### D2: ResolvedConfig is computed once at the start of match()

```typescript
function resolveConfig(config?: MatcherConfig): ResolvedConfig {
  const model = MODELS[config?.model ?? 'vertex']
  return { ...model.defaults, ...config }   // call overrides win
}
```

`ResolvedConfig` is the merged flat object. It is passed down to every internal function. No function reads globals.

**Alternative considered:** Pass the raw `MatcherConfig` + model object separately. Rejected: every call site would need to check for overrides. Merging once is cleaner.

### D3: Module-level constants become model defaults, not removed

The existing constants (`SEED_MAX_MAG`, `PATCH_RADIUS_DEG`, etc.) are moved into the `vertex` model's `defaults` object with the same values. They are no longer exported as module-level constants. Any code that imported them directly would need updating — but currently nothing outside matcher.ts imports them.

### D4: spreadScore is a weighted bonus on the coverage ratio

For the `spread` model, the final score is:

```
score = coverageRatio + SPREAD_WEIGHT * edgeCoverageFraction
```

Where `edgeCoverageFraction` = number of skeleton edges with at least one matched star within threshold, divided by total edges. `SPREAD_WEIGHT` defaults to `0.2` and is overridable.

This keeps the score range comparable to other models (still roughly 0–1.2 at most) and means the spread model will prefer patches where the skeleton is evenly covered even if the raw coverage ratio is slightly lower.

**Alternative considered:** Replace coverage ratio with spread score entirely. Rejected: pure spread ignores total star count and could prefer a sparse but evenly-spread result over a dense but slightly clustered one.

### D5: `simple` model's vertexBonus and spreadScore return 0

Rather than conditional logic in `scoreAndMatch`, every model provides all three functions. `simple.vertexBonus` returns `0`, `simple.spreadScore` returns `0`. This keeps `scoreAndMatch` uniform with no `if (model === 'simple')` branches.

### D6: MatcherConfig and ScoringModel types live in matcher.ts, not types.ts

`ScoringModel` is an internal implementation detail. `MatcherConfig` is the public-facing type. Both go in `matcher.ts` and `MatcherConfig` is exported. `types.ts` stays clean.

## Risks / Trade-offs

- **[Risk] `vertex` model produces slightly different results than current** → The merge of defaults + overrides must exactly reproduce the current constant values. Mitigation: run test harness with `--model vertex` against a pre-abstraction baseline and verify score deltas are zero.
- **[Risk] Internal function signatures get long** → Passing `ResolvedConfig` everywhere adds a parameter to `scoreAndMatch`, `effectiveDist`, `runSeedSweep`, `selectConstellationStars`. Mitigation: acceptable — these are all internal; the public API is unchanged.
- **[Trade-off] starLoss is not yet pluggable** → All three models use linear d. Swapping loss functions (d², √d) is the natural next extension but is deferred. The `ScoringModel.starLoss` function is there in the interface ready for it.
