## Why

The matcher normalises the skeleton and star patch against their own bounding boxes independently, which means every tunable constant (DISTANCE_THRESHOLD, VERTEX_SIGMA, BRIGHTNESS_WEIGHT) has a different physical meaning for each word and each patch size. This makes the algorithm hard to reason about and nearly impossible to tune deliberately — changing a constant to fix one word silently breaks others.

## What Changes

- Replace the two independent `normalise()` calls in `scoreAndMatch` with a single shared physical frame: stars projected relative to the seed centre and scaled to `PATCH_RADIUS_DEG`; skeleton scaled to a fixed fraction of the patch diameter via a new `SKELETON_FILL_RATIO` constant
- Constants `DISTANCE_THRESHOLD` and `VERTEX_SIGMA` are re-expressed in units of "fraction of patch radius" (e.g. 0.10 = 1° at the default 10° patch) and documented with their angular equivalents
- The composite score in constellation star selection (`d_eff + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)`) becomes meaningful because `d_eff` is now in a stable physical frame rather than a density-dependent one
- The `normalise()` utility function is retained (still used in existing unit tests) but removed from the `scoreAndMatch` hot path

## Capabilities

### New Capabilities

### Modified Capabilities

- `edge-based-matching`: distance computation changes from "in independently-normalised space" to "in shared physical frame scaled to patch radius" — the threshold constant now has a fixed angular meaning
- `constellation-star-selection`: the composite score `d_eff + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)` now operates in a stable coordinate frame, making BRIGHTNESS_WEIGHT a meaningful and tunable balance between geometry and brightness

## Impact

- `frontend/src/matcher.ts` — `scoreAndMatch` function and top-of-file constants
- No changes to the public `match()` API signature or `MatchResult` type
- Existing unit tests for `normalise()`, `rotate()`, `effectiveDist()`, `selectConstellationStars()` remain valid; constants in integration-style tests may need updating
- Should be implemented after `constellation-test-harness` is complete so the test suite can validate constant re-tuning across all 40 words
