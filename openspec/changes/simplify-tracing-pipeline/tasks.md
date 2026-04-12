## 1. Abandon skeleton-subpath-components change

- [ ] 1.1 Delete `openspec/changes/skeleton-subpath-components/` directory entirely

## 2. Remove vtracer

- [ ] 2.1 Delete `scripts/custom-pipeline/bin/vtracer.exe`
- [ ] 2.2 Delete `scripts/custom-pipeline/setup.ts`

## 3. Update csv.ts

- [ ] 3.1 Remove `potrace_svg_path` field from `WordRow` interface
- [ ] 3.2 Remove `potrace_svg_path` from the `HEADERS` array and `initCsvFromWordList` initialiser

## 4. Simplify 02-trace-svgs.ts

- [ ] 4.1 Remove the `execFileAsync`, `VTRACER_PATH`, `VTRACER_FLAGS`, `MAX_SUBPATHS`, `countSubpaths`, and `tracePng` declarations
- [ ] 4.2 Remove the vtracer existence check at startup
- [ ] 4.3 Rewrite the per-word tracing loop: call `traceWithPotrace` and write result to `row.svg_path` (using `{word}-linedrawing.svg` path); remove the secondary Potrace block
- [ ] 4.4 Remove `potrace_svg_path` assignments from the loop

## 5. Simplify svg-to-skeleton.ts

- [ ] 5.1 Remove `concaveHullContour` function and its `concaveman` import
- [ ] 5.2 Remove `buildMultiComponentSkeleton` function and the `buildProximityBridges` helper
- [ ] 5.3 Remove `strategy` and `concavity` fields from `SvgToSkeletonOptions` type
- [ ] 5.4 Update `svgToSkeleton`: remove strategy dispatch branch (`if strategy === 'subpath-components'`), remove `strategy = 'concave-hull'` default, always call `extractOutlineContour` (polygon-union path)
- [ ] 5.5 Remove `concavity` parameter from the cache key and from the `concaveHullContour` call site
- [ ] 5.6 Update the `strategy` comment in the cache key to remove strategy from the key string (fix to `polygon-union` implicitly)

## 6. Update retrieval.ts

- [ ] 6.1 In `svgToSkeletonWithOpts`, remove the `source === 'phosphor'` ternary — always pass `strategy: 'polygon-union'` (or just omit strategy if it's removed from the type)

## 7. Simplify 03-vet-server.ts

- [ ] 7.1 Remove `potraceBase64` from `WordData` interface and `buildWordCache`
- [ ] 7.2 Remove `subpathComponents` from the `skeletons` object in `WordData` and `buildWordCache`
- [ ] 7.3 Remove the `computeSkeleton` calls for `concave-hull` and `subpath-components`
- [ ] 7.4 Remove the `strategy` parameter from `computeSkeleton` (always uses polygon-union)
- [ ] 7.5 Remove the potrace SVG panel from `HTML_PAGE`
- [ ] 7.6 Remove the subpath-components skeleton canvas and panel from `HTML_PAGE`
- [ ] 7.7 Remove the concave-hull skeleton canvas label ("1 —") — rename polygon-union panel to just "Skeleton" with no number prefix
- [ ] 7.8 Remove the `selectedStrategy` state, `STRATEGIES`, `STRATEGY_KEYS`, `CANVAS_IDS`, `selectStrategy`, `updateStrategyHighlight` from the client JS
- [ ] 7.9 Remove the strategy-selection guard from `decide()` (the "pick a skeleton strategy first" block)
- [ ] 7.10 Hardcode `skeletonStrategy: 'polygon-union'` in the `/api/decide` POST body
- [ ] 7.11 Remove keyboard shortcuts `1`, `2`, `3` from the `keydown` handler
- [ ] 7.12 Remove `#strategy-hint` element and its CSS
- [ ] 7.13 Remove the `/api/word/:word?concavity=N` endpoint

## 8. Update tests

- [ ] 8.1 Update `svg-to-skeleton.test.ts`: remove any tests for `concave-hull` strategy, `subpath-components` strategy, and `concavity` option; ensure polygon-union tests pass
- [ ] 8.2 Run the full test suite and confirm it passes

## 9. Visual verification

- [ ] 9.1 Start the vet server (`npx tsx 03-vet-server.ts`) and use Playwright to screenshot the UI; confirm PNG | SVG | skeleton layout with no strategy picker and immediate accept

## 10. Spec archive

- [ ] 10.1 Run `openspec archive --change simplify-tracing-pipeline` to merge spec deltas into canonical specs
