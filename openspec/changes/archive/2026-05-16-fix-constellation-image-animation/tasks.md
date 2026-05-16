## 1. Per-frame SVG transform during result animation

- [x] 1.1 Add optional `onFrame?: () => void` parameter to `animateTo` in `renderer.ts`, invoked inside the `step` loop after `draw()` on every frame
- [x] 1.2 Add optional `onFrame?: () => void` parameter to `animateToResult` in `renderer.ts` and thread it through to `animateTo`
- [x] 1.3 In `showResult` in `main.ts`, pass `updateSvgTransform` as the `onFrame` argument to `animateToResult`

## 2. Instant SVG clear on result panel close

- [x] 2.1 In `showLanding` in `main.ts`, change `clearSvgOverlay(LANDING_ANIM_MS)` to `clearSvgOverlay()` (no argument — instant removal)

## 3. Tests

- [x] 3.1 Run the existing test harness and confirm no regressions (`npm test` or equivalent in the frontend package)

## 4. Visual verification

- [x] 4.1 Start the app with Docker Compose and open it in a browser via the Playwright MCP server
- [x] 4.2 Submit a word, observe the result animation: the constellation image should track the stars as the camera pans/zooms in (not sit at a fixed screen position during fade-in)
- [x] 4.3 Close the result panel: the constellation image should disappear at the same instant as the matched stars (no lingering fade)
