## Context

`svg-to-skeleton.ts` converts an SVG into a Skeleton (points + edges) used for constellation matching. Its current outline extraction step computes the boolean union of all sampled subpath polygons, then selects the largest resulting polygon. This works for Phosphor icons (1–2 large filled paths) but fails catastrophically for line-art SVGs: vtracer's polygon-mode output of a line drawing produces hundreds of thin disconnected polygons (one per stroke). These never merge under boolean union, so the extractor picks only the densest stroke cluster and discards the rest of the shape.

L4 LLM-generated SVGs are inconsistent — sometimes simple filled geometry, sometimes complex outlines — producing unpredictable skeleton quality. Making the fix universal (not a special case) avoids maintaining two code paths.

## Goals / Non-Goals

**Goals:**
- Replace boolean union + largest-polygon with concave hull over the full point cloud
- Capture body-scale concavities (wing gaps, tail notches, crescent inner curves)
- Smooth over stroke-scale noise (feather gaps, individual line-art stroke outlines)
- Work correctly for both filled-shape SVGs (Phosphor, L4 simple) and line-art SVGs (custom pipeline)
- Remove the `polygon-clipping` dependency
- Remain a transparent drop-in: no changes required at call sites

**Non-Goals:**
- Preprocessing SVGs before they reach this function (deferred)
- Capturing internal structural details beyond the silhouette (holes, inner contours)
- Per-source tuning — one `concavity` default serves all sources

## Decisions

### D1: Concave hull over the full point cloud (not union)

After all subpaths are sampled and normalised to [0,1], flatten all points into a single cloud and pass to `concaveman`. This replaces the three-step union → multipolygon → largest-polygon selection.

**Why `concaveman` over alpha-shapes or grid rasterisation:**
- `concaveman` is a well-tested pure-JS library (Mapbox), ~400 LOC, no native deps
- Alpha shapes require Delaunay triangulation (heavier implementation)
- Grid rasterisation adds quantisation error and complexity
- `concaveman`'s `concavity` parameter maps directly to our requirement: one scalar controls stroke-gap vs wing-gap sensitivity

**Why not convex hull:**
The wing gap in an eagle, the inner curve of a crescent, the space between spread fingers — these are load-bearing negative space that distinguishes shapes in constellation matching. Convex hull loses them.

### D2: Default `concavity` tuned to ~3.0

`concaveman(points, concavity, lengthThreshold)` — higher `concavity` = more convex. In normalised [0,1] space with 15–40 output points:

- Stroke-scale gaps (feather spacing): ~0.02–0.05 bounding-box units
- Body-scale concavities (wing gap): ~0.15–0.35 bounding-box units

A `concavity` of ~3.0 (with `lengthThreshold` of ~0) consistently bridges stroke-scale gaps while preserving body-scale negative space across the pilot word set. This is an empirical starting point — the `concavity` field in `SvgToSkeletonOptions` allows per-call override for tuning.

### D3: Cache key bumped to `outline-v2`

Union-based skeletons cached under `outline-v1` keys would be silently served as correct results. Bumping to `outline-v2` forces a cold recompute on first call. Disk cache files in `data/l5-cache/` are invalidated automatically since the key is embedded in the filename.

### D4: `extractOutlineContour` removed; `polygon-clipping` removed

The function and its dependency are dead code once the hull replaces the union. Removing both keeps the diff legible and the bundle smaller. The `concaveman` import replaces `polygon-clipping`.

### D5: RDP simplification remains unchanged

`concaveman` returns a polygon ring (closed point sequence). That ring is fed into the existing `simplifyToTarget` → `buildLoopEdges` pipeline unchanged. The hull is a new "contour source" but the downstream steps are identical.

## Risks / Trade-offs

**Hull degeneracy for very sparse SVGs** → Mitigation: `concaveman` requires ≥3 points; the existing `if (simplified.length < 3) return null` guard downstream handles degenerate output. Very sparse point clouds (e.g. a single-stroke SVG with 5 sampled points) produce a convex hull by default, which is acceptable.

**Concavity default may need tuning per word class** → Mitigation: `concavity` is exposed in `SvgToSkeletonOptions`; the vet server can accept a `?concavity=` query param for rapid visual iteration against the pilot set without code changes.

**Phosphor icon regressions** → Mitigation: For a simple filled polygon, the concave hull of the sampled boundary points is equivalent to (or tighter than) the polygon itself — behaviour is unchanged for well-formed filled shapes. Existing tests cover Phosphor cases and will catch regressions.

**Disk cache invalidation** → Cold start latency for the first request per word in the local dev server. Lambda has no persistent disk cache; DynamoDB cache (word-level) is unaffected since it stores the final skeleton, not the L5 intermediate.

## Migration Plan

1. Install `concaveman` in `lambda/`; remove `polygon-clipping`
2. Replace `extractOutlineContour` in `svg-to-skeleton.ts` with `concaveHullContour` wrapper
3. Bump cache key suffix to `outline-v2`
4. Add `concavity` option to `SvgToSkeletonOptions` (default 3.0)
5. Run existing test suite; add tests for line-art (multi-subpath disconnected) input
6. Delete `data/l5-cache/` entries ending in `outline-v1` (or let them expire naturally)
7. Manual vetting: run vet server against pilot word set, visually confirm eagle + other organics

Rollback: revert the single file change. No schema or API changes.
