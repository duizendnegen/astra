## Context

The test harness currently renders match results as small inline canvases (150×130px) drawn in-browser from embedded JSON. There are no image files on disk. The HTML report is self-contained but images can't be diffed between runs.

`frontend/src/renderer.ts` contains the authoritative rendering logic but is stateful, animation-driven, and DOM-coupled. `frontend/src/export.ts` screenshots the live canvas — it doesn't contain reusable drawing logic. There is no shared rendering primitive to extract without refactoring `renderer.ts`, which is out of scope.

## Goals / Non-Goals

**Goals:**
- PNG file per word written to `reports/{runId}/{word}.png` during each run
- Images large enough for visual inspection (300×300px)
- Compare report shows images side-by-side via `<img>` src paths
- Visual style close enough to the frontend to be meaningful

**Non-Goals:**
- Sharing code with `frontend/src/renderer.ts` (no common module)
- Replicating full-sky background, distance dimming, glow gradients, IAU lines
- Animation or interactive features

## Decisions

### `node-canvas` for server-side rendering
`node-canvas` implements the Canvas 2D API identically to the browser. The existing in-browser `renderCard()` logic can be ported with minimal changes — same D3 geoStereographic call, same drawing primitives. Alternatives: Playwright (slow, requires browser launch per image), sharp (no Canvas 2D API, needs different approach entirely).

### `render-patch.ts` lives in `test-harness/`, not `frontend/src/`
The rendering is a debug/analysis view, not a user-facing feature. The harness can add analysis overlays (score annotations, threshold rings) without affecting the frontend. If `renderer.ts` is ever refactored into a pure function, swapping it in is a one-line change.

### D3 imported from `frontend/node_modules` via tsx path resolution
The harness already imports from `../frontend/src/` (matcher, types). D3 is available in `frontend/node_modules`. No need to add D3 to `test-harness/package.json` — tsx resolves it transitively. Only `canvas` and `@types/canvas` need to be added to the harness.

### PNG size: 300×300px
Large enough for visual comparison at full size and 2-up compare view. Small enough that 42 PNGs per run (~500KB total at typical compression) doesn't bloat the reports directory.

### HTML switches from `<canvas>` + embedded JSON to `<img src="./{word}.png">`
Removes D3 CDN dependency from the report HTML. Report becomes a simple image grid — no JavaScript rendering on page load. Compare report references sibling run directories with relative paths (`../{idA}/{word}.png`).

## Risks / Trade-offs

- [node-canvas native binary] → Requires Python + build tools at install time. Acceptable for a developer tool; documented in setup instructions.
- [Report no longer self-contained] → HTML depends on PNG files in the same directory. Opening `report.html` directly without a server still works (relative `<img>` src paths work with `file://`). Compare report needs a server since it references parent-directory paths.
- [Visual divergence from frontend] → The harness renderer won't have distance dimming or glow. Acceptable — the purpose is matching analysis, not pixel-perfect reproduction.

## Open Questions

- None. Scope is well-defined.
