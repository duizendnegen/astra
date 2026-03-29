## Why

The landing-to-result transition feels abrupt because `setConstellation` is called before the camera starts moving, causing background stars to snap-dim and constellation lines to appear instantly at frame 0. The intended behaviour — constellation appears after the camera settles — is already specified in `camera-animation` but not correctly implemented. This change fixes that gap and refines the appearance to a cinematic delayed fade.

## What Changes

- `setConstellation` continues to be called before the animation, but its visual effect is now gated by a `constellationAlpha` value that starts at 0
- `constellationAlpha` is interpolated from 0→1 during the **last 40%** of the forward animation — camera flies to the region first, constellation materialises on arrival
- Background star distance-dimming is also tied to `constellationAlpha` — it fades in with the constellation rather than snapping on at frame 0
- Constellation line and star dot rendering are multiplied by `constellationAlpha` each frame
- The return transition (`animateToLanding`) is unchanged — it already feels correct

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `camera-animation`: The requirement "Constellation renders after camera settles" is updated — instead of a hard cut after animation completes, the constellation fades in over the last 40% of the transition duration

## Impact

- `frontend/src/renderer.ts`: `constellationAlpha` state variable, interpolation logic in `animateTo`, alpha applied in `drawStars` and `drawConstellation`
- No changes to `main.ts`, lambda, or infrastructure
