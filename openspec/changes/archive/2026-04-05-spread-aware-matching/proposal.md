## Why

The shape-to-constellation algorithm was producing results where matched stars clustered in one
region of the sky rather than spanning the target shape. The scoring function rewarded placing the
skeleton over any dense star patch — not over a patch whose geometry matched the skeleton.

Additionally, the renderer drew lines between abstract skeleton positions (`render_mode=skeleton`)
rather than actual star positions, masking how badly star positions disagreed with the shape.

## What Changed

- **Pairwise anchor search** replaces the old seed-sweep. For every pair of bright stars (A, B),
  the skeleton's principal axis is aligned to (A, B), automatically deriving scale and rotation.
  A three-phase prescreen (cell coverage → greedy NN → Hungarian) filters ~280K candidate
  placements down to the single best assignment.
- **Scale-invariant edge-length scoring** replaces the Chamfer density approach. Score is
  `1 / (1 + mean(|starEdgeLen/skelEdgeLen − 1|))` over all skeleton edges. This rewards placements
  where the proportions of the star graph match the proportions of the skeleton, regardless of
  absolute scale.
- **Hungarian assignment** for constellation star selection. After the anchor pair fixes the
  overall placement, the Hungarian algorithm finds the globally optimal assignment of candidate
  stars to skeleton vertices, minimising total positional + brightness cost.
- **SpatialGrid** (2° × 2° cells) for O(1) cell lookups and fast radius queries, making the
  full sky search tractable at ~87ms per word.
- **`render_mode=stars` promoted to default**. Lines are drawn between actual `constellationStars`
  positions. `?render_mode=skeleton` remains for debugging.

## Root Causes

### RC-1: Matcher score rewarded density, not geometry (primary)

The old Chamfer / coverage-ratio score measured how many stars fell within `distanceThreshold` of
any skeleton edge. A tight cluster of stars near one arm scored identically to the same number of
stars spread across all arms. The new edge-length ratio score is directly tied to shape geometry:
a placement only scores well if the proportions between connected stars match the proportions
between connected skeleton vertices.

### RC-2: Fixed scale and local search (primary)

The seed sweep searched only a fixed-radius patch (10°) around each bright seed, at a fixed scale
(`skeletonFillRatio × patchRadius`). This missed any constellation whose natural scale or
location didn't match. The pairwise anchor search covers the full sky at any scale from 2° to 25°.

### RC-3: Line rendering hid failures (secondary)

`render_mode=skeleton` drew the ideal skeleton in sky coordinates, not the actual star positions.
A visually correct skeleton rendering was meaningless feedback. Fixed by making `render_mode=stars`
the default.

## Not In Scope

The following were discussed and explicitly deferred:

- **Generator/scorer architecture** — pluggable `generator` + `scorer` config fields, new
  generators (`single-sweep`, `any-vertex`), Procrustes scoring (B2), vertex-fit scoring (A1),
  removal of star count caps. Tracked in the `matcher-pipeline` change.
- **Backend matcher migration** — moving `matcher.ts` to `lambda/src/` so the frontend and test
  harness share one implementation. Tracked in the `backend-matcher` change.
- **Chamfer bidirectional scoring** — explored and superseded by edge-length ratio scoring.
- **Territory-based star selection** — implemented and present in code but superseded as the
  primary path by Hungarian assignment.

## Capabilities

### Modified Capabilities

- `star-matching`: pairwise anchor search with principal axis alignment, three-phase prescreen,
  scale-invariant edge-length ratio scoring
- `constellation-star-selection`: Hungarian optimal assignment replaces greedy NN as primary path
- `constellation-rendering`: `render_mode=stars` is now the default

## Impact

- `frontend/src/matcher.ts` — complete rewrite of search strategy and scoring
- `frontend/src/renderer.ts` — default render mode changed to `stars`
- `frontend/src/features.ts` — `renderMode` default updated
