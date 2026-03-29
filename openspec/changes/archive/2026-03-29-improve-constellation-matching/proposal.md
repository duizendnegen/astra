## Why

The current star matcher assigns stars to skeleton *vertices* via the Hungarian algorithm, but skeleton vertices are geometric corners chosen by the LLM — not positions where real stars happen to sit. This produces poor matches with large visual gaps between stars and the skeleton outline. The random patch sampling (up to 60 attempts) also means good regions of sky are frequently missed entirely.

## What Changes

- **BREAKING**: Replace Hungarian point-to-point matching with edge-based scoring. Stars are now matched to skeleton *edges* (line segments), not vertices. No 1-to-1 assignment — any star within threshold distance of any edge is included in the result.
- Replace random patch sampling with a deterministic sweep: seed from all 179 stars at mag ≤ 3, gather all stars within 30° of each seed.
- Apply an endpoint-weighted vertex proximity bonus: stars near degree-1 skeleton endpoints score better, anchoring the constellation's boundaries.
- Log matched constellation size as a percentage of Orion's reference span (25°) after each successful match.
- Remove the Sun entry (mag −26.7) from `stars.json`; Sirius (mag −1.44) becomes the brightest entry.

## Capabilities

### New Capabilities
- `edge-based-matching`: Score stars by distance to skeleton line segments with endpoint-weighted vertex bonus, replacing Hungarian point assignment.

### Modified Capabilities
- `star-matching`: All existing requirements are superseded — patch selection strategy, matching algorithm, acceptance threshold, and output structure all change significantly.

## Impact

- `frontend/src/matcher.ts` — full rewrite of match logic; `hungarian()` function removed
- `frontend/src/__tests__/matcher.test.ts` — Hungarian tests removed; new edge-distance and scoring tests added
- `frontend/public/data/stars.json` — Sun entry removed (already done)
- `frontend/src/types.ts` — `MatchResult.stars` semantics change: now all on-pattern stars rather than a 1-to-1 skeleton-indexed array
