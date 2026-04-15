## Context

Astra is a constellation-discovery app: users type a word, the backend retrieves a matching SVG icon (via L1 embedding or L3 LLM synonym expansion), maps it onto a real star field via Procrustes alignment, and returns a render-ready constellation. Currently:

- `excludeSeeds` threads a set of used seed-star IDs from frontend → POST body → matcher → three search functions, preventing the same anchor star being reused across consecutive searches for the same word.
- Feature flags (`showLines`, `showStars`, `renderMode`) are parsed from URL params in `features.ts`; there is no UI panel.
- `MatchProvenance` returns only the winning L3 candidate; the full synonym trial list is logged but discarded.
- The matched SVG is available in the response (`match.svgPath`) but never rendered in the browser.

## Goals / Non-Goals

**Goals:**
- Remove the `excludeSeeds` request/response round-trip and all related backend code.
- Replace URL-param feature flags with a localStorage-backed settings panel (gear icon on landing).
- Render the matched SVG inline in the DOM, geometrically aligned to the constellation using CSS transforms derived from the Procrustes rotation.
- Return the L3 synonym trial trail from the backend; display it in the result panel when the association feature is enabled.
- Add a greyed-out "star labels" toggle as a placeholder for a future branch.

**Non-Goals:**
- Implementing star label rendering (deferred).
- Making the SVG overlay sky-accurate (it is a reference silhouette, not a reprojected icon).
- Changing the matching algorithm or retrieval pipeline beyond trail collection.

## Decisions

### D1: excludeSeeds removal scope — end-to-end

Remove `excludeSeeds` from the POST body, `skeleton.ts`, `local.ts`, `matcher.ts`, and the three anchor-search functions (`pairwiseAnchorSearch`, `singleSweepSearch`, `anyVertexSearch`). Also remove `seedStarId` from the response and `usedPatches` from `main.ts`.

**Alternative considered**: Keep the backend parameter as optional and just stop sending it from the frontend. Rejected — dead parameters accumulate; a clean cut is easier to read and test.

**Consequence**: Repeated searches on the same word may return the same constellation. Acceptable since multi-search on a single word is a rare path.

### D2: Feature flags — localStorage + loadFeatures/saveFeatures API

Replace `getFeatures(params: URLSearchParams): Features` with:
- `loadFeatures(): Features` — reads `localStorage.getItem('astra-features')`, returns defaults if absent.
- `saveFeatures(features: Features): void` — writes to `localStorage.setItem('astra-features', …)`.

The `Features` type gains three new boolean fields: `showConstellationImage`, `showAssociation`, `showStarLabels` (always `false` at runtime until the labels branch lands, stored but ignored).

The URL-param path (`getFeatures`) is removed. Developer debug flags (`show_lines`, `show_stars`, `render_mode`) that were URL-only are also removed; `showLines` and `showStars` (IAU boundary lines and named star labels) become settings-panel toggles.

**Alternative considered**: Keep URL params as a parallel path for shareability. Rejected — the flags are not share-worthy state; the share link encodes the constellation result, not display preferences.

### D3: SVG overlay — inline SVG in DOM with CSS blend

The matched SVG (`match.svgPath`) is set as the `innerHTML` of a `<div id="svg-overlay">` element absolutely positioned over the canvas. The inner `<svg>` receives:

```css
mix-blend-mode: screen;
opacity: 0.35;
stroke: white;
stroke-width: <thin>;
fill: none;
```

and a CSS `transform: translate(cx px, cy px) rotate(θ rad) scale(s)`.

**Alternative considered**: `<img src="data:image/svg+xml,…">` — simpler but no control over stroke colour or width. Rejected in exploration.

**Alternative considered**: `ctx.drawImage()` on the canvas — single render surface but forces a redraw cycle; can't adjust SVG internals. Rejected in exploration.

### D4: SVG alignment — Procrustes angle from backend

The backend adds `procrustesAngle?: number` (radians) to `MatchResult`. It is computed by a standalone `computeProcrustesAngle(constellationStars, skeletonRaDec)` function via `atan2(h01 − h10, h00 + h11)` from the cross-covariance matrix H = B^T A of centred sky-space coordinates — mathematically equivalent to `atan2(R[1][0], R[0][0])` of the Procrustes rotation matrix R.

The frontend computes the CSS transform in `computeSvgTransform(skeletonPoints, canonicalPoints, procrustesAngle, projection, svgEl)` in `frontend/src/overlay.ts`:
- `(cx, cy)` = mean of projected skeletonPoints in canvas pixels (via D3 stereographic projection).
- Scale `s` = bounding-box diagonal of projected skeletonPoints / SVG bounding-box diagonal (from `getBBox()`, falling back to `viewBox` then `width`/`height` attributes).
- Pivot = centroid of `canonicalPoints` (skeleton points in normalised SVG viewBox coordinates, `[0,1]` space), back-projected to SVG pixel coordinates. Falls back to `getBBox()` centre when `canonicalPoints` are absent.
- Total sky-space rotation = `procrustesAngle + procrustes2D(centerMean(yFlip(canonical)), centerMean(physFlat))`. CSS `rotate()` negates this angle to account for the Dec-up → screen-y-down flip in the D3 projection.
- `transform-origin` is set to the pivot in SVG pixel coordinates; the transform string is `translate(tx px, ty px) rotate(−θ rad) scale(s)`.

**Alternative considered**: Derive θ client-side via PCA on projected skeletonPoints. Rejected — PCA approximates the principal axis, not the Procrustes rotation; they diverge when the skeleton is asymmetric.

### D5: Trail data — extend MatchProvenance

`MatchProvenance` gains an optional field:

```typescript
trail?: { candidate: string; hitId: string | null; sim: number | null }[]
```

`l3Task` in `retrieval.ts` builds this array as it iterates candidates, pushing a record after each embedding search regardless of outcome. The array is attached to the `MatchProvenance` returned from the function. For L1 and L4 hits, `trail` is undefined.

The frontend renders the trail as a compact text line below RA/Dec: layer badge, word → each candidate (greyed if miss, highlighted if hit with similarity). For L1: "L1 · direct — [icon-id] @ 0.91".

## Risks / Trade-offs

- [Duplicate constellations] Removing excludeSeeds means the same word always returns the same match after cache warms. → Mitigation: document in CHANGELOG; the cache-first behaviour is intentional.
- [SVG alignment drift] The D3 stereographic projection is non-linear near the poles; skeletonPoints near Dec ±80° will have distorted pixel positions. → Mitigation: the overlay is a visual reference, not a precise overlay — acceptable for debugging purposes.
- [SVG injection XSS] Inlining `match.svgPath` via `innerHTML` is safe because the SVG comes from our own S3 bucket (trusted source), but any future user-provided SVG must be sanitised. → Mitigation: note in code comment; add DOMPurify if user-supplied SVGs are ever introduced.
- [localStorage unavailable] In private/incognito mode on some browsers localStorage may throw. → Mitigation: wrap read/write in try/catch; fall back to in-memory defaults.
