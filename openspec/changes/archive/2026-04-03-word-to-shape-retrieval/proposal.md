## Why

The current skeleton generation pipeline asks an LLM to produce [x,y] coordinate pairs for a word's shape. ~15 prompt variants have been tried (P1–P4, Q1–Q6, A1–A2) across multiple models; none reliably produce geometrically correct skeletons. The root cause is not prompt quality — it is that LLMs are bad at spatial coordinate generation. Two high-quality SVG databases (Phosphor Icons, Phylopic) already contain exactly the shapes we need; the right fix is to look them up, not hallucinate them.

## What Changes

- **New**: Index build script — downloads Phosphor (~7k icons) and Phylopic (~15k silhouettes), embeds all labels, writes a SQLite + sqlite-vec index
- **New**: Retrieval pipeline (L0→L5) replaces `generateSkeleton` in `lambda/src/core.ts`
  - L0: local normalisation (lowercase, lemmatise via compromise.js)
  - L1: embedding match against SQLite index (OpenRouter text-embedding-3-small, per-source thresholds)
  - L3: LLM concept mapping — synonyms + visual representations + translate if needed — then re-query index
  - L4: LLM SVG generation (last resort, same as current approach but against SVG not coordinates)
  - L5: deterministic SVG → skeleton (swappable simplification algorithm, sub-steps cached)
- **Modified**: DynamoDB cache extended to store match provenance (source, id, similarity, layer, svgPath) alongside skeletons — enables L5 re-runs without full pipeline
- **Modified**: Test harness word set replaced with a categorised set (A–E) that exercises each layer explicitly
- **Deferred** (Phase 2): S3 index storage, Lambda cold-start download — implemented only after local pipeline is validated

## Capabilities

### New Capabilities

- `svg-icon-index`: Pre-built SQLite + sqlite-vec index of Phosphor and Phylopic SVG entries with embeddings; build script to download, process, and populate it
- `retrieval-pipeline`: L0→L5 word-to-skeleton pipeline using index lookup as primary strategy, LLM as fallback
- `svg-to-skeleton`: Deterministic SVG path → skeleton extractor with swappable simplification algorithms and per-step caching

### Modified Capabilities

- `skeleton-generation`: Requirements change — output is still `Skeleton[]` but the generation strategy is retrieval-first; DynamoDB cache item shape changes to include match provenance
- `test-harness-runner`: Word list replaced with categorised A–E set; harness should report which layer fired for each word

## Impact

- `lambda/src/core.ts` — `generateSkeleton` rewritten; LLM prompts for L3/L4 only
- `lambda/src/skeleton.ts` — handler updated to read/write extended cache schema
- `scripts/build-index.ts` — new script (runs locally and in CI, not in Lambda)
- `test-harness/` — word list updated; fixture categories added to results
- New dependency: `compromise` (lemmatisation), `better-sqlite3` + `sqlite-vec` (index), `openai` or OpenRouter SDK (embeddings)
- No changes to: frontend, matcher, renderer, share links, PNG export, star field
