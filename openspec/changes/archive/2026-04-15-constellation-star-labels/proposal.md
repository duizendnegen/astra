## Why

When a constellation is matched and displayed, the highlighted stars are unlabelled — users have no way to know which stars they're looking at. Adding star names grounds the result in real astronomy and makes the feature feel complete.

## What Changes

**Phase 1 — Star name data and rendering (complete)**
- New build script (`scripts/generate-star-names.ts`) processes the HYG database CSV to produce `frontend/public/data/star-names.json` — a `{ [hipId]: string }` lookup using proper names first, Bayer designations as fallback
- `drawConstellation()` in `renderer.ts` renders a name label beside each matched constellation star when `showStarLabels` is on
- `frontend/src/catalogue.ts` gains a `loadStarNames()` function to fetch the new data file

**Phase 2 — Settings panel wiring and URL cleanup**
- `Features.showStars: false | 'named' | 'constellation'` removed; replaced with `showStarLabels: boolean` as the sole label toggle
- `drawNamedStars()` and the `'named'` branch removed from `renderer.ts` (dead code — no UI ever set it)
- `feature-star-labels` checkbox in the settings panel enabled and wired to `showStarLabels`
- `star-names.json` loaded lazily on first checkbox toggle-on (cached); also loaded eagerly at boot if `showStarLabels` is already persisted as `true` in localStorage
- Vestigial `show_stars` / `show_lines` URL param preservation removed from `share.ts:buildShareUrl`

## Capabilities

### New Capabilities

- `constellation-star-labels`: Labels on matched constellation stars using proper names (HYG `proper` column) with Bayer designation fallback, toggled via the settings panel "Star labels" checkbox

### Modified Capabilities

- `feature-flags`: `showStars` removed; `showStarLabels: boolean` is now the canonical flag (was already in the `Features` interface as a placeholder)
- `constellation-rendering`: `drawConstellation()` gates labels on `features.showStarLabels`; `drawNamedStars()` removed
- `settings-panel`: "Star labels" checkbox is now active (was `disabled`)

### Removed Capabilities

- `show_stars` / `show_lines` URL param forwarding in `buildShareUrl` — never consumed by `main.ts`

## Impact

- `scripts/generate-star-names.ts` — one-time build script (complete)
- `frontend/public/data/star-names.json` — static data asset (complete)
- `frontend/src/features.ts` — remove `showStars`, keep `showStarLabels: boolean`
- `frontend/src/catalogue.ts` — `loadStarNames()` loader (complete)
- `frontend/src/renderer.ts` — gate labels on `showStarLabels`; remove `drawNamedStars()`
- `frontend/src/main.ts` — wire checkbox; lazy-load `star-names.json` on toggle
- `frontend/index.html` — remove `disabled` from `feature-star-labels` checkbox
- `frontend/src/share.ts` — remove `show_stars` / `show_lines` forwarding
- `frontend/src/__tests__/share.test.ts` — remove two URL-param test cases
- No lambda changes; no API changes
