## Context

`MatchResult` has two distinct star arrays: `stars` (on-pattern stars within edge threshold) and `constellationStars` (up to 8 vertex-anchored stars used for rendering). The share encoding was written before `constellationStars` was added to the type, so the serialized payload never included it. On decode, `constellationStars` is `undefined`, and both `drawStars()` and `drawConstellation()` in the renderer call `.map()` on it unconditionally, throwing a `TypeError` at runtime.

A secondary bug: `buildShareUrl` sets `url.search = ''` before adding `c`, silently dropping `show_stars` and `show_lines` feature flags from the generated URL.

## Goals / Non-Goals

**Goals:**
- Fix crash: decoded `MatchResult` must include a valid `constellationStars` array
- Fix flag loss: share URL must preserve `show_stars` and `show_lines` when active
- Add regression tests covering both bugs

**Non-Goals:**
- Changing the encoding format for other fields
- URL shortening or server-side share storage
- Backward compatibility with previously generated share links (they were already broken)

## Decisions

### Decision: Store `constellationStars` ids under a separate key (`cids`)

The `Encoded` interface gains a `cids: number[]` field alongside `ids`. `encode()` serializes `state.match.constellationStars.map(s => s.id)` into `cids`. `decode()` looks up both `ids` and `cids` from the catalogue and rebuilds both arrays.

**Alternative considered**: Re-use `ids` for both arrays (deduplicated union). Rejected — the two arrays have different semantics and ordering; conflating them would require extra logic to separate them at decode time and would obscure intent.

### Decision: `buildShareUrl` copies active flags from current params rather than accepting a `Features` argument

Rather than threading `Features` into `buildShareUrl`, read `show_stars` and `show_lines` directly from `window.location.search` params and forward them if set. This keeps the function signature minimal and is consistent with how `boot()` reads them.

**Alternative considered**: Pass `Features` as a second argument. This would be cleaner for testing but requires updating every call site and the signature of `buildShareUrl`. Given there is only one call site and the function already reads `window.location`, the simpler approach is preferred.

## Risks / Trade-offs

- **Old share links are silently broken** → Acceptable: they were already broken at runtime (renderer crash), so there is no working population of links to protect.
- **`cids` absent in old encoded payloads** → `decode()` must handle missing `cids` gracefully (return `null` or fall back). Since old links crashed anyway, returning `null` and showing landing is the right behaviour.
