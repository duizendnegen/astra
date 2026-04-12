## 1. Dependencies

- [x] 1.1 Add `potrace` to `scripts/custom-pipeline/package.json` and run `npm install`
- [x] 1.2 Add `@types/potrace` or write a local type declaration if no types package exists

## 2. CSV Schema

- [x] 2.1 Add `potrace_svg_path` field to `WordRow` in `csv.ts`

## 3. Trace Step

- [x] 3.1 Import `potrace` in `02-trace-svgs.ts` and add a `traceWithPotrace(pngPath, svgPath)` helper
- [x] 3.2 After each successful vtracer trace, run Potrace on the same PNG and write `{word}-linedrawing-potrace.svg`
- [x] 3.3 Store the Potrace SVG path in `row.potrace_svg_path`; log a warning and continue on failure

## 4. Vet UI

- [x] 4.1 Load `potrace_svg_path` into the cached `WordData` in `03-vet-server.ts`
- [x] 4.2 Send `potraceBase64` alongside `svgBase64` in the `/api/words` response
- [x] 4.3 Add a "potrace" SVG column to the vet UI HTML between the vtracer SVG and skeleton columns
- [x] 4.4 Render Potrace SVG as `<img>` from base64; show placeholder text when absent

## 5. Visual Verification

- [x] 5.1 Run the vet server and use Playwright to screenshot the vet UI with a word that has both SVGs; confirm both columns render correctly
