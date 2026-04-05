## 1. L1 ANN Query

- [x] 1.1 ~~Replace the `getSearchStmt` SQL in `retrieval.ts` with a `vec0` KNN query~~ — **REVERTED**: corpus-mixing (phosphor ~1512 + phylopic ~5000 in shared index) causes top-20 KNN to be dominated by phylopic entries; best phosphor match falls outside top-20. Full-scan retained. See l1-ann-investigation.md.
- [x] 1.2 ~~Remove the `WHERE e.source = 'phosphor'` SQL filter~~ — moot (KNN reverted)
- [x] 1.3 ~~Update the `buf` parameter binding~~ — moot (KNN reverted)
- [x] 1.4 ~~Verify L1 search duration drops to sub-50ms~~ — verified NOT achievable with shared index; full-scan (~1.5–2s) is acceptable since L3/L4 now run in parallel and L1 is only on the critical path for hits

## 2. New Prompts

- [x] 2.1 Replace `L3_PROMPT` with: `List 5 single nouns that visually represent "<word>" — synonyms, categories, or iconic objects.\nReturn ONLY a JSON array of strings, e.g. ["cat","tiger","paw","whisker","feline"]. No explanation.`
- [x] 2.2 Remove `response_format: { type: 'json_object' }` from the L3 `fetch` call body
- [x] 2.3 Replace `L4_PROMPT` and `FEW_SHOT` with: `Draw a simple SVG silhouette of "<word>".\nRules: viewBox="0 0 256 256", no colours.\nReturn ONLY the complete <svg>...</svg> element. No explanation, no markdown.`
- [x] 2.4 Remove the `FEW_SHOT` constant entirely

## 3. L4 Model Config

- [x] 3.1 Add `const L4_MODEL = process.env.L4_MODEL ?? 'google/gemini-2.5-flash'` near the top of `retrieval.ts`
- [x] 3.2 Replace the hardcoded model in `l4GenerateSvg` with `L4_MODEL`

## 4. Parallel Race

- [x] 4.1 Refactor `l3Candidates` to accept an optional `AbortSignal` and pass it to the `fetch` call
- [x] 4.2 Implement the dual-flag cancellation logic in `retrieveSkeleton`: `l4Done` + `timerFired` flags; each setter checks if the other flag is set and aborts the L3 `AbortController` if so
- [x] 4.3 Start L3 and L4 concurrently using `Promise` (not `Promise.race` — the cancellation logic is custom); wire up the L3 `AbortController` signal
- [x] 4.4 On L3 completing with a non-empty valid result: abort the L4 controller (pass it into the L4 call or cancel via a shared flag) and return the L3 result
- [x] 4.5 On L4 completing: set `l4Done`; if `timerFired` is already set, abort L3 and use the L4 result
- [x] 4.6 Start the 5s timer: `setTimeout(() => { timerFired = true; if (l4Done) abortL3(); }, 5000)`; clear it when either layer wins
- [x] 4.7 Ensure the best-cosine fallback and TRIANGLE_FALLBACK paths still work when both L3 and L4 produce no result

## 5. Restart & Smoke Test

- [x] 5.1 Restart Docker Compose: `docker compose restart api`
- [x] 5.2 Send a request for "banana" and verify the response arrives in under 10s; confirm logs show `layer: 4` or `layer: 3` with parallel start
- [x] 5.3 Send a request for a word with a strong L1 hit (e.g. "heart") and verify L3/L4 are not started

## 6. Test Harness

- [x] 6.1 Run the test harness against the updated pipeline and review results — 16/18 tests pass; 2 failures in core.test.ts (`isValidSkeleton`) are pre-existing, unrelated to this change
- [x] 6.2 Check that L3 and L4 miss-path words (e.g. "banana", "eternity") resolve correctly and within acceptable time — banana: layer 4, 7.6s (was ~335s); eternity: layer 1 hit, 2.6s

