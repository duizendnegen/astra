## Context

The skeleton extractor (`svg-to-skeleton.ts`) currently uses a single contour extraction strategy: concave hull via `concaveman`. This was introduced in `58d9b8b` to replace the polygon-union approach (`polygon-clipping`), which was itself introduced alongside the outline tracing rewrite.

The concave hull works well for line-art SVGs (e.g. LLM-generated paths, vtracer output) where the goal is to wrap disconnected strokes in a single silhouette. However, Phosphor icons are filled vector icons with multiple subpaths and even-odd fill rules — circles inside squares, letter counters, cutouts. For these, the concave hull fills in negative space and produces blobs that lose the icon's distinctive shape. The polygon-union approach correctly merges overlapping subpath polygons and resolves holes, yielding sharper contours.

`polygon-clipping` was not removed from the lambda dependencies; the package is still present.

## Goals / Non-Goals

**Goals:**
- Restore polygon-union skeleton quality for Phosphor icons
- Keep concave hull as the default for LLM-generated and phylopic SVGs
- Route the correct strategy at call sites where `source` is known

**Non-Goals:**
- Changing the skeleton pipeline for user-drawn input (L4 path uses LLM SVG — concave hull stays)
- Phylopic-specific tuning (not used in practice)
- Removing concave hull support

## Decisions

### Decision: `strategy` option on `SvgToSkeletonOptions`

Add `strategy?: 'concave-hull' | 'polygon-union'` defaulting to `'concave-hull'`. The caller chooses; the function does not auto-detect by SVG content.

**Alternatives considered:**
- *Auto-detect by viewBox `0 0 256 256`*: Would work for current Phosphor icons but is fragile — other 256×256 SVGs would be mis-routed, and future icon sets at different sizes would be missed.
- *Always use polygon-union*: Regresses line-art / LLM path quality. The two strategies serve genuinely different input types.

### Decision: Restore `extractOutlineContour` in `svg-to-skeleton.ts`

The polygon-union function is restored alongside `concaveHullContour`. Step 3 branches on `strategy`. Both functions are exported so they can be tested independently.

### Decision: Cache key includes strategy token

Current key: `${hash}__${algorithmName}__${epsilon}__${concavity}__outline-v2`

New key: `${hash}__${algorithmName}__${epsilon}__${strategy}__outline-v3`

The suffix bumps to `outline-v3` to bust any stale `outline-v2` disk cache entries. `concavity` is dropped from the key when strategy is `polygon-union` (it has no effect there), but for simplicity the key always includes strategy and concavity, so all permutations are unique.

### Decision: Source routing in `svgToSkeletonWithOpts`

`svgToSkeletonWithOpts(svgOrPath, source?)` — optional second argument. When `source === 'phosphor'`, passes `strategy: 'polygon-union'`. All other sources (including undefined) retain `strategy: 'concave-hull'`.

Call sites in `retrieval.ts` that already hold `best.entry.source` pass it through. The L4 path (LLM SVG) does not pass a source, so it naturally gets concave hull.

## Risks / Trade-offs

- [Disk cache invalidation] Any existing `outline-v2` disk cache in `data/l5-cache/` will be ignored after the key bumps to `outline-v3`. The cache is a dev-time optimisation only; this is a minor inconvenience, not a production risk.
- [polygon-clipping correctness] The restored function is identical to the one removed in `58d9b8b`. If that commit removed it for a correctness reason (not documented), that reason may resurface. Mitigation: test against a representative sample of Phosphor icons before merging.
