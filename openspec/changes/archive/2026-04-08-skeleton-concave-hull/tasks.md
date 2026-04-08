## 1. Dependencies

- [x] 1.1 Add `concaveman` to `lambda/package.json`; add `@types/concaveman` if needed
- [x] 1.2 Remove `polygon-clipping` from `lambda/package.json`
- [x] 1.3 Run `npm install` in `lambda/` and verify no import errors

## 2. Core Implementation

- [x] 2.1 Remove `extractOutlineContour` function and `polygon-clipping` import from `lambda/src/svg-to-skeleton.ts`
- [x] 2.2 Add `concaveHullContour(points: Point[], concavity: number): Point[]` using `concaveman`; return `[]` for fewer than 3 points
- [x] 2.3 Add `concavity` field to `SvgToSkeletonOptions` (default `3.0`)
- [x] 2.4 Replace the `extractOutlineContour(normSubpaths)` call in `svgToSkeleton` with `concaveHullContour(normSubpaths.flat(), concavity)`
- [x] 2.5 Bump cache key suffix from `outline-v1` to `outline-v2`

## 3. Tests

- [x] 3.1 Add unit test: single filled polygon input → hull closely follows boundary
- [x] 3.2 Add unit test: 50+ disconnected thin rectangle subpaths (simulated line-art) → hull encloses the full bounding extent, not just a subset
- [x] 3.3 Add unit test: fewer than 3 points → `svgToSkeleton` returns `null`
- [x] 3.4 Add unit test: `concavity` option forwarded correctly (mock `concaveman` call, assert arg)
- [x] 3.5 Run existing test suite and confirm no regressions

## 4. Tuning

- [x] 4.1 Start the vet server (`npx tsx 03-vet-server.ts`) and navigate to the eagle word
- [x] 4.2 Test `concavity` values (1.5, 2.0, 3.0, 5.0) via `?concavity=` query param in the vet server — add this param to the `/word/:word` endpoint, forwarding it to `svgToSkeleton`
- [x] 4.3 Review skeleton quality for at least 5 organic/animal words in the pilot set (eagle, bear, butterfly, bee, crab) and confirm body-scale concavities are captured
- [x] 4.4 Set the final default `concavity` value in code based on tuning results

## 5. Cleanup

- [x] 5.1 Delete stale `outline-v1` cache files from `data/l5-cache/` (glob: `*__outline-v1.json`)
- [x] 5.2 Run the test harness and confirm overall skeleton quality has not regressed
