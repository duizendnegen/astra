## 1. Restore polygon-union in svg-to-skeleton.ts

- [x] 1.1 Restore `extractOutlineContour` (polygon-union function from commit `e639535`) alongside `concaveHullContour`; ensure `polygonClipping` import is present
- [x] 1.2 Add `strategy?: 'concave-hull' | 'polygon-union'` to `SvgToSkeletonOptions` (default `'concave-hull'`)
- [x] 1.3 Update step 3 to branch on `strategy`: call `concaveHullContour` or `extractOutlineContour` accordingly
- [x] 1.4 Update skeleton cache key to include `strategy` token and bump suffix to `outline-v3`

## 2. Update retrieval.ts call sites

- [x] 2.1 Update `svgToSkeletonWithOpts` signature to accept optional `source?: string` second argument
- [x] 2.2 Pass `strategy: 'polygon-union'` when `source === 'phosphor'`, otherwise omit (defaults to concave-hull)
- [x] 2.3 Update L1 hit call site to pass `best.entry.source`
- [x] 2.4 Update L3 hit call site to pass `best.entry.source`

## 3. Tests

- [x] 3.1 Add unit tests for `extractOutlineContour`: filled icon with hole, multiple disconnected regions, union failure fallback
- [x] 3.2 Add a test for `svgToSkeleton` with `strategy: 'polygon-union'` producing a different skeleton than `strategy: 'concave-hull'` on a multi-subpath Phosphor icon
- [x] 3.3 Add a test verifying the cache key differs between strategies (same SVG, different strategies → different cache entries)
- [x] 3.4 Run `npm test` in `lambda/` and confirm all tests pass

## 4. Visual verification

- [x] 4.1 Run test harness and visually inspect Phosphor icon skeletons to confirm they are sharper / more accurate than with concave hull
