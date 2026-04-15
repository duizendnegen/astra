## 1. Build Script & Data Asset

- [x] 1.1 Download HYG database CSV (`hygdata_v41.csv`) to `scripts/` (document source URL in script header)
- [x] 1.2 Create `scripts/generate-star-names.ts` — reads HYG CSV, filters to HIP IDs in `stars.json`, applies proper-name-first / Bayer-fallback logic with Greek letter map, writes `frontend/public/data/star-names.json`
- [x] 1.3 Run the script and commit `frontend/public/data/star-names.json`
- [x] 1.4 Verify output: spot-check Sirius (HIP 32263 → `"Sirius"`), Betelgeuse (HIP 27919 → `"Betelgeuse"`), and a Bayer-only star

## 2. Feature Flag Update

- [x] 2.1 Change `Features.showStars` type from `boolean` to `false | 'named' | 'constellation'` in `frontend/src/features.ts`
- [x] 2.2 Update `getFeatures()` to map `show_stars=1` → `'named'`, `show_stars=constellation` → `'constellation'`, else → `false`
- [x] 2.3 Update `drawNamedStars()` guard in `renderer.ts` from `features.showStars` to `features.showStars === 'named'`
- [x] 2.4 Update feature-flags tests in `frontend/src/__tests__/` to cover all three `showStars` values

## 3. Catalogue Loader

- [x] 3.1 Add `loadStarNames()` to `frontend/src/catalogue.ts` — fetches `/data/star-names.json` and returns `Map<number, string>`
- [x] 3.2 Call `loadStarNames()` in `frontend/src/main.ts` alongside `loadCatalogue()` and pass the result into the renderer

## 4. Renderer

- [x] 4.1 Add `starNameMap: Map<number, string>` module variable to `renderer.ts`
- [x] 4.2 Extend `setOverlayData()` (or add a new setter) to accept and store the star names map
- [x] 4.3 In `drawConstellation()`, after drawing each star's dot and glow, look up `starNameMap.get(star.id)` and render a text label when `features.showStars === 'constellation'` and a name exists
- [x] 4.4 Apply `constellationAlpha` to label opacity so labels fade in/out with the constellation

## 5. Verification (Phase 1)

- [x] 5.1 Run the test harness to confirm no regressions

## 6. Settings Panel Wiring & URL Cleanup

- [x] 6.1 Remove `showStars: false | 'named' | 'constellation'` from `Features` in `frontend/src/features.ts`; confirm `showStarLabels: boolean` default remains `false`
- [x] 6.2 Remove `drawNamedStars()` from `renderer.ts`; update renderer to gate constellation labels on `features.showStarLabels` instead of `features.showStars === 'constellation'`
- [x] 6.3 Add DOM ref `featureStarLabels` and `change` listener in `main.ts`: updates `features.showStarLabels`, calls `saveFeatures`, triggers lazy `loadStarNames()` + `setOverlayData` on first toggle-on
- [x] 6.4 Update `boot()` in `main.ts`: replace `features.showStars === 'constellation'` guard with `features.showStarLabels`; sync `featureStarLabels.checked` from loaded features
- [x] 6.5 Remove `disabled` attribute from `#feature-star-labels` checkbox in `frontend/index.html`
- [x] 6.6 Remove `show_stars` / `show_lines` forwarding lines from `share.ts:buildShareUrl`; simplify to emit only `?c=`
- [x] 6.7 Delete the two URL-param test cases from `frontend/src/__tests__/share.test.ts` (`preserves show_stars and show_lines when active`, `omits flag params when not present`)
- [x] 6.8 Update specs: `feature-flags/spec.md`, `constellation-star-labels/spec.md`, `constellation-rendering/spec.md`, `settings-panel/spec.md`
- [x] 6.9 Run the test harness; confirm all tests pass
