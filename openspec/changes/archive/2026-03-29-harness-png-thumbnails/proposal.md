## Why

The test harness renders match results as tiny in-browser canvases (150×130px single, 90×90px compare) that are too small for meaningful visual inspection. There are no per-word image files on disk, making it impossible to diff two runs visually — you can only compare scores numerically.

## What Changes

- Add `canvas` npm package to test-harness for server-side PNG rendering
- Extract rendering logic into `test-harness/render-patch.ts` — a self-contained module using node-canvas + D3
- During each run, save one PNG per word to `reports/<run-id>/<word>.png` alongside `results.json`
- Replace `<canvas>` elements in the HTML report with `<img src="./<word>.png">` tags
- Increase thumbnail display size in single reports (≥300px) and compare reports (≥200px per side)
- The rendering style matches the frontend closely (same star colours, same radius formula, same edge lines) but is independent code — no shared module with `frontend/src/renderer.ts`

## Capabilities

### New Capabilities
- `harness-thumbnail-rendering`: Server-side PNG generation per word result during test runs; image files saved to the run directory; HTML reports reference saved files instead of rendering inline

### Modified Capabilities
- `test-harness-report`: Thumbnail size increases; `<canvas>` replaced with `<img>`; report now depends on PNG files existing in the run directory
- `test-harness-runner`: Runner now saves PNG files as part of each word's result processing

## Impact

- `test-harness/run.ts`: calls renderPatch per word, saves PNG, updates HTML generation
- `test-harness/render-patch.ts`: new file
- `test-harness/package.json`: adds `canvas` and `@types/canvas` dependencies (native binary)
- `test-harness/node_modules/`: rebuild required after adding `canvas`
- No changes to `frontend/`
