## Why

Phosphor icons are filled shapes, not stroke paths. The SVG path for each visible line encodes both the outer and inner contour of a filled region, causing the constellation renderer to draw parallel double-lines for almost every icon (visually confirmed in rendered fixtures). This degrades match quality and aesthetics.

## What Changes

- Replace the dense-sample-everything approach in `svg-to-skeleton.ts` with vector outline tracing: sample each subpath into a polygon, compute the boolean union of all polygons, extract the single outer boundary, then run RDP simplification on that boundary.
- Add a polygon boolean-union library dependency to `lambda/package.json`.
- Discard hole/inner contours — only the outer boundary is kept.
- Invalidate existing skeleton caches (disk + DynamoDB) by updating cache key generation.

## Capabilities

### New Capabilities

- `svg-outline-extraction`: Given an SVG's set of filled subpaths, compute the boolean union and return only the outer boundary contour as the skeleton input.

### Modified Capabilities

- `svg-to-skeleton`: The skeleton generation pipeline changes its internal sampling strategy. The public `svgToSkeleton` API is unchanged, but the produced skeletons will differ (single clean contour instead of double-line point cloud).

## Impact

- `lambda/src/svg-to-skeleton.ts` — core pipeline rewrite
- `lambda/package.json` — new dependency (`polygon-clipping` or equivalent)
- Existing DynamoDB skeleton cache entries will be stale; cache key must change to force regeneration
- Existing disk cache entries in test harness will be stale; same fix applies
- Visual output improves: single-line constellations instead of double-line outlines
