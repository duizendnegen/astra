## Context

`match()` in `lambda/src/matcher.ts` returns the single highest-scoring placement found by `pairwiseAnchorSearch`. The three-phase pipeline already evaluates up to 20 candidates in Phase 3 (fully scored via Hungarian assignment), but discards everything except the top result. Because star density peaks near Sirius/Orion, the best-scoring candidate is almost always in that region, regardless of the target shape.

The diversity we want is already present in the Phase 3 candidate pool — we just throw it away.

## Goals / Non-Goals

**Goals:**
- Surface the full Phase 3 candidate list from `runPhase2And3` instead of a single result.
- Apply a post-selection step in `match()` that prefers a sky-diverse candidate when one exists within an acceptable score range.
- Keep the `MatchResult` return type and all callers unchanged.

**Non-Goals:**
- Changing Phase 1 or Phase 2 to actively seek geographic diversity (the Phase 3 pool is sufficient for now).
- Guaranteeing that a distant candidate always exists (fallback to top is always available).
- Determinism — random selection among acceptable distant candidates is intentional.

## Decisions

### 1. `runPhase2And3` returns `[]` instead of a single result

**Decision**: Change the return type from `(ScoreResult & { seed: Star }) | null` to `(ScoreResult & { seed: Star })[]`, returning all Phase 3 candidates in descending score order.

**Why**: The 20 Phase 3 candidates are already fully scored. Returning them costs nothing extra and exposes the geographic spread that already exists. Returning an empty array replaces the `null` case.

**Alternative considered**: Add a secondary search pass over a filtered catalogue (excluding the Sirius-dense zone). Rejected — two full search passes doubles latency.

### 2. 10% score tolerance

**Decision**: A candidate is "acceptable" if `score >= topScore * 0.90`.

**Why**: A relative tolerance is robust across different shape types and catalogue densities. 10% feels like enough headroom to find a distant candidate without accepting clearly worse matches. This is a tunable constant (`DIVERSITY_TOLERANCE = 0.10`).

**Alternative considered**: Absolute score delta (e.g. `score >= topScore - 0.05`). Rejected — absolute deltas behave unpredictably across scorer types (edge-ratio vs vertex-fit operate on different scales).

### 3. 30° angular distance threshold

**Decision**: A candidate is "distant" if `distanceDeg(candidate.patchRA, candidate.patchDec, top.patchRA, top.patchDec) >= 30`.

**Why**: 30° is roughly the radius of the dense Orion/Sirius/Gemini cluster. Using the top match's position as the reference (rather than a hardcoded Sirius coordinate) makes this generalise to any dense zone and avoids hardcoding celestial coordinates. Constant: `DIVERSITY_MIN_DEG = 30`.

**Alternative considered**: Hardcode an exclusion zone around Sirius (RA ~101°, Dec ~-17°). Rejected — fragile, doesn't generalise.

### 4. Random pick from distant acceptable candidates

**Decision**: `Math.random()` pick among `distant` candidates.

**Why**: Spreads results across the sky over repeated requests for the same word. The non-determinism is acceptable because sharing serialises the final result, not the input word.

**Alternative considered**: Always pick the highest-scoring distant candidate (deterministic). Rejected — always returning the second-best in a fixed distant region would just replace one biased cluster with another.

### 5. `match()` aggregates across skeleton variants

**Decision**: `match()` collects all candidate arrays from each skeleton variant, merges them, and applies diversity selection to the combined pool.

**Why**: When multiple skeletons are evaluated (the pipeline currently passes 1, but the interface accepts `Skeleton[]`), candidates from different variants should compete on equal footing including diversity preference.

## Risks / Trade-offs

- **Thin distant pool**: If the Phase 3 top-20 candidates happen to all cluster in one region (plausible for shapes that only fit well in dense areas), `distant` will be empty and we fall back to the top result. This is intentional and expected for some shapes.
- **Score tolerance sensitivity**: 10% may occasionally accept a visually poor distant match. If this becomes observable, tighten `DIVERSITY_TOLERANCE` or add a hard minimum score floor.
- **Phase 3 cap is 20**: The pool size is bounded by `cfg.phase3Cap ?? 20`. Increasing this cap trades latency for a richer diversity pool — a knob to turn later if needed.
