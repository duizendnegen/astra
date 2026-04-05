## Context

The matcher sweeps bright seed stars, placing the skeleton at various vertex anchors and rotations,
and scores each placement. The current `vertex-penalty` score is:

```
score = (matched_stars / candidates) - penaltyWeight * (uncovered_vertices / total_vertices)
```

This rewards placing the skeleton over dense star regions, but does not penalise placing it over a
cluster — a tight group of stars near one arm of the skeleton can produce the same score as the same
number of stars spread across all arms. The winning placement is then passed to
`selectConstellationStars`, which runs greedy nearest-neighbour per vertex; it inherits the bad
placement and cannot fix structural misalignment.

The renderer has two paths for drawing lines: `skeleton` mode (draws between `skeletonPoints`, the
abstract placed skeleton) and `stars` mode (draws between `constellationStars` by vertex index).
`skeleton` mode is the default, which makes placement failures invisible — the lines always look
like the intended shape regardless of where stars actually are.

## Goals / Non-Goals

**Goals:**
- Replace the `vertex-penalty` scoring function with bidirectional Chamfer distance so the matcher
  rewards placements where stars span the full skeleton, not just any cluster
- Replace vertex-first greedy star selection with territory-based selection so `constellationStars`
  are geographically spread and correctly vertex-indexed for edge rendering
- Make `render_mode=stars` the default and fix its edge-index alignment with the new
  vertex-indexed `constellationStars`

**Non-Goals:**
- Continuous scale search, Procrustes/ICP fitting, graph topology matching, star chains along edges,
  EMD scoring — all deferred (see proposal Not In Scope)
- Changing the seed sweep strategy, seed magnitude cutoff, or patch radius expansion logic
- Changing `skeleton-shape` model behaviour

## Decisions

### D1: Bidirectional Chamfer replaces coverage-ratio in `vertex-penalty`

**Current problem:** `coverageRatio` counts stars near *any* edge, not whether the whole skeleton is
covered. The penalty term counts uncovered vertices but uses a weak fixed weight.

**New formula:**
```
forward[k]  = min distance from skeleton vertex k to nearest matched star
              (capped at chamferCap, default 1.0 in normalised units)
reverse[j]  = effective distance of matched star j from nearest skeleton edge
              (already computed during matching)

chamferScore = 1 / (1 + mean(forward) + mean(reverse))
```

`forward` penalises uncovered skeleton regions. `reverse` penalises outlier stars far from any
edge. Both direction averages are in the same normalised-frame units (fraction of `patchRadius`).

**Why Chamfer over alternatives:**
- EMD would be more principled but is O(n³) and hard to tune
- Quadrant-coverage scoring is too coarse for non-convex shapes
- Chamfer is differentiable-in-spirit, interpretable, and O(n·m)

**Threshold retuning:** The Chamfer score has a different range than the old `coverageRatio`.
`qualityThreshold` and `coverageThreshold` defaults will need empirical retuning against the test
harness after implementation. Initial guidance: expect the Chamfer score for a good placement to be
in the 0.4–0.7 range rather than 0.7–0.9.

**New config parameter:** `chamferCap` (default 1.0) caps the forward distance per vertex to
prevent a single completely uncovered vertex from collapsing the score to near-zero. Overridable
via `MatcherConfig`.

### D2: Territory-based star selection replaces vertex-first greedy NN

**Current problem:** Greedy NN visits vertices in endpoint-first order and claims the globally
nearest unclaimed star. Stars cluster in dense sky regions, so many vertices end up mapped to stars
in the same small area.

**New approach — skeleton territory allocation:**

1. Traverse skeleton edges by DFS from the highest-degree vertex (or first endpoint vertex), building
   a total arc-length parameterisation `[0, L]`.
2. For each skeleton vertex `v`, its territory is the arc-length interval `[t_prev, t_next]` — the
   midpoints between `v` and its adjacent vertices in the traversal. This is a skeleton Voronoi
   partition.
3. For each vertex, find the matched star with the lowest composite score
   (`dVtx + brightnessWeight * mag/MAX_MAG`) whose projection onto the DFS path falls within the
   territory interval. Claim that star.
4. If no matched star falls within the territory, fall back to the nearest unclaimed star globally
   (preserving the existing edge-fallback behaviour).
5. Output `constellationStars` in skeleton vertex index order, so `constellationStars[i]` is the
   star assigned to vertex `i`.

**Why territory over pure segment-budget:**
Pure equal-length segments ignore the graph structure. For a skeleton with a long shaft and short
branches, equal segments would over-sample the shaft. Territory allocation naturally gives more
stars to denser areas of the skeleton topology.

**Output stays vertex-indexed:** `constellationStars[i]` must be the star for vertex `i` for
the `render_mode=stars` edge renderer to work correctly.

### D3: `render_mode=stars` becomes the default

The URL parameter is already parsed. The change is:
- Default value changes from `'skeleton'` to `'stars'` in `main.ts`
- The `stars` draw path in `renderer.ts` uses `constellationStars[i] → constellationStars[j]` per
  edge. Currently this path may exist but was never the default; audit it for the index-out-of-bounds
  guard (skip edge if index ≥ constellationStars.length).
- The `?render_mode=skeleton` override remains for debugging.

## Risks / Trade-offs

**Chamfer threshold retuning** → Mitigation: run the test harness before/after and adjust
`qualityThreshold` to the value that best separates good from bad results. The `chamferCap`
parameter provides a knob for sensitivity.

**Territory allocation on cyclic graphs** → Mitigation: skeleton graphs for word shapes are
typically trees or near-trees. For any cycle, break it at the lightest edge before DFS. If territory
partition produces degenerate intervals (zero-length), fall back to greedy NN for that vertex.

**Render mode default change is user-visible** → The lines will now reflect actual star positions
rather than the ideal skeleton. If star selection is poor, the constellation shape looks worse than
before (but is honest). Fixing RC-1 and RC-2 first means shape quality should be better by the
time RC-3 is deployed. Recommend deploying all three fixes together.

## Open Questions

- Should `chamferCap` default to 1.0 (one patchRadius) or something derived from the skeleton span?
  A value of `skeletonFillRatio * 2 / skelNorm.length` (one inter-vertex distance) might be more
  adaptive.
- Should territory allocation be opt-in via a new `assignmentAlgorithm: 'territory'` value, or
  replace greedy unconditionally in `vertex-penalty`? Given the proposal replaces greedy, unconditional
  is cleaner, but keeping `'greedy'` as a fallback alias is low-cost insurance.
