## Why

Matched constellations currently appear upside down, and all matched stars are rendered identically — there's no visual distinction between the few stars that define the constellation shape and the surrounding context. Additionally, the LLM skeleton generator produces only one shape interpretation per word and often picks a technical/overhead view (e.g. a shower floor plan) rather than the iconic silhouette a human would recognise.

## What Changes

- **BREAKING**: `MatchResult` gains `constellationStars: Star[]` — the subset of matched stars that form the connected constellation (up to 8, skeleton-vertex-anchored). Renderer now uses this field for lines and highlights.
- Fix skeleton appearing upside down: negate skeleton y-coordinates before normalisation in `scoreAndMatch()`.
- Three-tier star rendering: background stars → on-pattern stars (slightly boosted) → constellation stars (fully bright, connected by lines).
- Replace single-description LLM prompt with a multi-variant prompt returning 3 iconic descriptions as a JSON array; run 3 parallel `DRAW` calls to produce 3 skeletons; match all 3 and return the best-scoring result.
- Lambda API response changes from returning one skeleton to `{ skeletons: Skeleton[] }`.

## Capabilities

### New Capabilities
- `constellation-star-selection`: Algorithm for selecting up to 8 constellation stars from the on-pattern set, anchored to skeleton vertices with endpoint priority and brightness weighting.
- `multi-variant-skeleton`: Generate 3 skeleton shape variants per word via parallel LLM calls and select the best-matching one.

### Modified Capabilities
- `star-matching`: `match()` now accepts an array of skeletons and returns the best match across all variants. `MatchResult` structure extended.
- `constellation-rendering`: Rendering now uses `constellationStars` for lines/highlights and `stars` for the dimmer on-pattern context layer.
- `skeleton-generation`: Prompt returns 3 variants; generation is parallelised. API response shape changes.

## Impact

- `frontend/src/matcher.ts` — constellation star selection, y-flip, multi-skeleton match loop
- `frontend/src/renderer.ts` — three-tier rendering using `constellationStars`
- `frontend/src/types.ts` — `MatchResult.constellationStars`, optional `variantIndex`
- `frontend/src/main.ts` — pass skeleton array to `match()`
- `lambda/src/core.ts` — new multi-describe prompt, parallel draw calls, return skeleton array
- `lambda/src/skeleton.ts` — API response body wraps skeletons in `{ skeletons: [...] }`
