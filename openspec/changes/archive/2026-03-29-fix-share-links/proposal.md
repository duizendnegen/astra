## Why

Share links are broken in two ways: decoded links crash the renderer because `constellationStars` was added to `MatchResult` after the share encoding was written and was never included in the serialized payload, and `buildShareUrl` strips feature-flag params (`show_stars`, `show_lines`) from the generated URL, so recipients see a different view than the sender.

## What Changes

- `encode()` in `share.ts` now serializes both `stars` ids **and** `constellationStars` ids as separate fields
- `decode()` reconstructs both arrays from the catalogue, producing a valid `MatchResult` that the renderer can consume without crashing
- `buildShareUrl()` preserves `show_stars` and `show_lines` params from the current URL when they are active

## Capabilities

### New Capabilities

*(none — this is a bug fix)*

### Modified Capabilities

- `share-link`: Encoded payload must include `constellationStars` ids; share URL must preserve active feature flags alongside the `c` parameter

## Impact

- `frontend/src/share.ts` — encode, decode, buildShareUrl
- `frontend/src/__tests__/share.test.ts` — existing round-trip test must cover `constellationStars`; new test for flag preservation
