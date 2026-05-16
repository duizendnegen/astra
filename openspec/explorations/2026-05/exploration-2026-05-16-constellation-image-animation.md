# Exploration: Constellation Image Animation Bugs

**Date:** 2026-05-16
**Linked change:** none

## Context

The constellation SVG image overlay has two distinct animation bugs: during fade-in it sits at a fixed screen position while the stars are still animating toward it (giving the impression the image follows the viewport rather than the constellation site), and during fade-out it lingers for 1500ms while the matched stars vanish instantly. Both bugs are timing/sequencing issues in how the SVG overlay lifecycle is coordinated with the renderer's animation loop.

## Observations

### Architecture overview

```
main.ts                         renderer.ts
───────────────────────────────────────────────────────────────
showResult()                    animateToResult()
  buildProjectionForCamera()      animateTo(target, 2000ms, onComplete, fadeStart=0.60, fadeOut=false)
    → targetProj (FINAL)            per-frame: constellationAlpha = computeConstellationAlpha(e, 0.60)
  setupSvgOverlay(targetProj,       → stars fade IN during last 40% of anim (t=0.6→1.0)
    delay=1200ms)                   projection updated each frame
  animateToResult(…, onComplete)
    → onComplete: updateSvgTransform()

showLanding()
  setConstellation(null)    ← INSTANT: constellation stars gone from canvas immediately
  animateToLanding()        → animateTo(LANDING_CAMERA, 1500ms, fadeOut=true)
                                  per-frame: constellationAlpha = 1 - e
                                  (but constellation=null → drawConstellation() is a no-op)
  clearSvgOverlay(1500ms)   ← SVG fades over 1500ms CSS transition
```

### Bug 1: Image positioned at final camera destination, not current canvas position

**Flow in `showResult()`** (`main.ts:200-210`):

```
t=0ms:    setupSvgOverlay(state, targetProj, fadeDelayMs=1200)
            → SVG injected, transform computed with targetProj (FINAL camera)
            → SVG opacity=0, hidden at FINAL screen position
t=1200ms: fade-in starts (opacity 0 → 0.35, 0.8s ease)
t=2000ms: animateToResult completes → updateSvgTransform() (using live projection now = targetProj)
```

**During the fade-in window (1200ms – 2000ms)**:
- Canvas stars: projected with the CURRENT (still-animating) projection
- SVG image: fixed at screen coords computed from `targetProj` (FINAL projection)

At t=1200ms, the eased camera progress is:  
`e(0.6) = -1 + (4 - 2×0.6)×0.6 = 0.68` — the camera is 68% of the way to the target.  
The SVG is at the 100% position. The gap is **32% of total camera travel** for the first frame of fade-in.

Stars are moving toward the image position during the fade-in (ease-out, so slowing down), which means the image appears to be sitting at a fixed screen location while stars arrive at it. To the user it looks like the image is "stuck to the viewport" rather than pinned to the constellation site.

### Bug 2: SVG fades out 1500ms after matched stars disappear instantly

**Flow in `showLanding()`** (`main.ts:215-228`):

```
t=0:   setConstellation(null)      → constellation=null
                                     drawConstellation() returns immediately (guard: if (!constellation) return)
                                     matched stars INSTANTLY gone from canvas
       animateToLanding()           → 1500ms, fadeOut=true
                                     constellationAlpha = 1-e each frame
                                     BUT constellation is null → only affects BG dimming/IAU lines
       clearSvgOverlay(1500ms)     → CSS: opacity 0.35→0 over 1500ms ease
```

The matched constellation stars (the white highlighted dots) vanish at **t=0** because `constellation` is nulled before `animateToLanding()`. The SVG image then fades over 1.5 full seconds. The 1500ms `clearSvgOverlay` duration was designed to sync with `animateToLanding`, but that sync was predicated on the stars also fading over 1500ms — which they don't, since `setConstellation(null)` kills them instantly.

### Key constants

| Constant | Value | Location |
|---|---|---|
| `RESULT_ANIM_MS` | 2000ms | `main.ts:12`, `renderer.ts:350` |
| `RESULT_FADE_START` | 0.60 | `main.ts:13`, `renderer.ts:10` |
| `LANDING_ANIM_MS` | 1500ms | `main.ts:14`, `renderer.ts:354` |
| SVG fade-in duration | 0.8s | `main.ts:91` |
| SVG fade-out duration | `animMs` (1500ms) | `main.ts:139` |
| SVG target opacity | 0.35 | `main.ts:92`, `style.css:321` |

