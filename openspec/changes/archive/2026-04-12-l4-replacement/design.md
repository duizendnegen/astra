## Context

The current L4 fallback prompts an LLM to write SVG text for a word. SVG geometry is hard for language models: paths are often malformed, proportions wrong, or the shape unrecognisable. Image generation models produce much better results for "simple line drawing of X". The custom-skeleton-pipeline already proves this: Gemini image gen + vtracer produces acceptable skeletons for a curated word list.

This change wires the same image-gen + trace approach into the live retrieval pipeline as the new L4, and introduces a `custom-live` source in SQLite as a queue of L4-generated SVGs for future human vetting and promotion to the vetted `custom` source.

The `potrace-evaluation` change must complete first to confirm Potrace quality. If Potrace is acceptable, it is used (pure Node, no binary). If not, the fallback is vtracer in a Docker Lambda — that decision is deferred.

## Goals / Non-Goals

**Goals:**
- Replace `l4GenerateSvg` with `l4GenerateFromImage`: Gemini image gen → Potrace → SVG
- Write L4 results to `custom-live` in SQLite asynchronously (non-blocking)
- Keep DynamoDB cache, L1–L3 logic, and the L3+L4 race structure unchanged
- Update affected specs

**Non-Goals:**
- Graduation workflow (vetting `custom-live` → `custom`): separate change
- Production database swap (SQLite → scalable vector DB): future work
- Changing L1 to vector-search `custom-live` entries

## Decisions

### D1 — Image generation model and API

Use `google/gemini-2.5-flash-image` via OpenRouter, same model and API shape as the custom pipeline's `01-generate-pngs.ts`. The image is returned in `message.images[0].image_url.url` as a base64 data URI. A new `L4_IMAGE_MODEL` env var replaces `L4_MODEL`.

### D2 — Potrace as the tracer

`potrace` npm package (pure Node, no binary). Takes a PNG buffer, returns SVG string via callback (promisified). No exec, no binary bundling. Contingent on `potrace-evaluation` outcome.

### D3 — PNG handled in memory

The generated PNG (base64 → Buffer) is passed directly to Potrace. No file written to disk. This keeps L4 stateless with respect to the filesystem.

### D4 — Async promotion to `custom-live`

After L4 produces a result, the response is returned to the caller immediately. A background promise (unwaited) writes the SVG to `custom-live` in SQLite. No embedding is stored at this point — embedding is deferred to graduation time.

The `custom-live` table schema:
```sql
CREATE TABLE IF NOT EXISTS custom_live (
  word      TEXT PRIMARY KEY,
  svg       TEXT NOT NULL,         -- full SVG string (not a file path)
  created_at INTEGER NOT NULL      -- unix timestamp ms
);
```

SVG stored inline (not as a file path) since there is no persistent filesystem in Lambda.

### D5 — Race logic unchanged

The existing L3+L4 race uses a 5s timer to protect L3 from premature cancellation. With image gen taking ~5-9s (vs ~1-3s for text gen), the timer fires before L4 completes in most cases — L3 is not aborted, and L4 is used only if L3 truly misses. No timer adjustment needed; the existing logic handles this correctly.

### D6 — `source` field on L4 match result

Change from `'llm'` to `'generated'` to accurately reflect the new mechanism. The `MatchProvenance` union type gains `'generated'` and drops `'llm'`.

### D7 — `custom-live` not in L1_SOURCES

`custom-live` is a graduation queue, not a vector-searchable source. It is never queried at L1. The `L1_SOURCES` env var and L1 search logic are unchanged.

## Risks / Trade-offs

- **Potrace dependency**: if `potrace-evaluation` shows poor quality, this change needs to pivot to Docker Lambda + vtracer. The L4 function is self-contained so the swap is localised.
- **Image gen latency**: ~5-9s vs ~1-3s. L4 is last resort; this is acceptable. L3 wins more often.
- **SQLite write from Lambda**: async write to `custom-live` requires the Lambda to have write access to `icon-index.sqlite`. Works locally; production database strategy TBD.
- **`custom-live` grows unbounded**: no eviction mechanism in this change. Bounded in practice by L4 miss rate and DynamoDB cache absorbing repeats.
- **GPL-2.0 (`potrace`)**: acceptable for server-side use; not distributed to end users.

## Open Questions

- If Potrace evaluation fails: Docker Lambda + vtracer, or a different pure-Node tracer?
