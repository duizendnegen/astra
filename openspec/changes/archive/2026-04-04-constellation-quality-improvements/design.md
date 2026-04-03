## Context

The Astra constellation pipeline has two stages relevant to this change: (1) the frontend matcher (`frontend/src/matcher.ts`) sweeps seed stars and scores how well each skeleton fits a patch of real stars; (2) the renderer draws lines between ideal skeleton positions and star dots at actual star positions — two separate overlays. Skeletons are pre-cached JSON (points + edges) fetched from the backend; this change does not touch skeleton generation.

Visual inspection of five test words revealed several failure modes in the matcher:
- **Edge-hugging**: stars match edge midpoints, not vertices → wobbly shape
- **Spatial drift**: star dots displaced up to 1.5° from skeleton lines → floating stars
- **Seed centering**: skeleton is always centered on the seed star rather than anchored at a vertex → systematic offset
- **Coarse rotation**: 30° steps leave shapes 15° misaligned
- **Point-to-vertex greediness**: the current scoring assigns stars independently to the nearest skeleton vertex; no information about the skeleton's global edge structure is used — a good individual-vertex match can still produce a bad overall shape

The 42-word test harness (`test-harness/`) runs the matcher against cached skeleton fixtures and produces side-by-side HTML comparison reports. All experiments use this harness as ground truth.

## Goals / Non-Goals

**Goals:**
- Each experiment produces a harness run that can be compared to a numbered baseline
- Interventions are isolated: one variable changes per experiment
- Seed placement fix lands unconditionally (correctness, not experiment)
- High-signal hypotheses (H2–H6) are implemented and evaluated before proceeding to B/C series

**Non-Goals:**
- Changing the skeleton generation pipeline (LLM prompts, `lambda/src/core.ts`)
- Subjective UI polish (font, colours, animation timing)
- Changing the star catalogue or projection math
- Modifying the share-link or PNG export formats
- Deploying LLM skeleton changes to production cache

## Decisions

### D1 — Seed placement: vertex anchoring

**Decision**: In `runSeedSweep`, for each seed star try anchoring the skeleton at each of its N vertices (not just the centroid). Keep the best-scoring (vertex, rotation) pair.

