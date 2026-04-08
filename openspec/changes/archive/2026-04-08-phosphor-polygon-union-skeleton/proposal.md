## Why

The concave hull skeleton extraction introduced in `58d9b8b` produces poor skeletons for Phosphor icons: because Phosphor icons use multiple subpaths with even-odd fill rules (circles inside squares, letter counters, cutouts), the concave hull fills in the holes and produces blobbier, less distinctive shapes. The previous polygon-union approach correctly merges overlapping shapes and resolves holes, giving sharper, more accurate outlines for this icon set.

## What Changes

- Add a `strategy` option to `SvgToSkeletonOptions` selecting between `'concave-hull'` (current default, kept for LLM/phylopic SVGs) and `'polygon-union'` (restored old behaviour for Phosphor).
- Restore the `extractOutlineContour` polygon-union function (removed in `58d9b8b`) alongside the existing `concaveHullContour` function.
- Update the skeleton cache key to include the strategy, so both variants can coexist without collisions.
- Route Phosphor icons to `polygon-union` at the `svgToSkeletonWithOpts` call sites in `retrieval.ts` by passing the known `source` field.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `svg-outline-extraction`: Add `polygon-union` as a second supported contour extraction strategy alongside the existing concave hull. Each strategy has defined applicability (filled vector icons vs. line-art / LLM output).
- `svg-to-skeleton`: Add `strategy` option; update cache key contract to include strategy token; document source-aware routing.

## Impact

- `lambda/src/svg-to-skeleton.ts`: restore polygon-union function, add strategy branching, update cache key
- `lambda/src/retrieval.ts`: `svgToSkeletonWithOpts` accepts optional `source`, passes strategy
- `lambda/node_modules`: `polygon-clipping` dependency must still be present (it was not removed)
- No schema changes, no API changes
