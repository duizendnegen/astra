## Why

When using Astra outdoors to find a custom constellation in the night sky, there's no reference context — the app shows your constellation and background stars, but nothing that connects it to the familiar patterns a stargazer already knows. Adding IAU constellation lines and named star labels gives users the navigational anchors they need to actually locate their constellation in the sky.

## What Changes

- New `features.ts` module parses runtime feature flags from URL params at boot, injectable in tests
- New `?show_lines=1` flag: renders IAU constellation stick figures as a faint overlay in the result view
- New `?show_stars=1` flag: renders labels for the ~20 most recognizable named stars visible in the result view
- New static data assets: `constellation-lines.json` (IAU stick figures for all 88 constellations) and inline named star data (~20 entries)
- Overlay rendering is culled to current FOV and drawn below the custom constellation layer
- Vitest unit tests covering all 4 flag combinations

## Capabilities

### New Capabilities

- `feature-flags`: Runtime feature flag system parsing URL params, with a clean injectable interface for tests
- `sky-orientation-overlays`: Rendering of IAU constellation stick figures and named star labels as optional overlays in the result view

### Modified Capabilities

- `constellation-rendering`: New overlay draw pass added (below custom constellation, above background stars); data loading extended for IAU lines

## Impact

- `frontend/src/renderer.ts`: New overlay draw functions
- `frontend/src/features.ts`: New module (created)
- `frontend/public/data/constellation-lines.json`: New static asset (~50KB gzipped)
- `frontend/src/__tests__/`: New test file for overlay flag combinations
- No API changes, no lambda changes, no infrastructure changes
