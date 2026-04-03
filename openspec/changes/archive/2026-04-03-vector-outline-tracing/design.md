## Context

`lambda/src/svg-to-skeleton.ts` converts Phosphor SVG icons into skeleton point sets for constellation matching. The current pipeline concatenates all SVG subpath `d` attributes and samples points along every edge of every subpath. Phosphor icons are filled shapes: each visible line is a filled rectangle or curve, so the path encodes both the outer and inner contour of that fill. The result is a dense point cloud that traces both edges of every stroke — rendering as parallel double-lines in the constellation.

The fix is to compute the boolean union of all filled subpath polygons and extract only the outer boundary contour before running the existing RDP simplification.

## Goals / Non-Goals

**Goals:**
- Replace double-line point clouds with a single clean outer-boundary contour per icon
- Preserve the existing `svgToSkeleton` public API (no callsite changes)
- Keep the existing RDP simplification and 15–40 point target unchanged
- Invalidate stale caches (disk + DynamoDB) automatically via a cache key version bump

**Non-Goals:**
- Preserving hole/inner contours (sound holes, wheel hubs) — outer boundary only
- Changing the icon source library (Phosphor regular weight, unchanged)
- Altering the downstream matcher or renderer

## Decisions

### D1 — Library: `polygon-clipping`

**Chosen:** `polygon-clipping` (npm).

**Rationale:** Pure JS, no native bindings, ships TypeScript types, handles arbitrary polygon complexity including self-intersecting paths, and returns GeoJSON-style ring arrays making it easy to extract the outer boundary ring. The API is `union(...MultiPolygon[]) → MultiPolygon`.

**Alternatives considered:**
- `clipper-lib`: Mature C++ port, but requires integer coordinates (needs scaling) and has a less ergonomic JS API.
- Custom shoelace + winding filter (H2 from exploration): Cheaper but only removes whole subpaths; the main body subpath still encodes double edges within a single closed path.
- `paper.js`: Has path union but is browser-first and brings in a large dependency.

### D2 — Outer boundary extraction

After the union, `polygon-clipping` returns a `MultiPolygon`: an array of polygons, each with an outer ring (index 0) and optional hole rings (index 1+). We:
1. Take the polygon with the largest outer-ring area (handles edge cases where union produces multiple disjoint regions)
2. Use only its outer ring (index 0), discarding all holes

### D3 — Dense sampling before union

The current `samplePath` / `sampleCubic` functions are reused to generate a dense polygon per subpath (same curvature-weighted sampling). Each subpath's dense points become one input polygon to the union. This avoids introducing a separate Bezier-to-polygon library.

Arc segments (`A` command) are already approximated as straight lines in the parser — this remains acceptable since Phosphor rarely uses arcs.

### D4 — Cache key versioning

The skeleton cache key is currently `${svgHash}__${algorithmName}__${epsilon}`. Append a pipeline version suffix: `__outline-v1`. This forces cache misses for all existing entries without requiring cache flush operations.

The DynamoDB cache check in `skeleton.ts` uses the word as the key and returns stored skeletons directly — those entries will continue to be served until they naturally expire or are flushed. For the test harness, the disk cache dir can be pointed to a new directory.

### D5 — Edge derivation simplification

With a single closed outer contour, edge derivation becomes trivial: edges connect `[i, i+1]` for all points, plus `[last, 0]` to close the loop. The existing `deriveEdges` function (which maps simplified points back to subpath membership) is replaced by this simpler loop-closing approach.

## Risks / Trade-offs

- **Icons with genuinely separate parts** (e.g. dotted line, scattered elements) may union into one blob → Mitigation: acceptable trade-off given the outer-boundary-only goal; disconnected regions will still produce the largest-region contour.
- **`polygon-clipping` correctness on degenerate inputs** (self-intersecting paths, zero-area subpaths) → Mitigation: wrap union call in try/catch, fall back to the existing concatenated-path approach on error.
- **Performance**: Union of dense polygons (hundreds of points each) is O(n log n) — should be fast enough for a build-time index step, but adds latency if called at Lambda request time → Mitigation: skeleton generation happens at index build time; Lambda serves from cache.
- **DynamoDB stale entries**: Existing cached words will continue serving old (double-line) skeletons until cache is flushed → Mitigation: document a one-time cache flush as part of deployment.
