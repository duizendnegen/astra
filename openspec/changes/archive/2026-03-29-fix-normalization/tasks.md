## 1. Prerequisite

- [x] 1.1 Confirm `constellation-test-harness` is complete and a baseline run (e.g. `v1`) has been recorded — this run is the before-state for comparison

## 2. Add SKELETON_FILL_RATIO Constant

- [x] 2.1 Add `SKELETON_FILL_RATIO = 0.8` to the constants block at the top of `frontend/src/matcher.ts`, with a comment explaining it as the fraction of patch diameter the skeleton's longest axis should span
- [x] 2.2 Annotate existing constants with their angular equivalents at the default patch size: e.g. `DISTANCE_THRESHOLD = 0.10 // 10% of patch radius = 1° at default 10° patch`

## 3. Replace Independent Normalization in scoreAndMatch

- [x] 3.1 Replace the `normalise(starFlat)` call with a seed-anchored flat-sky projection: centre on `seed.ra` / `seed.dec`, divide by `PATCH_RADIUS_DEG` — this requires passing the seed into `scoreAndMatch`
- [x] 3.2 Update the `scoreAndMatch` function signature to accept the seed star (or its RA/Dec) as a parameter; update all call sites in `runSeedSweep`
- [x] 3.3 Replace `normalise(rotate(flipped, rotDeg))` with a fixed-scale centering: centre the skeleton at origin (subtract 0.5 from each coordinate after y-flip), then scale by `SKELETON_FILL_RATIO * 2` so the longest axis spans `SKELETON_FILL_RATIO` in the patch-fraction frame
- [x] 3.4 Remove the now-unused star bounding box computation (starXs, starYs, starRange, starCx, starCy) from `scoreAndMatch`; replace the skeleton RA/Dec inverse transform with a version that uses the seed-anchored frame

## 4. Verify Unit Tests Pass

- [x] 4.1 Run `npm test` in `frontend/` — confirm all existing unit tests pass without modification (the `normalise()` function is still exported and unchanged)
- [x] 4.2 Check that `scoreAndMatch` integration behaviour in `matcher.test.ts` (if any) reflects the new frame; update test assertions if constants shift

## 5. Validate and Re-tune Constants

- [x] 5.1 Run the test harness: `npx tsx test-harness/run.ts --run-id v-after-norm`
- [x] 5.2 Run compare: `/test-constellations --compare v1 v-after-norm` — review which words improved, degraded, or stayed the same
- [x] 5.3 Adjust `DISTANCE_THRESHOLD` and `VERTEX_SIGMA` based on harness results; re-run until the after-run is not worse than the before-run in aggregate
- [x] 5.4 Once geometry constants are stable, assess whether `BRIGHTNESS_WEIGHT` needs adjustment in the new frame
- [x] 5.5 Record the final validated constants with a comment block explaining their physical meaning and how they were chosen
