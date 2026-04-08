## Why

The current skeleton extractor uses boolean union of subpath polygons then picks the largest resulting region — an approach designed for Phosphor-style filled icons with 1–2 solid paths. Line-art SVGs (from the custom pipeline's vtracer traces, and inconsistently from L4 LLM generation) produce hundreds of thin disconnected polygons per word; the union never merges them, so the extractor silently discards all but the densest stroke cluster and produces a skeleton that bears no relation to the word's silhouette. Replacing the union step with a concave hull over the full point cloud fixes this universally for all SVG sources.

## What Changes

- `svg-to-skeleton.ts`: The outline extraction step (currently `extractOutlineContour` / `polygon-clipping` union) is replaced with concave hull computation over the flattened point cloud of all sampled subpaths. The `polygon-clipping` dependency is removed.
- New tunable `concavity` parameter added to `SvgToSkeletonOptions` — controls the scale at which concavities are captured. Default tuned to capture body-scale negative space (wing gaps, tail notches, crescent inner curves) while smoothing over stroke-scale noise (feather gaps, individual line-art strokes).
- Cache key suffix updated from `outline-v1` to `outline-v2` to invalidate stale union-based cached skeletons.
- Specs updated: `svg-outline-extraction` (requirement replaced) and `svg-to-skeleton` (pipeline step updated, new option documented).

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `svg-outline-extraction`: Boolean union + largest-polygon extraction is replaced by concave hull of the full sampled point cloud. New requirement: captures body-scale concavities; smooths stroke-scale noise via the `concavity` parameter.
- `svg-to-skeleton`: Outline extraction step updated to match new hull approach; `concavity` option added to the public API.

## Impact

- `lambda/src/svg-to-skeleton.ts` — core logic change; `extractOutlineContour` function removed
- `lambda/src/retrieval.ts` — no caller changes needed; `svgToSkeleton` signature is backward-compatible
- `scripts/custom-pipeline/03-vet-server.ts` — no changes needed; picks up fix automatically
- `polygon-clipping` removed from `lambda/` dependencies
- `concaveman` added to `lambda/` dependencies
- All existing L5 disk-cached skeletons invalidated (cache key `outline-v1` → `outline-v2`)
