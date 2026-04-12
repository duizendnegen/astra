### Requirement: Trace step produces vtracer and Potrace SVGs
The trace step SHALL produce two SVG files per word: one from vtracer (existing) and one from Potrace (new), both stored in `data/custom/`. Only the vtracer SVG is used for ingest.

#### Scenario: Both tracers run on same PNG
- **WHEN** a word has a `png_path` and `status` of `proposed`
- **THEN** `02-trace-svgs.ts` produces `{word}-linedrawing.svg` (vtracer) and `{word}-linedrawing-potrace.svg` (Potrace), recording both paths in `words.csv`

#### Scenario: Ingest uses vtracer SVG only
- **WHEN** a word is accepted in the vet UI and ingested
- **THEN** `04-ingest.ts` uses `svg_path` (vtracer) as the ingested SVG; `potrace_svg_path` is ignored
