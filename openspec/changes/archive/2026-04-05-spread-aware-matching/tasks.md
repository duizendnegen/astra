## Original plan (superseded)

The original proposal described bidirectional Chamfer scoring and territory-based star selection.
During implementation these were replaced by a fundamentally different approach. The tasks below
are preserved for history but were not the path taken.

- [~] 1.1–1.5 Bidirectional Chamfer scoring — **superseded** by edge-length ratio scoring
- [~] 2.1–2.5 Territory-based star selection — **superseded** by Hungarian assignment (territory
  code is present in `matcher.ts` but is not the primary path)
- [x] 3.1–3.3 `render_mode=stars` as default — **implemented** as originally specified

## Actual implementation

### 1. SpatialGrid (matcher.ts)

- [x] 1.1 Implement `SpatialGrid` class: 2°×2° cells, `Map<number, Star[]>` backing store,
      `key(ra, dec)` hash, `inRadius(ra, dec, radius)` multi-cell scan, `nearest(ra, dec, maxRadius, used)`,
      `hasStarNear(ra, dec)` O(1) single-cell check
- [x] 1.2 Construct one `SpatialGrid` per `match()` call and pass it into `pairwiseAnchorSearch`

### 2. Principal axis (matcher.ts)

- [x] 2.1 In `pairwiseAnchorSearch`, normalise skeleton points to ~[−0.5, 0.5], flip y for sky
      convention
- [x] 2.2 Find principal axis by all-pairs maximum distance (O(nVtx²), robust to any topology);
      return null for degenerate skeletons (maxAxisDist < 0.01)

### 3. Pairwise anchor search — Phase 1: cell-coverage prescreen (matcher.ts)

- [x] 3.1 For each anchor star A (mag ≤ `seedMaxMag`) and each neighbour B (mag ≤ 5.0, within
      25°), compute scale and rotation from the A→B vector aligned to the principal axis
- [x] 3.2 Fill reusable `buf` in-place (zero allocation in hot path); compute physical positions
      for all skeleton vertices
- [x] 3.3 Score = covered vertices / capped vertices using `hasStarNear` (O(1) per vertex)
- [x] 3.4 Maintain `prescreenTop` with batch-trim sort (sort only at 2×PRESCREEN_K, not per push),
      keep top 500

### 4. Pairwise anchor search — Phase 2: greedy edge-length score (matcher.ts)

- [x] 4.1 For top 500 candidates from Phase 1, run greedy NN per vertex (fixed 3° search radius)
- [x] 4.2 Score = `1 / (1 + mean(|starEdgeLen/skelEdgeLen − 1|))` over skeleton edges
- [x] 4.3 Keep top 50

### 5. Pairwise anchor search — Phase 3: Hungarian refinement (matcher.ts)

- [x] 5.1 For top 50 candidates, gather K-nearest stars per vertex (K=20, union across vertices,
      expand to 6° if fewer than K found)
- [x] 5.2 Build cost matrix (vertices × nearby stars): `distanceDeg + brightnessWeight × mag/6`
- [x] 5.3 Run Hungarian algorithm on cost matrix; assign one star per vertex
- [x] 5.4 Compute final edge-length ratio score on Hungarian assignment
- [x] 5.5 Track globally best result across all 20 candidates; return with `seed`, `skeletonRaDec`,
      `constellationStars`

### 6. Updated `match()` public API (matcher.ts)

- [x] 6.1 Construct `SpatialGrid` once; run `pairwiseAnchorSearch` per skeleton variant
- [x] 6.2 Select globally best variant across all skeletons by score
- [x] 6.3 Return `MatchResult` with `stars`, `constellationStars`, `edges`, `patchRA/Dec`,
      `skeletonPoints`, `variantIndex`

### 7. Render mode default (renderer.ts + features.ts)

- [x] 7.1 `renderMode` default changed to `'stars'` in `features.ts`
- [x] 7.2 `renderer.ts` draws lines between `constellationStars` positions in `stars` mode
- [x] 7.3 `?render_mode=skeleton` override still works for debugging
