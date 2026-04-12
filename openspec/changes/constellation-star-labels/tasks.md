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

## 5. Verification

- [x] 5.1 Run the test harness to confirm no regressions
- [ ] 5.2 Visual check with Playwright: open `?show_stars=constellation`, trigger a constellation match, screenshot to confirm labels appear on matched stars
- [ ] 5.3 Visual check with Playwright: confirm `?show_stars=1` still shows only the 20 hardcoded named stars (no constellation-star labels)
- [ ] 5.4 Visual check with Playwright: confirm no labels when `show_stars` is absent
