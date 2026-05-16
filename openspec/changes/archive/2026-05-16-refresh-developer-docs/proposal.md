## Why

`README.md`, `DEPLOYMENT.md`, and `project-plan.md` were written during Iteration 1 and now describe an obsolete architecture: the old `/api/skeleton` endpoint, client-side matching, URL-param feature flags, and a pre-Pinecone shape pipeline. Any developer reading them today will be misled about how Astra actually works.

## What Changes

- **Rewrite `README.md`** — new evocative intro paragraph, corrected "How it works" (6-step, covering the retrieval pipeline accurately: ~1,500 Phosphor icons in Pinecone, L3 LLM concept mapping, L4 Gemini image generation running in parallel, three-phase matcher); tests section expanded to integrate test harness docs; feature flags / settings panel section removed; deployment section inlined as a brief first-time-setup checklist
- **Delete `DEPLOYMENT.md`** — content folded into the inline deployment section of README; eliminates the two-source drift problem
- **Delete `project-plan.md`** — describes a pre-Pinecone architecture that no longer exists; the spec archive is the authoritative design record

## Capabilities

### New Capabilities

_None — this is a documentation-only change. No new code capabilities are introduced._

### Modified Capabilities

_None — no spec-level behavior changes. All modified files are documentation._

## Impact

- `README.md` — full rewrite
- `DEPLOYMENT.md` — deleted
- `project-plan.md` — deleted
- No code changes; no API changes; no test changes
