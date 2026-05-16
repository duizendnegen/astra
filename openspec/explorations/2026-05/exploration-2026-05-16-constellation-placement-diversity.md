# Exploration: constellation-placement-diversity

**Date:** 2026-05-16
**Linked change:** none

## Context

The constellation matcher repeatedly lands placements in the dense Sirius region (RA≈101°, Dec≈−17°) because Phase 1 → Phase 2 → Phase 3 funnelling is driven purely by score, and score correlates strongly with star density. By the time Phase 3's 20 candidates are ready for `selectDiverse`, all 20 may already be from the same sky region, giving diversity selection nothing to work with. We want to understand *where* in the pipeline diversity should be introduced and *how*, with minimal cost to match quality.

## Observations

### Pipeline anatomy

```
Phase 1 (prescreen)          Phase 2 (greedy NN)              Phase 3 (Hungarian)    selectDiverse
────────────────────          ─────────────────────            ───────────────────    ─────────────
All (anchor, neighbor)  →    top phase2Cap (≤500)   →         top 20 candidates  →   pick 1
pairs → coverage score        greedy edge-ratio score          full scoring            (score ±10%,
sorted, keep top 500                                            sorted by scorer        ≥30° away)
PRESCREEN_K = 500                                              HUNGARIAN_K = 20
```

**Key constants** (matcher.ts):
- `PRESCREEN_K = 500` — Phase 1 output cap
- `GREEDY_K = 50`, `phase2Cap ?? 500` — Phase 2 input slice
- `HUNGARIAN_K = phase3Cap ?? 20` — Phase 3 input slice
- `DIVERSITY_TOLERANCE = 0.10` — acceptable score band (10%)
- `DIVERSITY_MIN_DEG = 30` — minimum separation for "distant" candidate

### Why Sirius floods the pipeline

Sirius (mag −1.46) is always an anchor. The Orion–CMa–CMi region (~RA 80–110°, Dec −30–+10°) has the highest density of bright stars anywhere on the sky. This means:

1. **Phase 1**: (Sirius, neighbour) pairs score high on the coverage check — every vertex lands near a star. They dominate the top-500.
2. **Phase 2**: The greedy edge-ratio pass doesn't penalise geographic concentration; Sirius-region candidates already score well, so the top-20 cutoff keeps them.
3. **Phase 3**: All 20 Phase-3 entries have `patchRA ≈ 101°`. `selectDiverse` finds `distantCount = 0` and falls back to the top result.

### Current diversity mechanism (selectDiverse)

```typescript
// matcher.ts:1180
export function selectDiverse(pool) {
  const top = pool.reduce((best, c) => c.score > best.score ? c : best, pool[0]);
  const acceptable = pool.filter(c => c.score >= top.score * (1 - DIVERSITY_TOLERANCE)); // ±10%
  const distant     = acceptable.filter(c =>
    distanceDeg(c.patchRA, c.patchDec, top.patchRA, top.patchDec) >= DIVERSITY_MIN_DEG); // ≥30°
  return distant.length > 0 ? distant[random * distant.length] : top;
}
```

This is sound logic — but only works if Phase 3's pool *already contains* candidates from different regions. If all 20 are clustered, `distant` is empty and `selectDiverse` is a no-op.

### Where patchRA/Dec is available

Phase 1 `physVerts` gives sky position for every candidate. The centroid (`patchRA`, `patchDec`) can be computed cheaply from `physVerts` at Phase 1, before Phase 2. This is what `match()` already does at line 1217 after the search.

### Cost considerations

- **Phase 1** (hasStarNear, no allocation): essentially free — `PRESCREEN_K*2 = 1000` candidates kept, then sorted and trimmed to 500.
- **Phase 2** (greedy NN): linear scan per vertex, O(nVtx × nearbyStars). Expensive enough that we want to cap inputs.
- **Phase 3** (Hungarian O(n³)): the most expensive step. Budget is exactly `HUNGARIAN_K = 20` calls.

Diversity must be introduced *before* Phase 3 eats its cap of 20. The cheapest intervention point is at the Phase 1→2 or Phase 2→3 transition.

### Option space

