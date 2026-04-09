## Why

The current SVG-to-skeleton pipeline produces unrecognisable constellations for line drawings because both existing strategies (`concave-hull` and `polygon-union`) collapse all SVG subpaths into a single outer contour. For icons like "bicycle" this throws away the structural topology entirely — the two wheel circles, frame triangle, and handlebars are lost inside a shapeless blob. The root cause is that vtracer consistently encodes line drawings as one outer-contour subpath plus hole subpaths, and the hole subpaths carry the structural signal (wheel interiors, frame spaces, body areas) that makes a shape recognisable.

## What Changes

- **New `subpath-components` strategy** added to `svg-to-skeleton.ts`: treats each SVG subpath as an independent structural element, builds a multi-component skeleton graph (intra-subpath closed loops + inter-subpath proximity bridges) instead of a single outer hull.
- **Vetting UI expanded**: `03-vet-server.ts` now renders three skeleton previews side-by-side (one per strategy) so the operator can visually pick the best representation per word.
- **CSV schema extended**: new `skeleton_strategy` column records which strategy was chosen at vetting time; accepted words carry their chosen strategy into ingest.

## Capabilities

### New Capabilities

- `skeleton-subpath-strategy`: The `subpath-components` strategy implementation — per-subpath point sampling, budget allocation proportional to perimeter, multi-component edge graph with inter-subpath proximity bridges, and single-subpath fallback to `concave-hull`.
- `multi-strategy-vetting-ui`: Vetting server displays all three skeleton strategies side-by-side; operator selects preferred strategy per word via keyboard shortcut; selection persisted to CSV.

### Modified Capabilities

- `svg-to-skeleton`: New strategy option added to the `strategy` union type and dispatch logic. Existing strategies unchanged.
- `svg-icon-index` (pipeline CSV): New `skeleton_strategy` column added to `words.csv` schema.

## Impact

- `lambda/src/svg-to-skeleton.ts` — new strategy branch, new helper functions
- `scripts/custom-pipeline/03-vet-server.ts` — UI layout, skeleton pre-computation, keyboard shortcuts, `/api/decide` payload
- `scripts/custom-pipeline/csv.ts` — new `skeleton_strategy` field on `WordRow`
- No changes to `retrieval.ts`, `04-ingest.ts`, or the database schema
- No new npm dependencies required
