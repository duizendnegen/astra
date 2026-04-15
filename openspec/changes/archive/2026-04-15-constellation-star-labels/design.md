## Context

The star catalogue (`frontend/public/data/stars.json`) contains 5068 stars identified by HIP (Hipparcos) catalog IDs, with fields `{ id, ra, dec, mag }` — no names. When a constellation is matched, `constellationStars` are the highlighted vertices. Currently these render with glow and brightness but no label, leaving users unable to identify which real stars they're looking at.

The HYG Star Database (astronexus/HYGDatabase) maps HIP IDs to proper names (`proper` column) and Bayer-Flamsteed designations (`bf` column, e.g. `"21Alp Ori"`). Bayer coverage is ~1500 stars; proper names ~336 IAU-approved entries. Constellation pattern stars are drawn from the prominent stars in each constellation, which are exactly those covered by Bayer.

## Goals / Non-Goals

**Goals:**
- Label each matched constellation star with its proper name (if one exists) or Bayer designation
- Gate the feature behind `show_stars=constellation` URL param
- Preserve existing `show_stars=1` behaviour unchanged
- Keep the name data out of the lambda / star catalogue — frontend-only concern

**Non-Goals:**
- Labelling background or on-pattern-context stars
- Overlap avoidance for dense label clusters
- Internationalisation of star names
- Dynamic fetching of HYG data at runtime

## Decisions

### D1: Separate `star-names.json` rather than extending `stars.json`

Star names are a display concern only; the lambda never needs them. Embedding names in `stars.json` would add ~30–50 bytes per named star across 5068 entries, bloat the payload for the 99% of stars that are unnamed, and require updating the `Star` type in shared types used by the lambda.

A separate `frontend/public/data/star-names.json` with shape `{ [hipId: string]: string }` is fetched once by the frontend alongside the catalogue. It contains only the ~1500 entries that have a name, keeping it small (~40 KB uncompressed).

**Alternative considered**: Embed names in the star catalogue. Rejected — crosses the frontend/lambda boundary for no benefit.

### D2: Build script over manual curation

The HYG database is authoritative and machine-readable. A one-time `scripts/generate-star-names.ts` script reads the CSV, filters to HIP IDs present in `stars.json`, and writes `star-names.json`. This is reproducible and covers all 1500+ Bayer stars automatically.

Greek letter abbreviations in the `bf` column (`Alp`, `Bet`, `Gam`, ...) are mapped to Unicode characters (`α`, `β`, `γ`, ...) by a small lookup table in the script.

**Alternative considered**: Hand-curate a JSON of ~50 well-known stars. Rejected — gaps would be noticeable for less-famous constellations.

### D3 (revised): Use `showStarLabels: boolean` — remove `showStars`

`showStarLabels: boolean` was already added to `Features` as the settings-panel placeholder. `showStars: false | 'named' | 'constellation'` is now dead: the `'named'` mode had no UI entry point and the `'constellation'` mode is superseded by `showStarLabels`. Keeping both creates a confusing split source of truth.

`showStars` is removed from `Features`; `renderer.ts` switches from `features.showStars === 'constellation'` to `features.showStarLabels`. `drawNamedStars()` is deleted.

**Alternative considered**: Map the settings checkbox to `showStars === 'constellation'`. Rejected — `showStarLabels` is already in the localStorage schema and settings-panel spec; renaming would require a data migration.

### D5: Lazy-load `star-names.json` on first toggle-on; eager if already persisted

`star-names.json` is ~3 KB. Loading it eagerly at boot for every user wastes bandwidth when most users never enable star labels. The first toggle-on triggers `loadStarNames()`, the result is cached in a module-scoped variable, and `setOverlayData` is called with the map. If `loadFeatures()` returns `showStarLabels: true` (returning user), boot loads the file eagerly to avoid a blank-label flash on initial render.

**Alternative considered**: Always fetch at boot. Rejected — unnecessary bandwidth cost for the default (off) state.

### D6: Remove `show_stars` / `show_lines` URL param forwarding

`share.ts:buildShareUrl` preserved `show_stars` and `show_lines` into share links, but `main.ts:boot()` never read them (only `?c=` is consumed). They were vestigial after the localStorage migration and are now removed entirely. Existing share links that happen to contain these params will silently ignore them — no UX impact.

### D4: Labels rendered in `drawConstellation()`, not a new draw pass

Constellation star positions are already projected in `drawConstellation()`. Adding label rendering there avoids a second projection loop and keeps all constellation-star drawing logic in one place. Labels are drawn after dots/glows so they render on top.

## Risks / Trade-offs

- **Label overlap** → No mitigation in this change. Dense constellations (Orion, Scorpius) may have overlapping labels at some zoom levels. Acceptable for now; overlap avoidance can be added later.
- **HYG data source availability** → The CSV must be downloaded manually or via the build script before running `generate-star-names.ts`. Document in script header. The output `star-names.json` is committed, so runtime has no dependency.
- **`showStars` type change** → Any code doing `if (features.showStars)` will still work for `'named'` and `'constellation'` (both truthy), but intent may be wrong. Audit all call sites — currently just `drawNamedStars()` in renderer.ts.
