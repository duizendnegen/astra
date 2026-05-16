## Context

The matcher pipeline filters candidates in three phases before calling `selectDiverse`:

1. **Phase 1** — up to 500 candidates by fast coverage score (hasStarNear)
2. **Phase 2** — greedy NN edge-ratio score, top `phase2Cap` (≤500) → top `HUNGARIAN_K` (20)
3. **Phase 3** — full Hungarian assignment + multi-score evaluation on those 20
4. **selectDiverse** — picks one from Phase 3 pool (score within 10%, ≥30° from top)

The problem: Phase 2 sorts by score and slices `greedyTop.slice(0, HUNGARIAN_K)`. Score correlates with star density, so all 20 Phase 3 candidates tend to cluster around the Sirius region (~RA 101°). `selectDiverse` then finds `distantCount = 0` and silently falls back to the top result.

## Goals / Non-Goals

**Goals:**
- Ensure Phase 3's 20-candidate pool contains geographically spread entries (≥30° between any two)
- Preserve Phase 3 budget (`HUNGARIAN_K = 20`) even in sparse sky regions
- Single change point in `runPhase2And3`, shared by all three generators

**Non-Goals:**
- Changing `selectDiverse` or its constants
- Adding new `MatcherConfig` fields
- Changing Phase 1 or Phase 2 scoring logic
- Guaranteeing a minimum number of diverse candidates when the Phase 2 pool itself is geographically thin

## Decisions

### D1 — Intervene at Phase 2→3 transition

Replace `const phase3Slice = greedyTop.slice(0, HUNGARIAN_K)` with a greedy spatial-spread loop:

```
phase3Slice = []
for cand in greedyTop (sorted best-first):
  patchRA/Dec = centroid of cand.physVerts
  tooClose = any already-selected cand within PHASE3_MIN_SEP_DEG
  if not tooClose: add to phase3Slice
  elif phase3Slice.length < HUNGARIAN_K and greedyTop exhausted: add anyway (fallback)
  stop when phase3Slice.length == HUNGARIAN_K
```

**Alternatives considered:**
- Phase 1→2 transition (bucket the 500 Phase 1 candidates): earlier intervention, but Phase 1 coverage scores are coarser; Phase 2 greedy score is the better quality signal for deciding which representative to keep per region.
- Parallel sub-pools (Option C): guarantees per-region coverage but multiplies Hungarian calls.

### D2 — 30° minimum separation, module-level constant

`PHASE3_MIN_SEP_DEG = 30` mirrors the existing `DIVERSITY_MIN_DEG` constant. Using the same value makes the two mechanisms coherent: a candidate that passes the Phase 3 pool filter is also a candidate `selectDiverse` would consider "distant" from the top result.

Not added to `MatcherConfig` — no use case for per-call tuning has emerged, and keeping the config surface small reduces test complexity.

### D3 — Check separation against all already-selected Phase 3 candidates

Each new candidate is checked against every already-selected entry, not just the top-1. This prevents secondary and tertiary candidates from clustering near each other (e.g. two candidates at RA=120° would both pass a "≥30° from Sirius" check but still be close to each other).

O(k²) worst case with k≤20 is negligible.

### D4 — Pure greedy fallback, no minimum diverse-slot count

The loop always adds the best candidate that doesn't violate the distance constraint. Once the Phase 2 pool is exhausted of distant candidates, remaining slots are filled by the best remaining regardless of distance. This keeps Phase 3 at its full `HUNGARIAN_K` budget and avoids a two-pass structure.

## Risks / Trade-offs

- **Thin Phase 2 pool** → If Phase 2 genuinely produces candidates from only one sky region (e.g., a very sparse star catalogue or a word whose skeleton has no good match outside one region), the fallback fills Phase 3 with close candidates anyway. Behaviour is unchanged from before — `selectDiverse` still falls back to top. This is acceptable: the change improves diversity when diversity is available, not when it isn't.

- **Centroid approximation** → `patchRA/Dec` is the mean of `physVerts`, not the true centre of mass weighted by edge lengths. Good enough for a 30° proximity filter; no need to use `distanceDeg` on the centroid itself (the centroid RA/Dec arithmetic is only valid near the equator, but the separation check only needs to be approximately right for this filter).

- **No regression risk to selectDiverse tests** → The existing test suite for `selectDiverse` is unaffected. The new behavior only changes which candidates enter Phase 3; `selectDiverse` contract is unchanged.

## Migration Plan

No migration required. The change is internal to `runPhase2And3`; no Lambda handler, API, or frontend changes. Deploy by normal Lambda update.
