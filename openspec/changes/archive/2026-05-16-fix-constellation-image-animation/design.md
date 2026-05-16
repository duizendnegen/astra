## Context

The constellation image overlay (`#svg-overlay`) is a `position: fixed` div covering the full viewport. When a result is shown, `setupSvgOverlay` computes the SVG's CSS transform once using `targetProj` (a projection for the final camera position), then schedules a delayed fade-in. During the `animateToResult` animation the canvas projection updates every frame, but the SVG transform does not — creating a positional gap between the image and the stars during the fade-in window. When returning to landing, `setConstellation(null)` removes matched stars from the canvas immediately, but `clearSvgOverlay(LANDING_ANIM_MS)` fades the SVG over 1500ms, leaving the image visible long after the stars are gone.

## Goals / Non-Goals

**Goals:**
- SVG transform tracks the live canvas projection on every animation frame during `animateToResult`
- SVG overlay clears in the same instant as `setConstellation(null)` on result panel close
- Minimal API surface change — `onFrame` is optional; all existing callers remain unaffected

**Non-Goals:**
- Changing the fade-in timing or opacity of the SVG overlay
- Animating the SVG transform during the return-to-landing transition (not needed; overlay clears instantly)
- Any backend or data-model changes

## Decisions

### Decision 1: Add `onFrame?: () => void` to `animateTo` / `animateToResult`

**Choice**: Thread a per-frame callback through the existing animation loop in `renderer.ts`.

`animateTo` currently accepts `onComplete`. Adding `onFrame?` keeps the same pattern. The callback is invoked inside the `step` function on every `requestAnimationFrame` tick, after `draw()`. `animateToResult` receives `onFrame?` as a fourth parameter and passes it through to `animateTo`.

**Alternatives considered**:
- *Export `setFrameCallback` setter*: avoids signature change but introduces mutable global state with messier lifecycle (caller must clear it manually).
- *Separate rAF loop in `main.ts` polling `getProjection()`*: decoupled but runs two rAF loops concurrently; timing drift possible.

### Decision 2: `clearSvgOverlay()` (instant) in `showLanding`

**Choice**: Replace `clearSvgOverlay(LANDING_ANIM_MS)` with `clearSvgOverlay()` (no duration argument → instant DOM removal).

`setConstellation(null)` already removes matched stars from the canvas at frame 0 of `showLanding`. The 1500ms CSS fade was designed to sync with a star fade that never happens. Instant dismissal is the correct match.

**Alternatives considered**:
- *Delay `setConstellation(null)` to after animation and keep 1500ms fade*: would restore the sync intent but requires the renderer to fade stars over 1500ms (more invasive; stars are `drawConstellation`'s responsibility, not `clearSvgOverlay`'s).
- *Short fade (~100ms)*: a compromise, but if stars are already gone there is nothing for the image to sync to — instant is cleaner.

### Decision 3: `updateSvgTransform` as the `onFrame` payload in `showResult`

**Choice**: `main.ts` passes `updateSvgTransform` as `onFrame` to `animateToResult`. `updateSvgTransform` already reads `getProjection()` (the live projection), computes the correct transform, and applies it without triggering a fade transition (`svgEl.style.transition = 'none'`). No new function needed.

## Risks / Trade-offs

- [Performance] Calling `computeSvgTransform` (including `getBBox()`) on every animation frame (~60 fps, 2000ms) adds ~120 `getBBox` calls per result transition. `getBBox()` can force layout; if the SVG is hidden (`display: none`) it would throw, but `updateSvgTransform` already guards against the `hidden` attribute. Risk is low given the SVG is a simple path element.
- [Visual] The `onFrame` callback fires after `draw()` but before the browser paints — both canvas and SVG update in the same frame, so there should be no visible one-frame lag between them.

## Migration Plan

No deployment steps required. Changes are frontend-only, shipped as a static asset bundle. No rollback strategy needed beyond reverting the commit.