```
Option A — Spatial buckets at Phase 1 output
  Sky divided into ~16 buckets (4 RA × 4 Dec). Keep top-K per bucket before
  passing to Phase 2. Phase 2 then processes a geographically spread input.
  Cost: one pass over 500 candidates to compute centroids and bucket them.

Option B — Diverse-K sample at Phase 2→3 transition
  After Phase 2 ranks all candidates by greedy score, instead of taking
  top-20 by score, run a greedy spatial-spread selection: add next
  candidate that is ≥D° from all already-selected candidates.
  Cost: one pass over ~500 Phase 2 outputs to compute distances.

Option C — Parallel independent sub-pools (N sky regions × M Hungarian runs)
  Partition the Phase 1 output by sky region. Run Phase 2+3 independently
  per region. Combine final results and apply selectDiverse across regions.
  Cost: up to N×20 Hungarian calls. Slower but guarantees per-region coverage.

Option D — Widen selectDiverse tolerance / lower distance threshold
  Change DIVERSITY_TOLERANCE from 0.10 → 0.20, DIVERSITY_MIN_DEG from 30 → 15.
  Cost: zero. But does nothing if Phase 3 pool is geographically homogeneous.

Option E — Candidate deduplication by centroid grid at Phase 1→2 transition
  Assign each Phase 1 candidate to a grid cell. Keep only the best-scoring
  candidate per cell. Effectively the same as Option A but grid-based.
  Cost: same as Option A.
```

### Concrete implementation sketch for Option B

```
// In runPhase2And3, replace:
const phase3Slice = greedyTop.slice(0, HUNGARIAN_K);

// With: greedy spatial-spread selection
const phase3Slice: PhaseCandidate[] = [];
for (const cand of greedyTop) {   // already sorted best-first
  const pRA  = cand.physVerts.reduce((s, v) => s + v[0], 0) / cand.physVerts.length;
  const pDec = cand.physVerts.reduce((s, v) => s + v[1], 0) / cand.physVerts.length;
  const tooClose = phase3Slice.some(sel => {
    const sRA  = sel.physVerts.reduce((s, v) => s + v[0], 0) / sel.physVerts.length;
    const sDec = sel.physVerts.reduce((s, v) => s + v[1], 0) / sel.physVerts.length;
    return distanceDeg(pRA, pDec, sRA, sDec) < PHASE3_MIN_SEP_DEG;
  });
  if (!tooClose || phase3Slice.length < HUNGARIAN_K_MIN) phase3Slice.push(cand);
  if (phase3Slice.length >= HUNGARIAN_K) break;
}
```

This keeps at most `HUNGARIAN_K` candidates but enforces a minimum angular separation between them. The top-scoring candidate is always included. The parameter `PHASE3_MIN_SEP_DEG` (e.g. 20°) controls spread.

### Interaction with existing selectDiverse

If Option B is implemented, `selectDiverse` still runs on Phase 3 output and can pick the best among several geographically spread, high-quality candidates. The two mechanisms are complementary: Option B ensures the pool is diverse, selectDiverse picks the final one with appropriate quality weighting.

## Rounds

## Round 1 — Where to intervene

### Q1.1 — Primary intervention point

Phase 1→2 (Option A/E) or Phase 2→3 (Option B) — where should diversity be enforced?

- [x] Phase 2→3 transition (Option B) ← recommended: Phase 2 greedy scores give a richer signal than raw Phase 1 coverage; spreading *after* Phase 2 discards worse candidates and keeps only quality+diverse ones. Cheaper than Option C.
- [ ] Phase 1→2 transition (Option A/E) — earlier is simpler; centroid computation at Phase 1 is trivial; avoids running Phase 2 on many Sirius candidates at all.
- [ ] Parallel sub-pools (Option C) — most thorough, most expensive.

> **Your answer / freetext:**
>

### Q1.2 — Minimum separation for Phase 3 pool

What angular separation between Phase 3 candidates is appropriate?

- [ ] 20° ← recommended: large enough to guarantee regional spread across the sky without being so aggressive that sparse regions can't fill the cap.
- [x] 30° — matches the existing `selectDiverse` threshold; consistent but may over-constrain the pool in dense runs.
- [ ] 10° — gentler; good for finding local variants but doesn't break the Sirius cluster.

> **Your answer / freetext:**
>

### Q1.3 — Fallback when few diverse candidates exist

If fewer than HUNGARIAN_K candidates survive the diversity filter (sparse sky), how should the remainder be filled?

- [x] Fill remaining slots from best-scoring remaining candidates regardless of distance ← recommended: keeps Phase 3 at full budget even in sparse areas; quality suffers at most for the tail.
- [ ] Let Phase 3 run with fewer candidates — cleaner contract, avoids polluting with close duplicates.
- [ ] Raise HUNGARIAN_K dynamically to compensate — adds complexity for marginal gain.

> **Your answer / freetext:**
>

