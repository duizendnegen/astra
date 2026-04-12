## Why

The custom-skeleton-pipeline uses the `vtracer` native binary to trace PNGs to SVG, which works well offline but cannot easily run in Lambda (no binary bundling). `potrace` is a pure-Node alternative that could replace vtracer in the live L4 fallback — but its tracing quality is unknown. This change evaluates Potrace quality by adding it as a second tracer in the custom-pipeline vetting UI, where vtracer and Potrace SVGs can be compared side-by-side.

## What Changes

- `potrace` npm package added to `scripts/custom-pipeline/`
- `02-trace-svgs.ts` extended to also trace each PNG with Potrace, writing a second SVG file alongside the vtracer output
- `words.csv` schema extended with a `potrace_svg_path` column
- Vetting UI (`03-vet-server.ts`) updated to display both the vtracer SVG and the Potrace SVG side-by-side for direct comparison

## Capabilities

### New Capabilities

- `potrace-tracing`: Potrace-based PNG-to-SVG tracing step in the custom pipeline, producing a second SVG per word for quality comparison against vtracer output.

### Modified Capabilities

- `custom-svg-ingestion`: Trace step now produces two SVG files per word (vtracer + Potrace); vet UI displays both. No change to ingest — vtracer SVG remains the ingested artifact for now.

## Impact

- `scripts/custom-pipeline/package.json` — new `potrace` dependency
- `scripts/custom-pipeline/csv.ts` — new `potrace_svg_path` field on `WordRow`
- `scripts/custom-pipeline/02-trace-svgs.ts` — Potrace tracing added alongside vtracer
- `scripts/custom-pipeline/03-vet-server.ts` — second SVG column in vet UI
- No changes to `lambda/`, `retrieval.ts`, or the database schema
