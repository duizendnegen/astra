## Context

The retrieval pipeline (`lambda/src/retrieval.ts`) uses a layered approach: L1 (embedding match), L3 (LLM concept mapping), L4 (LLM SVG generation). L1 is fast; L3 and L4 are slow LLM calls that currently run sequentially. A miss path for a word like "banana" takes ~335s — L3 alone took 123s and returned empty candidates, then L4 took 209s.

The `vectors` table is already a `vec0` virtual table (created with `USING vec0(...)` in `build-index.ts`) but the search query uses `vec_distance_cosine()` in a full scan rather than the ANN `MATCH` operator.

## Goals / Non-Goals

**Goals:**
- Reduce miss-path latency from ~335s to ~3–7s
- L3 and L4 race; whichever yields a usable skeleton first wins
- L3 gets a fair 5s window; after that, L4's result takes priority
- L1 index search uses ANN (sub-10ms instead of ~1940ms)
- Simpler, unambiguous prompts for L3 and L4

**Non-Goals:**
- Caching L4-generated SVGs to disk (a future improvement)
- Changing L5 (SVG → skeleton conversion) — same pipeline for all layers
- Modifying the matcher or constellation selection

## Decisions

### D1: Parallel race with dual-flag cancellation

**Decision**: Run L3 and L4 with `Promise.race`-style concurrency. L3 is cancelled when both `timerFired` (5s elapsed) AND `l4Done` are true — whichever sets the second flag aborts L3. L4 is cancelled only if L3 completes with a non-empty, valid result.

**Rationale**: This gives L3 a fair 5s window to win (it's cheaper and produces index-backed results). After 5s, L4's result is accepted immediately. Importantly, L4 is never cancelled by the timer alone — it always runs to completion unless L3 genuinely beats it.

**Alternative considered**: Simple `Promise.race` (first result wins). Rejected because a fast but incomplete L3 response (empty candidates, failed parse) would not beat L4, and a slow-but-valid L3 response might arrive after L4 has already done the work. The dual-flag approach correctly handles all cases.

```
On L4 complete:  set l4Done;     if timerFired  → abort L3 controller
On timer fires:  set timerFired; if l4Done      → abort L3 controller
On L3 complete with valid result: abort L4 controller; return L3 result
```

The two branches (`l4Done` and `timerFired`) are set atomically within the JS event loop (single-threaded), so there is no race condition between them.

### D2: AbortSignal threads through the L3 fetch only

**Decision**: Pass the `AbortSignal` into the initial `fetch()` call in `l3Candidates`. The subsequent `embedBatch` + `searchIndex` calls (~500ms total) are fast enough that aborting mid-embed is not worth the complexity.

**Rationale**: The 123s hang in L3 was entirely in the LLM call. Fetch abort is sufficient to eliminate the pathological case.

### D3: L4 model via `L4_MODEL` env var, default `google/gemini-2.5-flash`

**Decision**: Introduce `L4_MODEL` env var. Default to `google/gemini-2.5-flash` (fast, available via OpenRouter). Keep `SKELETON_MODEL` for L3 (existing env var, already used for L3).

**Rationale**: L4 is SVG generation — a structured output task where Gemini Flash's speed advantage is significant. L3 is a simpler text task; the existing model env var is fine. Separating the two env vars allows tuning each independently.

### D4: L1 ANN query — post-filter by source in JS

**Decision**: Use `WHERE v.embedding MATCH ? ORDER BY v.distance LIMIT 20`, then filter `source === 'phosphor'` in JS after the join. No schema change.

**Rationale**: The `vec0` `MATCH` operator triggers the ANN index. Adding a `WHERE e.source = 'phosphor'` JOIN condition inside the KNN scan may prevent the optimizer from using the ANN index. Fetching top-20 and post-filtering is safe — the Phosphor corpus is ~1512 entries, so top-20 from the full index will nearly always include the best Phosphor match.

### D5: Drop `response_format: json_object` from L3

**Decision**: Remove the `response_format` constraint. Parse the JSON array directly from the response text (the existing fallback extraction code handles this).

**Rationale**: `json_object` forces a JSON object wrapper, but the prompt asks for a bare array. This mismatch causes models to either wrap in `{"words": [...]}` or fail silently. The existing regex/`Object.values` fallback parsing already handles the array case correctly without the format constraint.

## Risks / Trade-offs

- **L3 result after L4 wins**: If L3 returns a valid result milliseconds after L4 wins (i.e., after timerFired + l4Done), it is discarded. This is a very small window and the result would be unused anyway since the response is already being sent.
- **L4 fast but L3 better quality**: Gemini Flash may generate a weaker SVG than a longer L3 search. Acceptable — the existing matcher handles imperfect shapes well (82.2% on "banana" was accepted).
- **`LIMIT 20` in ANN misses the best Phosphor match**: Extremely unlikely given 1512 Phosphor entries and a top-20 ANN result. Could be raised to 50 if empirically needed.
- **OpenRouter model availability**: `google/gemini-2.5-flash` must remain available on OpenRouter. The `L4_MODEL` env var allows a quick override if it changes.

## Migration Plan

1. Deploy updated `lambda/src/retrieval.ts`
2. Set `L4_MODEL=google/gemini-2.5-flash` in environment (or accept default)
3. No schema migration needed — `vec0` table already exists
4. Restart Docker Compose (`docker compose restart api`)
5. Rollback: revert `retrieval.ts` and restart

## Open Questions

- Should `LIMIT 20` in the ANN query be configurable via env var? (Low priority — 20 is conservative enough)
- Should L4-generated SVGs be cached to disk for warm restarts? (Out of scope for this change)
