# Exploration: constellation-star-labels-settings-panel

**Date:** 2026-04-15
**Linked change:** none

## Context

The `constellation-star-labels` feature (star names on constellation stars when `showStars === 'constellation'`) was implemented in the previous commit but not wired into the settings panel — the checkbox is in the HTML but `disabled`. Separately, `share.ts` still preserves `show_stars` and `show_lines` URL params that are never consumed by `main.ts`. This session decides how to activate the star-labels checkbox and cleanly remove the dead URL-param logic.

## Observations

### Current data model

```
Features {
  showLines: boolean           // IAU boundary lines
  showStars: false | 'named' | 'constellation'
  renderMode: 'stars'|'skeleton'
  showConstellationImage: boolean   ← settings checkbox, wired
  showAssociation: boolean          ← settings checkbox, wired
  showStarLabels: boolean           ← settings checkbox, DISABLED
}
```

`showStarLabels` was added to `features.ts` as a placeholder for the settings panel, but the **renderer uses `showStars === 'constellation'` to actually draw labels** — so `showStarLabels` is currently inert.

### Two label modes in renderer.ts

| Mode | Trigger | What renders |
|------|---------|--------------|
| `'named'` | `features.showStars === 'named'` | Labels on all named stars in viewport (`drawNamedStars`) |
| `'constellation'` | `features.showStars === 'constellation'` | Labels on constellation stars only (`drawConstellation`) |

Neither mode has a UI control. Both are dead from the user's perspective.

### URL params — vestigial

`share.ts:buildShareUrl()` preserves `show_stars=1` and `show_lines=1` from the current URL into share links. **`main.ts:boot()` never reads them.** They were never wired up after the localStorage migration in the previous commit. Tests in `share.test.ts:89–115` cover the preserve/omit behaviour — those tests go away with the params.

### Settings panel HTML

```html
<div id="settings-panel" hidden>
  <label><input type="checkbox" id="feature-constellation-image"> Constellation image</label>
  <label><input type="checkbox" id="feature-association"> Match trail</label>
  <label><input type="checkbox" id="feature-star-labels" disabled> Star labels</label>
</div>
```

`main.ts` wires up `featureConstellationImage` and `featureAssociation` but has no DOM ref or listener for `feature-star-labels`.

### `loadStarNames()` is conditional on `showStars`

In `boot()`:

```ts
features.showStars === 'constellation' ? loadStarNames() : Promise.resolve(new Map())
```

If we switch to `showStarLabels`, boot must reload (or lazily fetch) `star-names.json` when the checkbox is toggled. The file is a static asset served by Vite; lazy-loading on toggle is fine.

### Touch points for the change

```
frontend/src/features.ts        — data model reconciliation
frontend/src/renderer.ts        — switch gate from showStars to showStarLabels
frontend/src/main.ts            — add DOM ref + listener; handle lazy starNames load
frontend/src/share.ts           — remove show_stars / show_lines logic
frontend/index.html             — remove disabled attr from feature-star-labels
openspec/specs/settings-panel/spec.md  — update disabled scenario
frontend/src/__tests__/share.test.ts   — remove two test cases
frontend/src/__tests__/features.test.ts — update defaults if showStars removed
```

---

## Rounds

## Round 1 — Data model: showStars vs showStarLabels

### Q1.1 — Which field controls constellation star labels?

`showStars: false | 'named' | 'constellation'` and `showStarLabels: boolean` are redundant for the constellation-labels use case. How should we reconcile them?

- [ ] Keep `showStarLabels` as the canonical boolean; change renderer to use it; keep `showStars` only for the unused `'named'` mode ← recommended: minimal diff, `showStarLabels` already in localStorage key and settings-panel spec
- [ ] Remove `showStarLabels`, map the checkbox to `showStars === 'constellation'` in the listener
- [x] Remove `showStars` entirely, drop `'named'` mode (dead code anyway)

> **Your answer / freetext:**
>

### Q1.2 — Should the `'named'` star-label mode be kept or dropped?

`drawNamedStars()` renders labels on all named stars in the viewport, gated on `showStars === 'named'`. There is no UI control for it and it is never set by user action.

- [ ] Keep it but do nothing — it's debug scaffolding that doesn't need a ticket now ← recommended: out of scope; caller never sets it so it's dead but harmless
- [x] Remove it along with `showStars` (drop `drawNamedStars`, simplify `Features`)
- [ ] Expose it as a second checkbox in the settings panel

> **Your answer / freetext:**
>

---

## Round 2 — Star name loading strategy

### Q2.1 — When should star-names.json be fetched?

Currently it's fetched once at boot, conditionally. If the user toggles the checkbox after boot, the name map will be empty.

- [x] Lazy-load on first toggle-on and cache in module scope — call `loadStarNames()` in the checkbox listener, await, then `setOverlayData` ← recommended: ~3 KB asset, imperceptible latency; no page reload needed
- [ ] Always fetch at boot regardless of initial toggle state (simple but wastes bandwidth for users who never enable it)
- [ ] Require page reload when toggling on (simplest code; worse UX)

> **Your answer / freetext:**
>

---

## Round 3 — URL parameter removal scope

### Q3.1 — What exactly gets removed from share.ts?

`buildShareUrl` currently passes `show_stars` and `show_lines` through if they exist in `location.search`. Since `main.ts` never reads them, they're pure noise.

- [x] Remove both `show_stars` and `show_lines` preservation lines from `buildShareUrl`; delete the two test cases in `share.test.ts` ← recommended: these params are fully dead — never read, only propagated
- [ ] Remove only `show_stars` (it's been replaced by `showStarLabels`); keep `show_lines` for potential future URL-based sharing
- [ ] Keep them, just stop propagating new state into them (they'll naturally drain from share links)

> **Your answer / freetext:**
>

### Q3.2 — Does the `?c=` share param need any changes?

`share.ts:encode/decode` handles the constellation result payload in `?c=`. The user did not ask to change this. Is there anything to update?

- [x] No changes needed — `?c=` is orthogonal to feature flags; leave encode/decode untouched ← recommended
- [ ] Add feature flag state into the `?c=` payload so shared links restore feature settings

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Remove `showStars: false | 'named' | 'constellation'` from `Features` entirely — _Reason:_ both values were dead code with no UI control; `showStarLabels: boolean` is the canonical field that the settings panel already references.

_Decision:_ Delete `drawNamedStars()` from `renderer.ts` — _Reason:_ `'named'` mode had no consumer and complicated the renderer; removing it simplifies the draw path.

_Decision:_ Renderer gates constellation star labels on `features.showStarLabels` — _Reason:_ direct boolean avoids the enum string comparison; consistent with how the other two settings-panel flags work.

_Decision:_ Lazy-load `star-names.json` on first checkbox toggle-on, cache in a module-scoped variable — _Reason:_ avoids eager fetch for users who never enable star labels; asset is ~3 KB so toggle latency is imperceptible.

_Decision:_ Boot still fetches `star-names.json` eagerly when `showStarLabels` is already `true` (persisted from localStorage) — _Reason:_ avoids a blank-label flash on initial render for returning users.

_Decision:_ Remove `show_stars` and `show_lines` preservation from `buildShareUrl` and delete the two corresponding test cases — _Reason:_ params were never consumed by `main.ts`; keeping them in share links is misleading noise.

_Decision:_ Leave `?c=` encode/decode untouched — _Reason:_ feature flags are user-local preferences stored in localStorage, not part of a shareable constellation result.
