## Why

When a constellation is matched and displayed, the highlighted stars are unlabelled — users have no way to know which stars they're looking at. Adding star names grounds the result in real astronomy and makes the feature feel complete.

## What Changes

- New build script (`scripts/generate-star-names.ts`) processes the HYG database CSV to produce `frontend/public/data/star-names.json` — a `{ [hipId]: string }` lookup using proper names first, Bayer designations as fallback
- `Features.showStars` changes from `boolean` to `false | 'named' | 'constellation'`; `show_stars=constellation` activates the new mode
- `drawConstellation()` in `renderer.ts` renders a name label beside each matched constellation star when `showStars === 'constellation'`
- `frontend/src/catalogue.ts` gains a `loadStarNames()` function to fetch the new data file

## Capabilities

### New Capabilities

- `constellation-star-labels`: Labels on matched constellation stars using proper names (HYG `proper` column) with Bayer designation fallback, gated behind `show_stars=constellation`

### Modified Capabilities

- `feature-flags`: `showStars` flag extended from boolean to a three-value type (`false | 'named' | 'constellation'`)
- `constellation-rendering`: `drawConstellation()` now optionally renders star name labels alongside the existing glow/dot treatment

## Impact

- `scripts/generate-star-names.ts` — new one-time build script (Node/TypeScript)
- `frontend/public/data/star-names.json` — new static data asset, committed to repo
- `frontend/src/features.ts` — `showStars` type change
- `frontend/src/catalogue.ts` — new `loadStarNames()` loader
- `frontend/src/renderer.ts` — label rendering in `drawConstellation()`; `drawNamedStars()` guard updated to `=== 'named'`
- `frontend/src/main.ts` — passes star names map to renderer via `setOverlayData()` or equivalent
- No lambda changes; no API changes; no breaking changes to existing `show_stars=1` behaviour
