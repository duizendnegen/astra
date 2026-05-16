## Why

The constellation image overlay has two animation sync bugs: during fade-in it sits at a fixed screen position (the final camera destination) while the stars are still animating toward it, and when the result panel is closed it lingers for 1500ms while the matched stars vanish instantly. Both bugs break the visual coherence between the canvas and the SVG overlay.

## What Changes

- The SVG overlay transform is recalculated every animation frame during `animateToResult`, keeping the image positioned at the constellation's actual current screen location as the camera pans and zooms in.
- The SVG overlay clears immediately when the result panel closes, matching the instant disappearance of the matched stars (which are removed by `setConstellation(null)` before any animation begins).
- `animateTo` and `animateToResult` in `renderer.ts` gain an optional `onFrame` callback invoked each frame, used by `main.ts` to drive the per-frame transform update.

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `svg-source-overlay`: Two requirement corrections — (1) transform must track the live projection each frame during the result animation, not the pre-computed target projection; (2) overlay must clear immediately on result panel close, not fade over the landing animation duration.

## Impact

- `frontend/src/renderer.ts`: `animateTo` signature gains `onFrame?: () => void`; `animateToResult` threads it through.
- `frontend/src/main.ts`: `animateToResult` call gains `updateSvgTransform` as `onFrame`; `clearSvgOverlay(LANDING_ANIM_MS)` becomes `clearSvgOverlay()` (instant).
- No backend changes. No new dependencies. No breaking changes to other callers of `animateTo`.
