## 1. Renderer State

- [x] 1.1 Add `constellationAlpha: number` module-level variable to `renderer.ts`, initialised to 1
- [x] 1.2 Add `RESULT_FADE_START = 0.60` named constant to `renderer.ts`

## 2. Animation Loop

- [x] 2.1 Add optional `fadeStart?: number` parameter to `animateTo` (default `0` — no delay for other callers)
- [x] 2.2 In the `step` function, compute `constellationAlpha = clamp((e - fadeStart) / (1 - fadeStart), 0, 1)` when `fadeStart > 0`, else leave at 1
- [x] 2.3 Update `animateToResult` to reset `constellationAlpha = 0` before calling `animateTo`, passing `fadeStart: RESULT_FADE_START`

## 3. Draw Functions

- [x] 3.1 In `drawConstellation`, multiply `ctx.globalAlpha` by `constellationAlpha` for line strokes and star dot/glow fills
- [x] 3.2 In `drawStars`, multiply the distance `dimFactor` by `constellationAlpha` so background dimming fades in at the same rate

## 4. Tests

- [x] 4.1 Add unit test: `constellationAlpha` is 0 at animation start and 1 at animation end for `animateToResult`
- [x] 4.2 Add unit test: `constellationAlpha` remains 0 until 60% of eased progress, then interpolates to 1
- [x] 4.3 Add unit test: `animateToLanding` leaves `constellationAlpha` unaffected (return transition unchanged)
