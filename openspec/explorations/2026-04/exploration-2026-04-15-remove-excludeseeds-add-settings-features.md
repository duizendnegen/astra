# Exploration: remove-excludeseeds-add-settings-features

**Date:** 2026-04-15
**Linked change:** none

## Context

The user wants to remove the `excludeSeeds` mechanism that passes used seed IDs between frontend and backend, add a settings icon (top-right) to toggle UI features, and define three new toggleable features: "star labels" (deferred to another branch), "constellation image" (overlay the matched SVG alongside the star render with lighter lines), and "association" (a debug panel showing the retrieval decision trail — which synonyms were tried in L3 and which one succeeded).

## Observations

### excludeSeeds flow today

```
Frontend (main.ts)                   Backend (skeleton.ts / matcher.ts)
─────────────────                    ───────────────────────────────────
usedPatches: Set<number>             excludeSeeds param → excludeSet: Set<number>
  │                                     │
  ├─ POST /api/constellation ──────────►├─ filters anchor stars in pairwiseAnchorSearch,
  │   body: { word, excludeSeeds }      │   singleSweepSearch, anyVertexSearch
  │                                     │
  ◄─ response: { seedStarId } ─────────┤ match() adds seed to excludeSeeds after match
  │
  └─ usedPatches.add(seedStarId)

Cache: only applied when excludeSeeds.length === 0 (skeleton.ts:54, local.ts:62)
```

Removing this means repeated searches on the same word can re-use the same anchor star, potentially returning the same constellation. That may be acceptable if the goal is simplification.

### Current features / settings mechanism

```
features.ts — getFeatures(URLSearchParams):
  showLines   = param 'show_lines' !== '0'   (default on)
  showStars   = param 'show_stars' === '1'   (default off)
  renderMode  = param 'render_mode' === 'skeleton' ? 'skeleton' : 'stars'

Consumed by renderer.ts:
  draw() → drawIAULines() if features.showLines
         → drawNamedStars() if features.showStars
         → draws skeleton overlay if renderMode === 'skeleton'
```

No UI panel exists today — all settings are URL params, developer-only.

### Settings icon placement

The result panel (index.html) currently has:
- `#coord-panel` (dec / RA) top area
- `#overlay` (word display) center
- `#actions` (Share Link, Export PNG) bottom
- `#close-btn` (✕) top-right of result panel

A gear icon would sit in the top-right of the page — always visible (not just on result), so the user can access it from landing too. A small slide-out or dropdown panel beneath the icon holds the toggles.

### constellation image feature

`MatchProvenance.svgPath` is the full SVG string returned from S3 / L4 generation. It's already in the API response (`match.svgPath`). The renderer uses a D3 stereographic projection on a `<canvas>` — no SVG DOM element today.

Two approaches for the overlay:
- **CSS `<img>` / `<object>` over canvas**: render SVG as an `<img>` positioned absolutely on top of the canvas with `opacity: 0.25` and `mix-blend-mode: screen`. Simple but can't reproject the SVG to match the sky orientation.
- **Draw SVG into canvas via `drawImage()`**: convert SVG to a `Blob URL`, load into `Image`, then `ctx.drawImage()` with `globalAlpha`. Same reprojection problem, but keeps everything on one canvas layer.

Since the SVG is the *source shape* (not sky-aligned), both approaches are equivalent for visual overlay. The SVG is shown as a reference silhouette alongside the stars, not aligned to them — this is just "here's what the algorithm matched against".

### association feature — data gap

The L3 pipeline in `retrieval.ts` iterates `candidates[]` (LLM-generated synonyms for the word) and logs `{ via: candidates[i], id: best.id }` on hit — but the current `MatchProvenance` only returns the **winning** match, not the trial history.

To surface "eagle → tried [hawk, talon, feather, beak, raptor] → feather hit at 0.83":

```
MatchProvenance today:
  { source, id, similarity, layer, svgPath }

MatchProvenance needed:
  { source, id, similarity, layer, svgPath,
    trail?: { candidate: string; tried: boolean; hitId?: string; sim?: number }[] }
```

The trail data is ephemeral inside `l3Task` — it would need to be collected and returned. This is a backend change to `retrieval.ts` + `types.ts`.

### Layout sketch for association panel

```
┌──────────────────────────────────────┐
│  Dec:  +45° 12′  RA: 5h 32m         │  ← coord-panel (existing)
│                                      │
│  [association trail — new]           │
│  L3 · eagle → hawk (miss) · feather  │
│        (hit @ 0.83 via phosphor)     │
└──────────────────────────────────────┘
```

