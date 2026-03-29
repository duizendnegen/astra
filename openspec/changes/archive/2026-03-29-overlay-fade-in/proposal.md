## Why

The sky-orientation overlays (IAU constellation stick figures and named star labels) appear abruptly when navigating to the result, breaking the smooth cinematic transition established by the camera animation fade-in. The overlays should feel like a natural part of the reveal, not an afterthought.

## What Changes

- IAU constellation lines and named star labels are tied into the existing `constellationAlpha` animation curve so they fade in alongside the custom constellation during the final 40% of the camera transition
- The draw-order contract in `sky-orientation-overlays` is preserved; both overlay layers remain below the custom constellation visually

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sky-orientation-overlays`: IAU lines and named-star labels now participate in the `constellationAlpha` fade-in defined by `camera-animation`, rather than appearing at full opacity immediately on render

## Impact

- `frontend/src/renderer.ts`: overlay draw calls need to read `constellationAlpha` and scale their opacity accordingly
- `frontend/src/features.ts`: if overlay visibility is gated here, the alpha value must be threaded through
- No new data fetching or URL flag changes; existing `show_lines` / `show_stars` behaviour is unchanged
