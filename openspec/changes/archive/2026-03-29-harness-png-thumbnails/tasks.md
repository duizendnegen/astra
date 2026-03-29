## 1. Dependencies

- [x] 1.1 Add `canvas` and `@types/canvas` to `test-harness/package.json` devDependencies; run `npm install` in `test-harness/`

## 2. render-patch.ts

- [x] 2.1 Create `test-harness/render-patch.ts`; import `createCanvas` from `canvas` and `* as d3` from `d3`; export `RenderOpts` interface `{ width: number; height: number; patchRadiusDeg: number }`
- [x] 2.2 Implement `renderPatch(result: WordResult, opts: RenderOpts): Buffer` — background fill, geoStereographic projection setup centred on `patchRA`/`patchDec`, scaled to `patchRadiusDeg`
- [x] 2.3 Draw background patch stars: radius `max(0.5, 2.2 - mag * 0.25)`, dim colour (`#2a2a55`) for non-matched, medium blue (`#aabbdd`) for matched-but-not-constellation
- [x] 2.4 Draw constellation stars: white fill (`#ffffff`)
- [x] 2.5 Draw skeleton edges: `rgba(100, 160, 255, 0.55)`, lineWidth 1, between `skeletonPoints` pairs indexed by `edges`
- [x] 2.6 Handle unmatched result: fill background, draw "no match" text in centre
- [x] 2.7 Return `canvas.toBuffer('image/png')`

## 3. Runner integration

- [x] 3.1 Import `renderPatch` in `run.ts`; define `THUMB_SIZE = 300` constant
- [x] 3.2 After each word's match call in `runSuite`, call `renderPatch(wordResult, { width: THUMB_SIZE, height: THUMB_SIZE, patchRadiusDeg: PATCH_RADIUS_DEG })` and write the buffer to `path.join(outDir, `${word}.png`)`

## 4. HTML report updates

- [x] 4.1 In `generateReportHtml`: replace `<canvas class="sky" width="150" height="130" ...>` with `<img src="./${r.word}.png" class="sky">`; update card CSS width to ~320px, img display block with width 100%
- [x] 4.2 In `generateReportHtml`: remove the inline `<script>` rendering block (the `renderCard` function and canvas query loop) and the D3 CDN `<script>` tag; keep the results JSON embed only if still needed for other purposes (remove it too if nothing else uses it)
- [x] 4.3 In `generateCompareHtml`: replace `<canvas class="sky sky-a" width="90" height="90" ...>` and `sky-b` with `<img src="../${idA}/${rA.word}.png">` and `<img src="../${idB}/${rA.word}.png">`; update half/card CSS so each image is ≥200px wide
- [x] 4.4 In `generateCompareHtml`: remove the inline `<script>` rendering block and D3 CDN tag

## 5. Validation

- [x] 5.1 Run `npx tsx run.ts --model vertex` — confirm PNG files are written to the run directory (one per word)
- [x] 5.2 Open the HTML report via local server — confirm images display at the expected size with stars and edges visible
- [x] 5.3 Run compare mode — confirm both run thumbnails appear side by side with correct relative paths
