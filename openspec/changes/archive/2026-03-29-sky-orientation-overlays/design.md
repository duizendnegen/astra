## Context

Astra renders a custom constellation on a canvas using a D3 stereographic projection. The renderer draws background stars, optional constellation lines, and matched constellation stars in layered passes. There is currently no reference context to help a user locate their constellation in the actual night sky.

The result view uses a fixed ~25° FOV centred on the matched patch. At this scale, 1–3 traditional IAU constellations are typically partially or fully visible, making stick-figure overlays a natural navigational aid.

## Goals / Non-Goals

**Goals:**
- Render IAU constellation stick figures as an optional faint overlay in the result view
- Render named star labels for the ~20 most recognizable stars as an optional overlay
- Two independent runtime flags (`?show_lines=1`, `?show_stars=1`) controlling each overlay
- Clean injectable flag interface so Vitest tests can exercise all 4 flag combinations without touching the DOM
- Lazy-load IAU line data only when `show_lines` is active

**Non-Goals:**
- No settings UI or localStorage persistence (URL params only for now)
- No IAU boundary polygons (stick figures only)
- No full named-star catalog (20 hardcoded entries only)
- Overlays only shown in result view, not on the landing screen

## Decisions

### 1. Feature flags as a pure module (`features.ts`)

Parse `URLSearchParams` once at module load and export typed boolean constants. Tests pass a mock `URLSearchParams` via a factory function rather than mutating `window.location`.

**Alternative considered**: Vite `import.meta.env` build-time flags. Rejected — build-time flags require separate test configurations for each combination; runtime flags let the same test suite cover all paths by passing different params.

### 2. Lazy-load IAU line data

`constellation-lines.json` is only fetched when `show_lines=1`. The fetch is initiated in `main.ts` alongside the star catalogue load (parallel, not sequential) and passed into the renderer.

**Alternative considered**: Bundle inline. Rejected — ~50KB of line data penalises all users including those not using the flag. Lazy-loading keeps the default experience unaffected.

### 3. Named stars hardcoded inline

20 entries with `{name, ra, dec, mag}`. No separate fetch, no augmentation of `stars.json`.

**Alternative considered**: Augment `stars.json` with name fields. Rejected — stars.json is a large catalogue; adding names to a handful of entries creates a sparse, awkward structure. A small separate constant is simpler and more maintainable.

### 4. Overlay draw order

```
1. Background stars        (existing)
2. IAU constellation lines (new — faint grey, ~25% α)
3. Named star labels       (new — text, near dot)
4. Custom constellation    (existing — full opacity, blue)
5. Custom constellation stars (existing — white dots + glow)
```

IAU lines below the custom constellation so the user's result is always the visual focal point.

### 5. FOV culling for IAU lines

Each IAU constellation entry stores a bounding box (min/max RA, Dec). Before projecting line segments, skip any constellation whose bounding box does not overlap the current camera FOV. With 88 constellations and simple box tests, this is negligible overhead.

**Alternative considered**: Always project all segments and skip those that project to null. Simpler but wastes work and complicates the rendering loop.

## Risks / Trade-offs

- **IAU line data quality** → Source from Stellarium's `constellationship.fab` or an equivalent open dataset; verify RA/Dec values against a known reference before shipping.
- **Label collisions at small FOV** → Named star labels may overlap each other or constellation lines. Mitigation: render labels only for stars within the current FOV, and offset text by a fixed pixel amount from the star dot.
- **RA wrap-around in culling** → Constellations straddling RA=0/360 (e.g., Pisces) need special-case bounding box logic. Mitigation: store RA range as `[minRA, maxRA]` with a `wraps` boolean flag.

## Open Questions

- Should overlays be visible on shared/exported PNGs, or result-view only? (Currently scoped to result view only — export can be revisited later.)
