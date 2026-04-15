## Why

The `excludeSeeds` cross-request mechanism adds frontend/backend coupling with minimal user-facing benefit. At the same time, three new debug/UX features (SVG source overlay, retrieval trail, star labels) need a proper settings surface — currently impossible since all flags are URL params.

## What Changes

- **BREAKING** Remove `excludeSeeds` from the `/api/constellation` request body and all backend matching code; repeated searches on the same word may return the same constellation.
- Replace URL-param feature flags with a settings panel (gear icon, landing screen only) backed by `localStorage`.
- Add "constellation image" feature: inline the matched SVG in the DOM, transformed via CSS to align with the constellation's position, scale, and Procrustes rotation on the canvas.
- Add "association" feature: extend `MatchProvenance` with a `trail` array recording each L3 candidate attempted and its outcome; display the trail below RA/Dec in the result panel.
- Add "star labels" as a disabled/greyed-out toggle in the settings panel (implementation deferred to another branch).
- Return the Procrustes rotation matrix from the backend alongside the constellation response so the frontend can orient the SVG overlay precisely.

## Capabilities

### New Capabilities

- `settings-panel`: Gear icon on the landing screen that opens a localStorage-backed toggles panel for `constellation-image`, `association`, and `star-labels` (disabled) features.
- `svg-source-overlay`: Inline SVG element positioned, rotated, and scaled via CSS transform to align with the matched constellation on the canvas, using the Procrustes rotation matrix from the backend.
- `retrieval-trail`: Backend collects and returns L3 synonym candidates with per-candidate hit/miss outcomes in `MatchProvenance.trail`; frontend renders the trail below RA/Dec when the association feature is enabled.

### Modified Capabilities

- `feature-flags`: Feature flags move from URL params to a `localStorage`-backed store driven by the settings panel; `getFeatures(URLSearchParams)` is replaced by a `loadFeatures()` / `saveFeatures()` API.
- `constellation-api`: Remove `excludeSeeds` request field and the corresponding cache-bypass logic; add Procrustes rotation matrix to the response.
- `retrieval-pipeline`: L3 candidate loop collects a `TrailEntry[]` (candidate, tried, hitId?, sim?) and attaches it to `MatchProvenance` instead of only logging it.

## Impact

- **Frontend**: `main.ts` (remove `usedPatches`, POST body change, Procrustes rotation consumer), `features.ts` (new `loadFeatures`/`saveFeatures` API), `index.html` (gear icon + settings panel + SVG element + association panel), `style.css` (new UI elements), new `settings.ts` module.
- **Backend `lambda/`**: `skeleton.ts` + `local.ts` (remove `excludeSeeds` parsing and cache bypass; add rotation matrix to response), `matcher.ts` (remove `excludeSeeds` parameter end-to-end from `match()` and three search functions), `retrieval.ts` (collect trail in `l3Task`), `types.ts` (extend `MatchProvenance` with `trail` and add rotation fields).
- **No new dependencies** — inline SVG, CSS transforms, `localStorage` are all native browser APIs.
