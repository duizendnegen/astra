## Context

The renderer maintains a single `animateTo` loop that interpolates `camera` (ra, dec, fov) each frame. `constellation` state is set synchronously before the loop starts, so dimming and overlay drawing activate at frame 0. The fix threads a second interpolated value — `constellationAlpha` — through the same loop.

## Goals / Non-Goals

**Goals:**
- Constellation lines, star dots, and background dimming fade in over the last 40% of the forward animation
- No visual change to the return transition
- `constellationAlpha` is internal to the renderer — callers (`main.ts`) need no changes

**Non-Goals:**
- No change to camera easing curve or duration
- No change to the return transition
- No per-element staggering (all constellation elements fade together)

## Decisions

### 1. `constellationAlpha` as renderer-local state

Add a module-level `constellationAlpha: number` (0–1) alongside `constellation`. `animateToResult` resets it to 0 before starting the loop; `animateToLanding` leaves it at 1 (or resets irrelevantly since constellation is cleared).

**Alternative considered**: Pass alpha as a parameter to `draw()` from the caller. Rejected — the caller has no business knowing about render-layer alpha; it's a pure presentation detail.

### 2. Delayed fade mapped from animation progress

Within `animateTo`'s step function, derive `constellationAlpha` from the eased progress `e`:

```
fadeStart = 0.60   // alpha begins at 60% of animation progress
constellationAlpha = clamp((e - fadeStart) / (1 - fadeStart), 0, 1)
```

`fadeStart` is only applied during `animateToResult` — pass it as a parameter to `animateTo` (defaulting to 0, meaning no delay for other callers).

**Alternative considered**: A separate `setTimeout`-based fade after the camera settles. Rejected — two independent timers are harder to keep in sync and produce a visible pause between camera stop and constellation appearance.

### 3. Alpha applied multiplicatively in draw functions

- `drawConstellation`: multiply `ctx.globalAlpha` by `constellationAlpha` for both line strokes and star dot fills
- `drawStars` distance-dimming: multiply `dimFactor` by `constellationAlpha` so background dimming fades in at the same rate as the constellation

## Risks / Trade-offs

- **`fadeStart` constant is a magic number** → Named constant `RESULT_FADE_START = 0.60` in renderer; easy to tune visually.
- **Eased progress vs linear progress for fade** → Using eased `e` (not raw `t`) means the fade is also eased, which should feel natural. If it feels too fast at the end, switch to raw `t` for the fade mapping only.