### Relevant code locations

- `main.ts:53–101` — `setupSvgOverlay`: injects SVG, sets transform from `targetProj`, schedules fade-in
- `main.ts:108–127` — `updateSvgTransform`: updates transform using live `getProjection()`
- `main.ts:133–150` — `clearSvgOverlay`: instant or timed CSS opacity fade-out
- `main.ts:197–213` — `showResult`: calls `setupSvgOverlay(targetProj, 1200)` then `animateToResult`
- `main.ts:215–228` — `showLanding`: nulls constellation, starts landing anim, calls `clearSvgOverlay(1500)`
- `renderer.ts:282` — per-frame alpha: `constellationAlpha = fadeOut ? 1 - e : computeConstellationAlpha(e, fadeStart)`
- `renderer.ts:103-104` — `drawConstellation` guard: `if (!constellation) return`

## Rounds

## Round 1 — Fix strategy for Bug 2 (fade-out timing)

### Q1.1 — How should the SVG fade-out sync with the matched stars?

The matched stars disappear instantly (`setConstellation(null)` at t=0); the SVG should match that pace rather than the 1500ms camera animation.

- [x] Instant clear (`clearSvgOverlay(0)`) ← recommended: stars are gone immediately; 1500ms SVG linger creates jarring visual mismatch. Instant dismissal feels coherent.
- [ ] Keep `clearSvgOverlay(1500)` but delay `setConstellation(null)` to after animation ← preserves the 1500ms sync intent but requires the renderer to fade the matched stars over 1500ms too (more invasive change)
- [ ] Short fade (~100–150ms) ← compromise; gives the image a moment to "pop out" rather than vanish on the exact same frame as stars

> **Your answer / freetext:**
> Defaults accepted.

## Round 2 — Fix strategy for Bug 1 (positioning during fade-in)

### Q2.1 — When should the SVG position be determined?

The SVG is currently positioned at t=0 using `targetProj`. During the fade-in window it's at the wrong screen location.

- [ ] Delay SVG appearance until `animateToResult` `onComplete` ← SVG only appears after camera settles; clean positioning guarantee; stars fade in during animation, SVG fades in after (minor design change)
- [x] Update SVG transform each animation frame during `animateToResult` ← recommended: SVG tracks the stars perfectly; requires threading a per-frame callback from renderer to main.ts (or exporting a hook)
- [ ] Accept the offset — keep current behaviour ← the last 40% of a quadratic ease-out moves only ~32% of total travel, so the offset shrinks quickly; may be imperceptible in practice

### Q2.2 — If per-frame updates are chosen, how to thread the callback?

`animateToResult` (renderer.ts) doesn't currently support a per-frame callback.

- [x] Add `onFrame?: () => void` parameter to `animateTo` / `animateToResult` ← recommended: minimal API surface, called each frame during the step loop, main.ts passes `updateSvgTransform`
- [ ] Export a `setFrameCallback` setter to renderer.ts, set/clear it from main.ts ← avoids changing function signatures; slightly messier lifecycle
- [ ] Poll `getProjection()` from a separate `requestAnimationFrame` loop in main.ts ← decoupled but two separate loops running; timing drift possible

> **Your answer / freetext:**
> Defaults accepted.

## Insights & Decisions

_Decision:_ `clearSvgOverlay(0)` (instant) instead of `clearSvgOverlay(LANDING_ANIM_MS)` in `showLanding()` — _Reason:_ `setConstellation(null)` removes matched stars from the canvas immediately (before `animateToLanding` runs), so the stars are already gone. The 1500ms SVG fade was designed to sync with a star fade that never actually happens.

_Decision:_ Add `onFrame?: () => void` parameter to `animateTo` and thread it through `animateToResult` — _Reason:_ The SVG overlay is currently positioned with `targetProj` (the FINAL camera projection) computed at t=0. During the fade-in window (t=1200ms–2000ms) the live camera projection differs by up to 32% of total camera travel, making the SVG sit at a mismatched screen position while the stars animate toward it.

_Decision:_ `animateToResult` signature becomes `animateToResult(patchRA, patchDec, onComplete?, onFrame?)` — _Reason:_ Minimal API change; `onFrame` is optional so all other callers are unaffected. In `showResult`, `onFrame` is wired to `updateSvgTransform`.