**Rationale**: The centroid anchor is wrong by definition — real constellations are anchored at a prominent star that coincides with a shape vertex (e.g., Betelgeuse = Orion's shoulder). Trying all vertices multiplies iteration count by `numVertices` (8–15×) but this is acceptable since it runs in the browser against a few hundred seeds.

**Alternative considered**: Anchoring at the centroid of the convex hull. Rejected — still not at a vertex.

---

### D3 — Vertex bonus retuning (H2)

**Decision**: Raise `vertexBonusEndpoint` from 0.6 to a sweep value (2.0, 3.0, 4.0) and run the harness at each. Pick the value that maximises green count without introducing regressions on words that currently score well.

**Rationale**: `effectiveDist = dSeg * (1 - bonus)`. At bonus=0.6 a star exactly at a vertex has its distance reduced 60%. At bonus=2.0 the factor becomes (1-2.0)=-1.0 which makes effective distance negative (i.e., the star is strongly pulled toward the vertex). Needs capping at 0 so effective distance can't go below zero: `Math.max(0, dSeg * (1 - bonus))`.

**Implementation note**: The `(1 - bonus)` formula breaks when bonus > 1. Change to: `effectiveDist = Math.max(0, dSeg - bonus * gaussian(dVtx))` — a subtractive Gaussian reward centred on each vertex.

---

### D4 — Missing vertex penalty model (H3)

**Decision**: New model name `vertex-penalty`. Score = `coverageRatio - penaltyWeight * uncoveredVertexFraction` where `uncoveredVertexFraction = vertices with no matched star within distanceThreshold / total vertices`. Default `penaltyWeight = 0.3` (tunable via CLI).

**Rationale**: Current score never decreases for missing vertices. Adding this penalty forces the search to prefer patches where all skeleton vertices have a nearby star, not just patches with high overall star density.

**Alternative considered**: A multiplicative penalty `coverageRatio * (1 - uncoveredVertexFraction)`. May be too aggressive; additive penalty is easier to reason about.

---

### D5 — 24 rotation steps (H4)

**Decision**: Test with `--rotationSteps 24` CLI override. No code change required — the flag already threads through `MatcherConfig`.

---

### D6 — Render mode param (H5)

**Decision**: Parse `?render_mode=stars` from `window.location.search` in `main.ts`. Pass a `renderMode: 'skeleton' | 'stars'` flag to the renderer. In `drawConstellation`, when `renderMode === 'stars'`, draw lines between consecutive `constellationStars` positions (using the same `edges` index array but indexing into `starPositions` instead of `skelPositions`).

**Rationale**: The current split (lines=skeleton, dots=stars) means lines and dots are never at the same coordinates. Connecting the actual stars is how traditional constellation maps work.

**Note**: This is a visual experiment. The harness thumbnails use the renderer — to compare render modes, two harness runs with different `renderMode` flags need to be run and the HTML compared visually.

---

### D8 — Fixture set strategy (immutable named snapshots)

Fixture directories are **never overwritten or deleted**. Each experiment creates a new named fixture directory:

```
test-harness/fixtures/               ← baseline (never touched after initial population)
test-harness/fixtures-h2/            ← H2: vertex bonus sweep
test-harness/fixtures-h3/            ← H3: vertex-penalty model
test-harness/fixtures-h6/            ← H6: skeleton-shape model
```

The harness CLI gains a `--fixtures-dir <name>` flag (default: `fixtures`). The chosen fixtures dir is recorded in `results.json` under `fixturesDir` so a past run is always reproducible.

`--compare` reads PNGs from the frozen `reports/<id>/` directories and does not need fixture dirs at compare time, so comparison always works regardless of which fixture dir each run used.

---

### D9 — Skeleton-level shape matching (H6)

**Decision**: New model name `skeleton-shape`. Rather than scoring how close individual stars are to individual skeleton vertices (point-to-vertex), the model scores how well the **star-to-star edge structure** in the patch matches the **skeleton edge structure**.

**Algorithm**:
1. For a given seed+anchor-vertex+rotation placement, collect all candidate stars within `patchRadius`.
2. Select N candidate stars (where N = number of skeleton vertices) using a coarse initial assignment (nearest-neighbour to vertices, as today).
3. Build the star adjacency graph: for each skeleton edge `[i, j]`, measure the angular distance between the candidate stars assigned to vertex `i` and vertex `j`. Call this `starEdgeLen[i,j]`.
4. Build the skeleton edge length vector: for each skeleton edge `[i, j]`, compute the scaled edge length `skelEdgeLen[i,j]` (in the same angular units after scale+rotation alignment).
5. Score = `1 / (1 + mean(|starEdgeLen[i,j] - skelEdgeLen[i,j]|))` over all edges — rewarding placements where star-to-star distances match skeleton edge lengths, not just proximity to individual vertices.
6. Optionally iterate: after the initial assignment, swap candidate stars (hill-climbing) to minimise total edge-length mismatch, then recompute score.

**Rationale**: The current vertex-distance score can be gamed by a star cluster that happens to sit near most vertices individually but whose connections bear no resemblance to the skeleton shape. Matching edge lengths forces the scored match to actually replicate the skeleton's topology and proportions.

**Alternative considered**: Full graph-edit distance between the star subgraph and the skeleton graph. Rejected for this hypothesis — too expensive and complex to implement and interpret in one step. The edge-length comparison is a tractable proxy.

**Implementation note**: Start with the initial NN assignment and score; the hill-climbing swap step can be gated behind a flag (`--skeletonShapeRefine`) for the first harness run.

---

---

### D10 — `skeleton-shape` as default model

**Decision**: Once harness experiments confirm `skeleton-shape` outperforms vertex-distance models, set it as the default in `BASE_DEFAULTS` (change `model: 'vertex'` → `model: 'skeleton-shape'`). Remove the `maxConstellationStars` cap inside the `skeleton-shape` path so that `constellationStars[k]` always covers every skeleton vertex.

**Rationale**: The `vertex` model produces `constellationStars` in degree-sorted order (endpoints first), not vertex-index order. This means `constellationStars[i]` is not the star for vertex `i`, so the renderer draws edges between wrong stars. `skeleton-shape` produces vertex-indexed stars by construction and is also a stronger scorer. Making it the default fixes both the scoring and the rendering contract.

---

### D11 — Star-snapping via per-edge corridor chains

**Decision**: Replace straight-line edge rendering (line from `constellationStars[i]` to `constellationStars[j]`) with per-edge star chains. For each skeleton edge `[i, j]`:

1. The two endpoint stars (`assignment[i]`, `assignment[j]`) are always the first and last elements of the chain.
2. Collect all candidate stars within `edgeCorridorWidth` of the ideal line segment (from `skelNorm[i]` to `skelNorm[j]`).
3. For each corridor star, compute its scalar projection `t` along the edge direction `(skelNorm[j] - skelNorm[i])`. Keep only stars with `0 < t < 1` (strictly between endpoints).
4. Sort by `t`. Chain = `[endpointStar_i, ...corridor_stars_sorted_by_t, endpointStar_j]`.
5. Render as a polyline through the chain.

`edgeCorridorWidth` defaults to `distanceThreshold` and is tunable via CLI. The chain is stored in `MatchResult.edgeStarChains: Star[][]`, indexed parallel to `edges`.

**Duplicate stars permitted**: The same star can appear in multiple chains (e.g., a junction star belongs to all incident edges). No uniqueness constraint is imposed at the chain-building step.

**Rationale**: Drawing a straight line between two assigned stars is visually flat and ignores real star density along the edge. By threading through actual stars in the corridor, the constellation "snaps" to the sky and looks like a hand-drawn star map rather than an overlaid diagram.

**Alternative considered**: Dijkstra-style pathfinding from endpoint to endpoint through the star graph. Rejected for first implementation — sorting by projection along the ideal line is O(N) and sufficient for a narrow corridor.

---

### D12 — Code cleanup after experiment series

**Decision**: Once the winning configuration is confirmed:

1. Remove all experimental prompt variants (`DESCRIBE_MULTI_PROMPT_P3`, `P4`, `DRAW_PROMPT_P1`–`P2`, `Q1`–`Q6`, `DRAW_DIRECT_PROMPT`, `DRAW_PROMPT_P1`/`P2`, `DRAW_PROMPT`) from `core.ts`. Keep only the single best-performing prompt path. Remove the `PROMPT_VARIANT` env-var and all branching on it.
2. Remove `simple` and `spread` matcher models from `MODELS`, `ModelName`, and `VALID_MODELS`. Remove whichever of `vertex` / `vertex-penalty` loses in harness experiments.
3. Remove the `skeleton` branch in `drawConstellation` and the `?render_mode` URL param once star-snapping is the permanent path. The `renderMode` state and `setRenderMode` export can be deleted.

**Rationale**: Dead code is maintenance burden. Keeping 12 prompt variants and 5 model names creates confusion about which path is actually used in production.

---

## Risks / Trade-offs

- **Vertex anchoring cost** → Mitigation: profile in the browser; if too slow, limit to top-5 vertices by skeleton degree
- **Bonus retuning breaks current good words (star, arrow)** → Mitigation: harness comparison immediately shows regressions; revert if green count drops
- **vertex-penalty penalises sparse sky regions** → Mitigation: `penaltyWeight` is tunable; start at 0.1 and increase
- **render_mode=stars looks worse for shapes where star placement is poor** → Mitigation: this is the point of the experiment; both modes remain available
- **skeleton-shape H6 cost** → Mitigation: edge-length scoring is O(E) per candidate; hill-climbing swaps are O(N²·E) per seed but N is small (≤15); gate refinement behind a flag
- **skeleton-shape H6 degeneracy** → Some skeletons have very similar edge lengths between different edges — the score may not uniquely identify the correct assignment. Mitigation: combine with vertex-anchor placement (D1) so we already have a good starting assignment before edge scoring.

## Open Questions

- What `vertexBonusEndpoint` value maximises shape legibility? (answered by H2 sweep)
- Does vertex-penalty help or hurt words that currently score well? (answered by H3 harness run)
- Is `render_mode=stars` visually better or worse for the five test words? (answered by H5 visual inspection)
- How large is the RA/Dec distortion effect in practice? (answered by B4 diagnostic)
- Does edge-length matching (H6) produce visually better shapes than vertex-distance matching? (answered by H6 harness comparison)
- Does the hill-climbing swap step in H6 improve results enough to justify its cost? (answered by comparing `--skeletonShapeRefine` vs without)