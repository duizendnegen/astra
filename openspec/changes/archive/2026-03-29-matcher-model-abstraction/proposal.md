## Why

The matcher is a monolith with hardcoded constants and a single fixed algorithm. Tuning is blind — change a number, reload, guess. There is no way to swap algorithms or compare them against each other, which blocks deliberate quality improvement and makes the test harness unable to distinguish between algorithmic differences and constant changes.

## What Changes

- Introduce a `MatcherConfig` interface with a required `model` string (`'simple' | 'vertex' | 'spread'`) and optional per-call constant overrides for both the search strategy and scoring layers
- Define three named model implementations, each providing its own scoring logic and default constants:
  - `simple`: pure edge-distance scoring, no vertex bonus, no spread
  - `vertex`: Gaussian vertex bonus (endpoint vs joint), no spread — reconstructs current algorithm exactly
  - `spread`: adds an edge-coverage spread score on top of `vertex`, rewarding constellations where matched stars are distributed across skeleton edges rather than clustered
- The `match()` function gains an optional fourth parameter `config?: MatcherConfig`; omitting it defaults to `{ model: 'vertex' }`, preserving current behaviour exactly
- Internal functions `scoreAndMatch` and `effectiveDist` are refactored to accept a `ResolvedConfig` (model defaults merged with call overrides) instead of reading module-level globals
- The test harness `run.ts` gains a `--model` flag so the full word suite can be run under any model for comparison

## Capabilities

### New Capabilities

- `matcher-model-interface`: the `MatcherConfig` type, `ScoringModel` interface, model registry, and config resolution logic

### Modified Capabilities

- `edge-based-matching`: scoring computation dispatches through the model interface; constants come from `ResolvedConfig` rather than module globals
- `constellation-star-selection`: vertex selection constants (`brightnessWeight`, `maxConstellationStars`) come from `ResolvedConfig`
- `star-matching`: `match()` accepts an optional `MatcherConfig` parameter; default behaviour is unchanged

## Impact

- `frontend/src/matcher.ts` — primary change; module-level constant block replaced by model definition objects; internal function signatures updated
- `frontend/src/types.ts` — `MatcherConfig` and `ScoringModel` types added (or co-located in matcher.ts)
- `test-harness/run.ts` — `--model` flag added, passed through to `match()`
- Should be implemented after `fix-normalization` so model constants are expressed in the stable physical frame
- No changes to `MatchResult`, the public API shape, or any caller outside matcher.ts