### Q1.4 — Should selectDiverse also be adjusted?

Given the intervention above, should `DIVERSITY_TOLERANCE` or `DIVERSITY_MIN_DEG` change?

- [x] No change — selectDiverse is sound as-is; fixing the pool diversity is sufficient ← recommended: avoids double-tuning and keeps existing test coverage valid.
- [ ] Widen tolerance to 15% — more willing to take a distant candidate that scores slightly worse.
- [ ] Reduce DIVERSITY_MIN_DEG to 15° — finer-grained within-region diversity.

> **Your answer / freetext:**
>

## Round 2 — Implementation contract

### Q2.1 — Should PHASE3_MIN_SEP_DEG be configurable?

The 30° constant mirrors `DIVERSITY_MIN_DEG` and could either be a module-level constant or a `MatcherConfig` field.

- [x] Module-level constant (hardcoded 30°) ← recommended: keeps MatcherConfig surface small; 30° is already validated by the selectDiverse design; no caller has needed to tune it yet.
- [ ] Add `phase3MinSepDeg` to MatcherConfig — allows per-word or per-test overrides; useful if we ever want tighter clustering for certain shapes.

> **Your answer / freetext:**
>

### Q2.2 — Distance check: against all selected, or only against top?

The greedy-spread loop can check separation against **every already-selected candidate** (full pairwise) or only against **the first/highest-scoring one**.

- [x] Against all already-selected ← recommended: prevents multiple candidates clustering near each other even if each is far from the global top; O(k²) worst case but k≤20 so negligible.
- [ ] Against top-1 only — simpler; fast; but allows second and third candidate to cluster together.

> **Your answer / freetext:**
>

### Q2.3 — Minimum number of "diverse" slots before filling

Before we fall back to filling remaining Phase 3 slots without distance constraints, should we enforce a minimum number of geographically spread candidates?

- [x] No minimum — pure greedy: always add the best-available candidate, distant preferred ← recommended: simple contract; the top candidate is always in, and each subsequent one is placed as far as the pool allows.
- [ ] At least ceil(HUNGARIAN_K / 2) diverse slots before any fill — guarantees ≥50% of Phase 3 is spread; adds a two-pass structure.

> **Your answer / freetext:**
>

### Q2.4 — Where to put the new logic

Option B requires centroid computation per candidate. Should it live inside `runPhase2And3` (touching the shared helper) or in each generator (pairwiseAnchorSearch / singleSweepSearch / anyVertexSearch)?

- [x] Inside `runPhase2And3` ← recommended: single change point; all three generators share this path; centroid is cheap (O(nVtx) per candidate, done once over ≤500 candidates).
- [ ] In each generator separately — lets generators cache centroid alongside physVerts; more structural churn for no gain at this scale.

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Intervene at the Phase 2→3 transition (Option B) — replace `greedyTop.slice(0, HUNGARIAN_K)` with a greedy spatial-spread loop over the Phase 2 output. — _Reason:_ Phase 2 greedy scores provide a richer quality signal than raw Phase 1 coverage; spreading after Phase 2 keeps quality+diverse candidates and discards worse ones; single change point in `runPhase2And3` covers all three generators.

_Decision:_ Use 30° as the minimum angular separation between Phase 3 candidates (`PHASE3_MIN_SEP_DEG = 30`). — _Reason:_ Matches the existing `DIVERSITY_MIN_DEG` constant used by `selectDiverse`; consistent mental model throughout the pipeline; avoids introducing a second, different threshold.

_Decision:_ Check separation against all already-selected Phase 3 candidates (full pairwise check). — _Reason:_ Prevents second and third candidates from clustering near each other even if each is individually far from the top-1; O(k²) cost is negligible at k≤20.

_Decision:_ Pure greedy fallback — no minimum diverse-slot count enforced. — _Reason:_ Simple contract: top-scoring candidate is always included first; each subsequent slot takes the farthest available candidate, falling through to closest if no distant ones remain. Keeps Phase 3 at full budget (`HUNGARIAN_K = 20`) even in sparse sky regions.

_Decision:_ `PHASE3_MIN_SEP_DEG` is a module-level constant, not added to `MatcherConfig`. — _Reason:_ Keeps the config surface small; 30° is already validated by the selectDiverse design; no use case for per-call tuning has emerged.

_Decision:_ `selectDiverse` (tolerance=10%, min-dist=30°) is unchanged. — _Reason:_ The mechanism is sound; the bug is that its pool was homogeneous; fixing the pool upstream is sufficient and avoids double-tuning.
