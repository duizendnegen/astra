## REMOVED Requirements

### Requirement: Potrace traces PNG alongside vtracer
**Reason**: vtracer has been evaluated and rejected. Potrace is now the sole tracer; a secondary comparison output is no longer needed.
**Migration**: Remove vtracer from `02-trace-svgs.ts`. Potrace output is written directly to `svg_path`.

### Requirement: Potrace SVG path recorded in CSV
**Reason**: `potrace_svg_path` was a comparison column. With Potrace as the sole tracer, its output is `svg_path` directly.
**Migration**: Remove `potrace_svg_path` from the `WordRow` type and CSV headers in `csv.ts`. Potrace output is written to `svg_path`.

### Requirement: Vet UI displays both SVGs for comparison
**Reason**: No second tracer to compare against.
**Migration**: Remove the vtracer SVG panel from `03-vet-server.ts`. The single SVG panel (Potrace output via `svg_path`) needs no label.

## ADDED Requirements

### Requirement: Potrace is the sole SVG tracer
The trace step SHALL run Potrace on each PNG in `words.csv` with status `proposed` and a `png_path` but no `svg_path`, writing the resulting SVG directly to `svg_path` (e.g. `{word}-linedrawing.svg`). No secondary tracer SHALL be invoked.

#### Scenario: Potrace SVG written to svg_path
- **WHEN** a word has a `png_path` and no `svg_path`
- **THEN** the trace step produces `{word}-linedrawing.svg` and records its absolute path in `svg_path`

#### Scenario: Potrace failure leaves word untraced
- **WHEN** Potrace tracing fails for a word
- **THEN** `svg_path` remains empty, a warning is logged, and the word remains at status `proposed`

### Requirement: Vetting UI shows PNG, SVG, and skeleton only
The vetting UI SHALL display three panels per word: the generated PNG, the Potrace SVG, and the polygon-union skeleton. No strategy selection is required before accepting a word.

#### Scenario: Accept fires immediately
- **WHEN** the operator presses A or clicks Accept
- **THEN** the decision is recorded immediately without requiring a prior strategy selection
