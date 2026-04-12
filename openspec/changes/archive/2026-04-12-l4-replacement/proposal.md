## Why

L4 (LLM SVG generation) produces low-quality skeletons because generating recognisable geometry as SVG text is a hard problem for language models. Image generation is well-understood; this change replaces L4 with an image-gen + trace pipeline (Gemini image generation → Potrace → SVG → skeleton) and introduces a `custom-live` SQLite source as a graduation queue for L4-generated results, enabling human review and promotion to the vetted `custom` index.

## What Changes

- **L4 replaced**: `l4GenerateSvg` (LLM text prompt → SVG) replaced with `l4GenerateFromImage` (Gemini image gen → PNG → Potrace → SVG)
- **`custom-live` source added** to `icon-index.sqlite`: stores L4-generated SVGs for human vetting; not vector-searched at L1
- **Async promotion**: after L4 produces a valid result, the SVG is written to `custom-live` asynchronously (does not block the response)
- **DynamoDB cache unchanged**: existing exact-match cache in `skeleton.ts` continues to handle repeated lookups
- **Spec updates**: `retrieval-pipeline` and `retrieval-parallel-l3-l4` specs updated to reflect new L4 mechanism and `custom-live` source

## Capabilities

### New Capabilities

- `l4-image-traced`: L4 fallback using Gemini image generation and Potrace tracing instead of LLM SVG text generation.
- `custom-live-source`: A `custom-live` source in `icon-index.sqlite` that acts as a graduation queue for L4-generated SVGs awaiting human vetting.

### Modified Capabilities

- `retrieval-pipeline`: L4 mechanism changes from LLM SVG generation to image-gen + trace; `custom-live` source introduced.
- `retrieval-parallel-l3-l4`: L4 model changes from a text model to an image generation model; timing characteristics change (L4 is slower, ~5-9s vs ~1-3s).

## Impact

- `lambda/src/retrieval.ts` — `l4GenerateSvg` replaced; async promotion logic added; `L4_MODEL` env var updated to image model
- `lambda/src/skeleton.ts` — no changes (DynamoDB cache unchanged)
- `data/icon-index.sqlite` — new `custom-live` entries written by async promotion
- New npm dependency in `lambda/`: `potrace` (pending evaluation outcome — see `potrace-evaluation` change)
- `openspec/specs/retrieval-pipeline/` and `openspec/specs/retrieval-parallel-l3-l4/` — spec delta files
