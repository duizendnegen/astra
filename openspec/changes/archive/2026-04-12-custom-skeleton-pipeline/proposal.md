## Why

L4 (LLM SVG generation) produces low-quality skeletons because generating recognisable geometry as SVG text is a hard problem for language models. Image generation is a well-understood problem; this change introduces a pre-processing pipeline that feeds a curated `custom` SVG source into L1 retrieval, dramatically raising hit rates for common nouns and eliminating reliance on L4 for covered words.

## What Changes

- New offline pipeline (`scripts/custom-pipeline/`) that takes a word list from CSV, generates PNGs via Gemini image generation (OpenRouter), traces them to SVG via vtracer, and offers a local vetting UI before ingesting approved SVGs into `icon-index.sqlite`.
- New `custom` source in `icon-index.sqlite`; L1 search is extended to include it alongside `phosphor` (switchable via `L1_SOURCES` env var).
- All Phylopic entries removed from the index — they are already disabled in the live search and add dead weight.
- Per-word timing stats (png_ms, trace_ms, skeleton_ms) recorded in CSV to evaluate live-loop feasibility later.

## Capabilities

### New Capabilities

- `custom-svg-ingestion`: Offline pipeline (setup, generate, trace, vet, ingest) for building and maintaining a curated `custom` SVG source in the icon index.

### Modified Capabilities

- `retrieval-pipeline`: L1 now searches `phosphor` and `custom` sources (controlled by `L1_SOURCES` env var); `custom` threshold is 0.85.
- `svg-icon-index`: New `custom` source added; Phylopic entries removed; `L1_SOURCES` controls which sources L1 queries.

## Impact

- `scripts/custom-pipeline/` — new directory with setup, generate, trace, vet, ingest scripts and CSV state file
- `lambda/src/retrieval.ts` — L1 search extended to `L1_SOURCES`-driven source filter; custom threshold added
- `data/icon-index.sqlite` — Phylopic rows deleted; custom rows added by ingest script
- New npm dependencies in `scripts/`: `express`, `better-sqlite3` (already present), `@types/express`
- vtracer Windows x64 binary downloaded to `scripts/custom-pipeline/bin/` by setup script; not committed to repo
