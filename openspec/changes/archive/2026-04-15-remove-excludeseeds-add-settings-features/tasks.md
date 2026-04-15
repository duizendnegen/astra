## 1. Remove excludeSeeds end-to-end

- [x] 1.1 Remove `excludeSeeds` parsing and `excludeSet` construction from `lambda/src/skeleton.ts`; remove cache-bypass logic tied to `excludeSeeds.length`
- [x] 1.2 Remove `excludeSeeds` parsing and cache-bypass logic from `lambda/src/local.ts`
- [x] 1.3 Remove the `excludeSeeds: Set<number>` parameter from `match()` in `lambda/src/matcher.ts` and from `pairwiseAnchorSearch`, `singleSweepSearch`, and `anyVertexSearch`
- [x] 1.4 Remove `usedPatches: Set<number>`, `excludeSeeds: Array.from(usedPatches)` in the POST body, and `usedPatches.add(seedStarId)` from `frontend/src/main.ts`; remove `seedStarId` consumption from the response handler
- [x] 1.5 Run the test harness to confirm no regressions in constellation matching

## 2. Add Procrustes rotation angle to backend response

- [x] 2.1 Extract `procrustesAngle` (`atan2(R[1][0], R[0][0])`) from the Procrustes rotation matrix inside `match()` in `matcher.ts` and add it to the `MatchResult` return value
- [x] 2.2 Add `procrustesAngle?: number` to the `MatchResult` type in `lambda/src/types.ts`
- [x] 2.3 Verify `procrustesAngle` is present in the JSON response from `skeleton.ts` (no serialisation change needed if it's already spread from `MatchResult`)

## 3. Extend retrieval trail

- [x] 3.1 Add `TrailEntry` interface (`candidate`, `hitId`, `sim`) to `lambda/src/types.ts`
- [x] 3.2 Add `trail?: TrailEntry[]` to the `MatchProvenance` type in `lambda/src/types.ts`
- [x] 3.3 Accumulate `trail: TrailEntry[]` inside `l3Task` in `lambda/src/retrieval.ts`: push a record after each candidate's embedding search, recording hit or miss outcome
- [x] 3.4 Attach the accumulated `trail` to the returned `MatchProvenance` when L3 wins

## 4. Replace feature flags with localStorage API

- [x] 4.1 Rewrite `frontend/src/features.ts`: remove `getFeatures(URLSearchParams)`, add `loadFeatures(): Features` and `saveFeatures(features: Features): void` with `localStorage` key `astra-features` and try/catch fallback
- [x] 4.2 Update the `Features` type to add `showConstellationImage: boolean`, `showAssociation: boolean`, `showStarLabels: boolean` (default all `false`)
- [x] 4.3 Update `frontend/src/main.ts` to call `loadFeatures()` instead of `getFeatures(params)`; remove URL param reads for `show_lines`, `show_stars`, `render_mode`

## 5. Settings panel — HTML + CSS

- [x] 5.1 Add `#settings-btn` (gear icon ⚙) positioned top-right in `frontend/index.html`; add `#settings-panel` with three `<label><input type="checkbox">` rows (Constellation image, Association, Star labels [disabled])
- [x] 5.2 Add CSS in `frontend/src/style.css` for `#settings-btn` and `#settings-panel` (top-right positioning, dark theme matching the landing screen)
- [x] 5.3 Hide `#settings-btn` when `#result` is shown; show it when `#landing` is shown

## 6. Settings panel — behaviour wiring

- [x] 6.1 On page load, call `loadFeatures()` and set checkbox states to match stored values
- [x] 6.2 On each checkbox `change` event, call `saveFeatures()` with updated features and immediately apply the feature state (show/hide SVG overlay, show/hide association panel)
- [x] 6.3 Visually test: open settings, toggle "Constellation image" and "Association", verify instant feedback; verify "Star labels" is non-interactive

## 7. SVG source overlay

- [x] 7.1 Add `<div id="svg-overlay">` absolutely positioned over the canvas in `frontend/index.html`
- [x] 7.2 Add CSS for `#svg-overlay` and its inner `svg`: `mix-blend-mode: screen`, `opacity: 0.35`, `stroke: white`, `fill: none`, thin `stroke-width`
- [x] 7.3 In `frontend/src/main.ts`, after a result arrives with `showConstellationImage: true`, inject `match.svgPath` as `innerHTML` of `#svg-overlay`
- [x] 7.4 Implement `computeSvgTransform(skeletonPoints, procrustesAngle, projection, canvas)` in a new `frontend/src/overlay.ts`: project `skeletonPoints` via D3, compute centroid `(cx, cy)`, bounding-box scale `s`, return CSS transform string
- [x] 7.5 Apply the computed CSS transform to the inner `<svg>` element; clear and hide `#svg-overlay` when the result panel closes or the feature is toggled off
- [x] 7.6 Recalculate and reapply the transform on window `resize`
- [x] 7.7 Visually test: run a search, enable "Constellation image", confirm SVG is visible and roughly aligned with the star constellation; resize the window and confirm realignment

## 8. Association trail panel

- [x] 8.1 Add `<div id="association-panel">` below `#coord-panel` in `frontend/index.html`
- [x] 8.2 Add CSS for `#association-panel` (small monospace text, muted colour for misses, highlight colour for hit)
- [x] 8.3 Implement `renderTrail(match, panel)` in `frontend/src/main.ts` or a small utility: render L1/L3/L4 text according to the spec; show/hide based on `showAssociation`
- [x] 8.4 Call `renderTrail` after each constellation result; clear panel on result close
- [x] 8.5 Visually test with Playwright: search a word that hits L3, enable "Association", confirm the synonym trail (misses greyed, hit highlighted with score) is rendered; search a word that hits L1, confirm "L1 · direct" format

## 9. Final integration and test harness

- [x] 9.1 Run the full test harness and confirm pass rate is unchanged from before this change
- [x] 9.2 Visually test the complete flow with Playwright: land → open settings → search → result panel shows (settings icon gone) → enable constellation image and association from settings (toggle settings icon back by closing result) → verify both features render correctly
- [x] 9.3 Verify `localStorage` persistence: enable features, reload page, confirm settings are restored