Appears below RA/decl only when feature is on and `match.trail` is present.

---

## Rounds

## Round 1 — excludeSeeds removal scope

### Q1.1 — What happens to repeated searches after removal?

When excludeSeeds is gone, searching the same word twice will likely return the same constellation (same anchor star, same match). Is that acceptable, or should a different deduplication approach replace it?

- [x] Accept duplicates — the mechanism adds complexity; users rarely search the same word twice ← recommended: simplest, removes the backend param entirely
- [ ] Frontend-only dedup — keep `usedPatches` but don't send it; just block re-submission of the same word
- [ ] Replace with a random seed offset — perturb the anchor star selection in the backend without client state

> **Your answer / freetext:**
>

### Q1.2 — How deep should the removal go?

The backend `match()` function in `matcher.ts` accepts `excludeSeeds` as its 4th parameter and threads it through three search functions. Should this parameter also be removed, or just stop sending it from frontend?

- [x] Remove end-to-end — clean it out of skeleton.ts, local.ts, matcher.ts, and the three search functions ← recommended: no dead params
- [ ] Keep backend param, just stop sending from frontend — preserves future flexibility
- [ ] Keep as optional with default `undefined` — minimal change, backend stays backward-compatible

> **Your answer / freetext:**
>

---

## Round 2 — Settings panel UX

### Q2.1 — When is the settings icon visible?

- [ ] Always visible (landing and result screens) ← recommended: consistent; user can set preferences before first search
- [ ] Only when a result is shown (lives inside the result panel near ✕)
- [x] Only on landing (before result covers the UI)

> **Your answer / freetext:**
>

### Q2.2 — Should feature settings persist across page reloads?

- [x] localStorage — survives refresh, feels like a preference ← recommended: matches user expectation for toggles
- [ ] Session state only — resets on reload, simplest implementation
- [ ] URL param (keep existing mechanism) — shareable but not user-friendly as a toggle

> **Your answer / freetext:**
>

### Q2.3 — How should "star labels" appear in the settings panel?

The star labels feature is explicitly deferred to another branch. Should it appear in the panel now?

- [x] Show as disabled/greyed-out toggle — communicates the feature exists but isn't ready ← recommended: honest UI
- [ ] Omit entirely until implemented — cleaner, no "coming soon" noise
- [ ] Show as active toggle (no-op for now) — simplest code, confusing UX

> **Your answer / freetext:**
>

---

## Round 3 — constellation image feature

### Q3.1 — How should the SVG be composited with the star canvas?

- [ ] CSS `<img>` absolutely positioned over canvas, `opacity: 0.2`, `mix-blend-mode: screen` — lighter lines effect comes from blend mode ← recommended: pure CSS, no canvas repaints, easy to toggle
- [ ] Draw SVG into canvas via `drawImage()` with `globalAlpha` — single canvas but forces a re-render cycle
- [x] Inline SVG in DOM, scale to viewport, CSS blend — most control over stroke width/color but complex sizing

> **Your answer / freetext:**
>

### Q3.2 — SVG sizing and aspect ratio

The SVG is the source silhouette (normalized coordinates, not sky-aligned). How should it be sized?

- [ ] Fit inside a fixed square (e.g., 50vmin) centered in the viewport — consistent framing, always visible ← recommended
- [ ] Full-viewport cover behind the canvas — dramatic but may obscure stars
- [ ] Corner inset (like a map legend) — small reference, doesn't compete with the main canvas

> **Your answer / freetext:**
> Drawn, rotated and scaled where also the matched skeleton would be positioned.

---

## Round 4 — association feature

### Q4.1 — What data should the backend collect and return?

The L3 loop tries each candidate in order and stops on first hit. Should the trail include only the winning candidate or all attempted ones?

- [x] All attempted candidates with per-candidate outcome — most useful for debugging ← recommended: matches the user's "eagle had these synonyms, picked feather" use-case
- [ ] Only the winning candidate + layer — minimal change, just surfaces what layer was used
- [ ] All candidates regardless of outcome, including L1 word — complete picture

> **Your answer / freetext:**
>

### Q4.2 — Where in the type system should trail data live?

- [x] Extend `MatchProvenance` with `trail?: TrailEntry[]` — natural home, co-located with the winning match ← recommended: single response field, easy to toggle off
- [ ] New top-level response field `associationTrail` on the skeleton response — decoupled from match
- [ ] Log-only, poll a debug endpoint — no response change, complex frontend

