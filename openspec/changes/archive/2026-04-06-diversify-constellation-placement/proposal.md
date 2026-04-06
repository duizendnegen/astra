## Why

The matcher always returns the single highest-scoring placement, and because star density peaks near Sirius/Orion, nearly every constellation ends up in that region regardless of the word. Spreading placements across the sky makes the rendered output feel genuinely astronomical rather than clustered in one corner.

## What Changes

- `runPhase2And3` returns a ranked list of all phase-3 candidates instead of a single best result, exposing the geographic diversity that already exists in the candidate pool.
- `match()` applies a diversity selection step: among candidates scoring within 10% of the top score, it prefers one that is at least 30° away from the top match's sky position, chosen randomly. If no distant candidate exists, it falls back to the top result.
- The selection is non-deterministic by design — the same word may land in different sky regions on different requests. Sharing is unaffected because it serialises the result, not the word.

## Capabilities

### New Capabilities

- `constellation-placement-diversity`: Logic for selecting among acceptable match candidates to favour sky-diverse placements over the globally highest-scoring one.

### Modified Capabilities

- `star-matching`: The matcher's return path changes — `runPhase2And3` now surfaces multiple candidates; `match()` adds a post-selection step before returning.

## Impact

- `lambda/src/matcher.ts`: `runPhase2And3` signature and return type change; `match()` gains diversity selection logic.
- No changes to callers (`local.ts`, Lambda handler, or any frontend code).
- `MatchResult` shape is unchanged.
- Test harness output will show more geographic spread; existing score-based assertions remain valid.
