## Context

Two independent quality gaps:

1. **Rendering**: All on-pattern stars look identical — no visual hierarchy between the stars that define the constellation shape and the broader context field. Additionally, the LLM generates skeleton coordinates in screen space (y=0 top), but the sky renderer uses Dec (y increases upward), causing every constellation to appear upside down.

2. **Skeleton quality**: A single description→skeleton pipeline gives no fallback when the LLM picks an unrecognisable interpretation (shower floor plan instead of shower head). The describe prompt doesn't constrain viewpoint, so technical/overhead views slip through.

## Goals / Non-Goals

**Goals:**
- Visually distinguish constellation stars (bright, connected) from on-pattern context (slightly boosted) from background (dimmed by distance)
- Fix upside-down constellation rendering
- Generate 3 viewpoint-diverse skeleton variants per word, match all 3, return the best
- Prompt the LLM to favour iconic human-viewpoint silhouettes

**Non-Goals:**
- Changing matching algorithm constants or seed strategy
- Animating between variants
- Exposing variant selection to the user

## Decisions

### 1. `constellationStars` as a separate field on MatchResult

**Decision**: Add `constellationStars: Star[]` to `MatchResult` alongside the existing `stars` (on-pattern context set). The renderer reads `constellationStars` for lines and highlights, `stars` for the context layer.

**Why**: Keeping both fields lets the renderer freely control three tiers without any coordinate recomputation. `stars` remains the full on-pattern set useful for share links and future features.

**Alternative considered**: A single `stars` array with a boolean `isConstellation` flag per star. Rejected — it complicates iteration in the renderer and makes the type noisier.

### 2. Constellation star selection: vertex-anchored with brightness weighting

**Decision**: For each skeleton vertex in priority order (degree-1 endpoints first, then degree-2+ joints), select the best unclaimed matched star by `score = d_eff + BRIGHTNESS_WEIGHT * (mag / MAX_MAG)`. Cap at `MAX_CONSTELLATION_STARS = 8`.

Constants:
- `BRIGHTNESS_WEIGHT = 0.3`
- `MAX_MAG = 6.0`
- `MAX_CONSTELLATION_STARS = 8`

**Why vertex-anchored**: Constellation lines connect skeleton vertices; putting a star near each vertex means the drawn lines visually trace the intended shape. Stars clustered on one dense side of the sky would otherwise dominate a pure distance-sort.

**Why brightness weighting**: A mag 5.8 star exactly on a vertex is less visually impactful than a mag 1.5 star slightly off it. The composite score lets brightness influence selection without overriding proximity entirely.

### 3. Skeleton y-flip

**Decision**: In `scoreAndMatch()`, negate skeleton y-coordinates before rotation and normalisation: `[x, y] → [x, -y]`.

**Why**: The LLM prompt specifies `y=0 is top`, matching screen conventions. The sky renderer maps normalised y directly to Dec, which increases upward. Negating y once — before any rotation or normalisation — corrects the flip without touching the LLM prompt or the renderer.

### 4. Multi-variant skeleton: single describe call, 3 parallel draw calls

**Decision**: Replace `DESCRIBE_PROMPT` (one sentence) with `DESCRIBE_MULTI_PROMPT` (JSON array of 3 descriptions). Then run `DRAW` for each description in parallel via `Promise.all`. Validate with `isValidSkeleton`. Lambda returns `{ skeletons: Skeleton[] }` (1–3 items). Frontend `match()` loops over all skeletons, returns the best-scoring result.

**Why single describe call**: One call captures diverse interpretations coherently (the LLM can contrast them against each other). Three separate describe calls would likely converge on the same interpretation.

**Why parallel draw calls**: Draw calls are independent; parallelising keeps latency close to a single call. Sequential would triple worst-case latency for no benefit.

**Why best-score wins (not user choice)**: Variants are an implementation detail for match quality, not a user-facing feature. Silently returning the best result keeps the UX simple.

### 5. Prompt viewpoint guidance

**Decision**: Add explicit guidance to `DESCRIBE_MULTI_PROMPT`: think like an illustrator or emoji designer; depict the subject from the angle a person naturally sees it; avoid floor plans, cross-sections, and overhead technical views. Provide a counter-example (shower → shower head spraying water, not bathroom floor plan).

**Why**: The current prompt's "iconic silhouette" instruction is insufficient — "iconic" to an LLM can mean "architecturally canonical" rather than "visually recognisable to a human at a glance."

## Risks / Trade-offs

- **3× LLM cost per cache miss**: Three parallel draw calls triple the cost of the draw step. Mitigated by DynamoDB caching — cost is paid once per word.
- **Vertex starvation**: If matched stars are clustered in one sky region, distant skeleton vertices may find no nearby matched star and go unrepresented. The fallback (checking both adjacent edges) handles this, but very sparse patches may produce fewer than 8 constellation stars.
- **Brightness weight sensitivity**: `BRIGHTNESS_WEIGHT = 0.3` is a starting estimate. A very bright star (mag −1) at moderate distance could displace a dim star right on a vertex. Worth monitoring via visual QA; the constant is isolated for easy tuning.

## Open Questions

- Should the DynamoDB cache key change to store all 3 skeletons, or store only the winning skeleton? Storing all 3 avoids re-running the LLM if the match result changes later but increases storage and complicates cache reads. **Current plan**: store `{ skeletons: Skeleton[] }` (all 3) to allow future re-matching without LLM calls.
