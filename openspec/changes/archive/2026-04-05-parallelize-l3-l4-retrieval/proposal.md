## Why

An L1 miss triggers a fully sequential L3→L4 pipeline that takes 2–6 minutes per word (L3: ~123s, L4: ~209s for "banana"), making the miss path unusable in practice. L3 and L4 are independent operations that can race, and L4 can be dramatically accelerated by switching to a faster model with a simpler prompt.

## What Changes

- **L1 index search**: replace full-table-scan query with `vec0` KNN query — the `vectors` table is already a `vec0` virtual table; using `WHERE embedding MATCH ?` cuts search time from ~1940ms to ~10ms
- **L3 and L4 run in parallel** after an L1 miss instead of sequentially
- **L3 cancellation**: L3 is aborted when both conditions are true: (a) 5 seconds have elapsed since the race started, and (b) L4 has returned a result — whichever condition fires second triggers the cancel
- **L4 cancellation**: L4 is cancelled only when L3 completes with a non-empty valid result
- **L4 model**: switch from `anthropic/claude-haiku-4.5` to a fast Gemini model (`google/gemini-2.5-flash` default) via a new `L4_MODEL` env var
- **L3 prompt**: simplified — drop `response_format: json_object`, parse array directly from response
- **L4 prompt**: simplified — no few-shot examples, no stroke-only constraint, just shape + viewBox + "no colours" + return-SVG-only instruction

## Capabilities

### New Capabilities
- `retrieval-parallel-l3-l4`: L3 and L4 race in parallel with priority-weighted cancellation after an L1 miss

### Modified Capabilities
- `retrieval-pipeline`: L3 and L4 execution order changes from sequential to parallel; L4 model and prompts change; L1 search uses ANN instead of full scan

## Impact

- `lambda/src/retrieval.ts`: all changes are isolated to this file
- New env var `L4_MODEL` (optional, defaults to `google/gemini-2.5-flash`)
- No schema changes, no dependency changes
- Expected miss-path latency: ~3–7s (down from ~335s)
