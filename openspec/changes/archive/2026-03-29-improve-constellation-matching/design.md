## Context

The current matcher in `frontend/src/matcher.ts` uses two mechanisms that work against each other:

1. **Hungarian algorithm (point-to-point)**: Forces a 1-to-1 assignment of stars to skeleton *vertices*. Skeleton vertices are geometric corners placed by the LLM to define the shape — they are not positions where real stars are expected. A star sitting in the middle of an edge between two vertices scores nothing.

2. **Random patch sampling**: Up to 60 random RA/Dec centres are tried. With a 20° radius and 5069 catalogue stars, many patches miss good sky regions entirely. There is no guarantee of coverage.

The `Skeleton` type already carries `edges` (line segment index pairs), but these are only used for rendering — the matcher ignores them entirely.

The star catalogue has 5069 entries (mag −1.44 to 6.0 after Sun removal). 179 stars are at mag ≤ 3, distributed across all bright sky regions.

## Goals / Non-Goals

**Goals:**
- Match stars to skeleton *edges*, not vertices, so any star along a line segment contributes
- Reward stars near degree-1 (endpoint) vertices with a proximity bonus, anchoring constellation boundaries
- Replace random patch sampling with a deterministic sweep over bright-star seeds
- Log matched constellation size as % of Orion after each match
- Return the full "on-pattern" star set rather than a skeleton-indexed 1-to-1 array

**Non-Goals:**
- Scale invariance (normalisation already handles scale)
- Flipping / reflection invariance (rotation sweep handles ±180° effectively)
- Server-side matching
- Changing the skeleton generation pipeline

## Decisions

### 1. Drop Hungarian, use edge-coverage scoring

**Decision**: Replace the Hungarian algorithm with a simple per-star edge-distance check.

For each candidate star in normalised space:
```
d_seg  = min over all edges of point-to-segment distance
d_vtx  = min over all vertices of Euclidean distance
degree = degree of nearest vertex (count of edges touching it)
bonus  = VERTEX_BONUS_ENDPOINT if degree == 1, else VERTEX_BONUS_JOINT
d_eff  = d_seg * (1 - bonus * exp(-d_vtx² / VERTEX_SIGMA²))
matched = d_eff < DISTANCE_THRESHOLD
```

Score = matched stars / total candidates.

**Why over Hungarian**: Hungarian requires a square cost matrix and 1-to-1 assignment. It cannot express "this star is between two vertices" and treats every unmatched skeleton point as a failure. Edge-coverage scoring naturally handles stars anywhere along an edge and needs no square matrix.

**Alternatives considered**:
- *Densify skeleton* (add interpolated points along edges, keep Hungarian): works but still uses 1-to-1 and adds complexity in choosing density.
- *Per-edge assignment* (one star per edge): too restrictive; long edges might validly have multiple stars, short edges none.

### 2. Endpoint-weighted vertex bonus

**Decision**: Apply a Gaussian proximity bonus to the effective distance, with a stronger multiplier for degree-1 (tip/endpoint) vertices than degree-2+ (joint) vertices.

Constants:
- `VERTEX_BONUS_ENDPOINT = 0.6` (tips — head, feet, hands)
- `VERTEX_BONUS_JOINT = 0.1` (direction-change joints)
- `VERTEX_SIGMA = 0.08` (in normalised [-0.5, 0.5] space)

**Why endpoint weighting**: A degree-2 vertex is already covered by two adjacent edges; the point-to-segment distance is naturally small there. A degree-1 vertex is only on one edge; a star slightly past the tip falls off that edge entirely. The bonus keeps boundary stars visible in scoring.

### 3. Deterministic seed sweep

**Decision**: Replace `MAX_ATTEMPTS` random patch centres with a sweep over all stars at mag ≤ 3 (179 seeds). For each seed, gather all stars within 30° radius. Try all rotation steps. Return the best-scoring result.

**Why 30° radius**: Orion spans ~25°. At 20° (previous value) a seed at one side of a large constellation would miss stars at the other side. 30° gives comfortable headroom.

**Why mag ≤ 3**: 179 seeds provides dense coverage of all bright sky regions. Raising to mag 4 adds ~320 more seeds with diminishing returns; lowering to mag 2 leaves gaps.

**Why deterministic**: Random sampling could require many retries to land near the right region. Deterministic sweep guarantees every bright-star neighbourhood is evaluated exactly once.

### 4. Orion size logging

**Decision**: After a successful match, compute the maximum pairwise haversine distance between all matched stars. Log as `(span / 25°) × 100%`.

The 25° reference is hardcoded as `ORION_SPAN_DEG`. This is an approximate figure for Orion's major axis (Betelgeuse ↔ Rigel ≈ 20°, full figure ≈ 25°).

### 5. MatchResult.stars semantics change

**Decision**: `MatchResult.stars` becomes the set of all stars with `d_eff < DISTANCE_THRESHOLD`, ordered by match quality (closest first). It is no longer skeleton-indexed.

The renderer already iterates `skeletonPoints` + `edges` for drawing the outline, and uses `stars` only for the star glyphs. The 1-to-1 skeleton indexing is not required by any rendering path.

## Risks / Trade-offs

- **Score denominator sensitivity**: Score = matched / total candidates. A 30° patch around a very dense seed (e.g. near the galactic plane) will have many candidates, diluting the score. Mitigation: cap candidates at a reasonable maximum (e.g. 60) after sorting by magnitude.
- **Rotation step granularity**: 12 steps × 30° = coarse. A poorly-oriented skeleton may score poorly at every step and miss a valid match. Mitigation: keep `ROTATION_STEPS` configurable; consider increasing to 24 if results are poor.
- **Vertex sigma tuning**: `VERTEX_SIGMA = 0.08` is a starting estimate in normalised space. If the skeleton has very short edges, sigma may be proportionally too large. Monitor via the Orion logging and tune in a follow-up.

## Open Questions

- Should we cap the candidate pool per seed (e.g. top 60 by magnitude) to avoid score dilution near dense sky regions? Likely yes — worth evaluating once logging is in place.
- Should `ROTATION_STEPS` increase from 12 to 24 for finer orientation search? Doubles compute but improves accuracy for asymmetric skeletons.
