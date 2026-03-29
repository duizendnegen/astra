## 1. Data Assets

- [x] 1.1 Source IAU constellation line data (RA/Dec pairs per constellation) from an open dataset (e.g. Stellarium `constellationship.fab` or equivalent)
- [x] 1.2 Convert to `constellation-lines.json` format: `[{name, bbox: {minRA, maxRA, minDec, maxDec, wraps}, lines: [[ra,dec],[ra,dec],...]}, ...]` and place at `frontend/public/data/constellation-lines.json`
- [x] 1.3 Define inline named stars constant (20 entries) with `{name, ra, dec, mag}` in source

## 2. Feature Flags Module

- [x] 2.1 Create `frontend/src/features.ts` exporting `getFeatures(params: URLSearchParams): Features` where `Features = { showLines: boolean; showStars: boolean }`
- [x] 2.2 Wire up `getFeatures` in `main.ts` at boot, passing `new URLSearchParams(window.location.search)`

## 3. Data Loading

- [x] 3.1 Add `loadConstellationLines(): Promise<ConstellationLines[]>` to `catalogue.ts` (or a new `overlays.ts`), fetching lazily only when called
- [x] 3.2 In `main.ts` boot sequence, conditionally fetch constellation lines in parallel with star catalogue when `showLines` is true

## 4. Overlay Rendering

- [x] 4.1 Add `ConstellationLines` type to `types.ts`
- [x] 4.2 Implement `drawIAULines(lines: ConstellationLines[], camera: CameraState)` in renderer — muted grey, ~25% alpha, FOV-culled via bounding box
- [x] 4.3 Implement `drawNamedStars(namedStars: NamedStar[], features: Features)` in renderer — small text label offset from star dot, skip stars projecting outside canvas bounds
- [x] 4.4 Update `draw()` in renderer to call overlay passes in correct order: background stars → IAU lines → named star labels → custom constellation lines → custom constellation stars
- [x] 4.5 Thread `features` and `constellationLines` through renderer's public API (`init` or `setOverlayData`)

## 5. Tests

- [x] 5.1 Add `frontend/src/__tests__/features.test.ts` — test all 4 `URLSearchParams` combinations for `getFeatures`
- [x] 5.2 Add overlay rendering tests covering all 4 flag combinations: verify correct draw functions are called (or not) based on flags
- [x] 5.3 Add FOV culling unit test: constellation whose bbox does not intersect FOV is skipped; one that does is rendered
