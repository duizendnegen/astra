## Why

The constellation matcher repeatedly places results in the Sirius/Orion region because Phase 1 → Phase 2 → Phase 3 funnelling is score-only, and score correlates with star density. By the time `selectDiverse` runs on the Phase 3 pool of 20 candidates, all 20 may share the same sky region, leaving diversity selection with nothing to work with.

## What Changes

- Replace the `greedyTop.slice(0, HUNGARIAN_K)` cut in `runPhase2And3` with a greedy spatial-spread selection that enforces a minimum angular separation between Phase 3 candidates.
- Add module-level constant `PHASE3_MIN_SEP_DEG = 30` (mirrors `DIVERSITY_MIN_DEG`).
- Fallback: if the diversity filter exhausts the sorted Phase 2 output before filling all `HUNGARIAN_K` slots, fill remaining slots from the best-scoring remaining candidates regardless of distance.
- `selectDiverse` and all its constants (`DIVERSITY_TOLERANCE`, `DIVERSITY_MIN_DEG`) are unchanged.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `constellation-placement-diversity`: Extends the existing diversity requirement to cover the Phase 3 candidate pool itself — the pool SHALL be constructed with geographic spread (≥30° separation between entries) before `selectDiverse` is applied.

## Impact

- `lambda/src/matcher.ts` — `runPhase2And3` function only; no public API changes.
- `lambda/src/__tests__/matcher-pipeline.test.ts` — new test for Phase 3 pool diversity.
- No config changes, no Lambda handler changes, no frontend changes.