> **Your answer / freetext:**
>

### Q4.3 — How should L1 hits be represented in the association panel?

L1 is a direct embedding match (no synonyms tried). When L1 hits, there's no synonym trail.

- [x] Show "L1 direct match — [icon-id] @ 0.91" — simple, no trail section needed ← recommended
- [ ] Hide association panel entirely for L1 hits — less noise
- [ ] Show "L1 direct — no synonym expansion" — explicit about the absence

> **Your answer / freetext:**
>

---

## Round 5 — SVG alignment with the constellation

Your answer to Q3.2 changes the approach significantly: the inline SVG should be positioned, rotated, and scaled to sit where the matched skeleton appears on the canvas — not a corner inset, but a geometric overlay.

### Q5.1 — Where does the rotation angle come from?

The backend returns `skeletonPoints: { ra, dec }[]` — the ideal skeleton projected back into sky coordinates after Procrustes alignment. Projecting those points through the same D3 transform gives their canvas positions, from which we can derive center and scale. But **rotation** is not explicitly returned.

Options for getting the rotation angle:

- [ ] Derive from skeletonPoints — compute the principal axis of the projected skeletonPoints cloud (PCA or longest-pair angle); apply that as the CSS `rotate()` transform on the inline SVG ← recommended: no new backend data needed
- [x] Return the Procrustes rotation matrix from the backend — explicit, precise, but requires backend change and serialising a 2×2 matrix
- [ ] Don't rotate the SVG at all — align center + scale only; accept that SVG may be tilted vs. stars

> **Your answer / freetext:**
>

### Q5.2 — How to map skeletonPoints → SVG transform?

The SVG has its own internal coordinate space (typically 0–100 or 0–viewBox). The canvas has pixel space. The transform pipeline needs to go: SVG intrinsic → canvas bounding box of skeletonPoints.

- [x] Use CSS `transform: translate(cx, cy) rotate(θ) scale(s)` on the `<svg>` element, where `cx/cy` = canvas centroid of skeletonPoints, `θ` = principal axis angle, `s` = canvas extent / SVG viewBox size ← recommended: pure CSS, no canvas involvement
- [ ] Use `<svg>` with a `viewBox` attribute rewritten to match canvas bounding box — complex, needs SVG DOM manipulation
- [ ] Draw SVG into an offscreen canvas at computed transform, then blit — works but defeats the inline-SVG choice

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Remove `excludeSeeds` completely end-to-end (frontend `usedPatches`, POST body, `skeleton.ts`, `local.ts`, `matcher.ts`, and the three anchor-search functions). Accept that repeated searches on the same word may return the same result. — _Reason:_ Mechanism adds cross-request state complexity with low user-facing benefit.

_Decision:_ Settings icon is visible on the landing screen only (hidden when result panel is shown). Settings persist to `localStorage`. — _Reason:_ User chose landing-only; localStorage matches preference semantics.

_Decision:_ Settings panel contains three toggles: "star labels" (disabled/greyed, deferred to another branch), "constellation image", and "association". — _Reason:_ Greyed toggle communicates the feature is planned without pretending it works.

_Decision:_ The constellation image is an inline `<svg>` element injected into the DOM with CSS blend mode applied, positioned and transformed to geometrically overlay the matched constellation on the canvas. — _Reason:_ Inline SVG gives full control over stroke width and color; CSS blend handles the "lighter lines" effect.

_Decision:_ SVG alignment uses a CSS `transform: translate(cx, cy) rotate(θ) scale(s)` driven by: `cx/cy` = canvas centroid of projected `skeletonPoints`, `θ` = Procrustes rotation angle returned from the backend, `s` = canvas bounding-box extent / SVG viewBox size. — _Reason:_ Precise rotation requires the Procrustes matrix from the backend; user chose explicit over PCA approximation.

_Decision:_ Backend change required: return the Procrustes rotation matrix (or angle) alongside the constellation response, so the frontend can apply the correct SVG rotation. — _Reason:_ PCA approximation from skeletonPoints was rejected in favour of exact alignment.

_Decision:_ Association trail: extend `MatchProvenance` with `trail?: TrailEntry[]` where each entry records the candidate word, whether it was tried, and if it hit: the icon id and similarity score. For L1 hits (no synonym expansion), show "L1 direct match — [icon-id] @ sim". — _Reason:_ Full per-candidate trail is the most useful for debugging retrieval decisions.
