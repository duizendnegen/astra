## Context

`scoreAndMatch` in `matcher.ts` currently calls `normalise()` twice — once on the skeleton points and once on the flat-sky star positions — before computing distances between them. Both normalizations scale their input to roughly `[-0.5, 0.5]` using that input's own bounding box. The constants calibrated against this space (`DISTANCE_THRESHOLD = 0.10`, `VERTEX_SIGMA = 0.08`, `BRIGHTNESS_WEIGHT = 0.3`) are therefore relative to whatever each bounding box happened to be, which varies per word and per patch size.

The fix is a targeted replacement of those two calls with a single seed-anchored projection.

## Goals / Non-Goals

**Goals:**
- Constants have a fixed physical meaning (fraction of patch radius) that is the same for every word and every patch size
- Expanding the patch radius adds stars at the edges without shifting the normalized positions of stars already inside
- The brightness/geometry balance in constellation star selection is stable across dense and sparse patches
- All existing unit tests continue to pass without modification

**Non-Goals:**
- Searching over scale (the skeleton is still scaled to a fixed fraction of the patch — no scale sweep)
- Changing the rotation sweep, seed selection, or radius expansion strategy
- Changing the public `match()` API

## Decisions

### D1: Anchor the star frame to the seed, not the star bounding box

Stars are projected using a flat-sky approximation centred on the seed star's RA/Dec:

```
starX = (s.ra  - seed.ra)  / PATCH_RADIUS_DEG
starY = (s.dec - seed.dec) / PATCH_RADIUS_DEG
```

This gives every star a position in `[-1, 1]` (approximately), where `1.0` = one patch radius from the seed. The frame is identical regardless of how many stars fall inside it or where their bounding box happens to be.

**Alternative considered:** Use the star bounding box but compute it once at the start of the sweep (not per rotation). Rejected: the frame still changes when the patch radius expands, and the constant meanings still depend on patch density.

### D2: Scale the skeleton to SKELETON_FILL_RATIO × patch diameter

The skeleton arrives in LLM space `[0, 1]²`. After y-flip and rotation it is centred and scaled so its longest axis spans `SKELETON_FILL_RATIO` (proposed default: `0.8`) in the seed-anchored frame — meaning the skeleton's longest dimension is 80% of the patch diameter (80% of 2 × PATCH_RADIUS_DEG = 16° at defaults).

```
skelCentered = rotate(flipped, rotDeg)   // after centering at 0.5
skelNorm[i] = (skelCentered[i] - 0.5) * SKELETON_FILL_RATIO / 0.5
            = (skelCentered[i] - 0.5) * SKELETON_FILL_RATIO * 2
```

This replaces `normalise(rotate(flipped, rotDeg))` with a deterministic, word-independent scaling.

**Alternative considered:** Keep independent skeleton normalization, only fix the star frame. Rejected: the skeleton scale would still vary per word (Problem 1 from the proposal), and VERTEX_SIGMA would still have different physical meaning for a compact vs. expansive LLM skeleton.

**Alternative considered:** Search over scale (try multiple SKELETON_FILL_RATIO values per seed). Rejected: adds a new search dimension, substantially increases runtime, out of scope for this change.

### D3: SKELETON_FILL_RATIO = 0.8 as the starting default

The current independent normalization implicitly scales the skeleton to fill the full star bounding box. The star bounding box for a 10° patch is typically somewhat smaller than the full `[-1, 1]` frame (stars don't fill the exact corners). `0.8` approximates the effective scale that was previously implicit, making the constant re-tuning less drastic.

The test harness allows empirical validation — run v_before and v_after and compare. SKELETON_FILL_RATIO should be treated as a first-class tunable after this change.

### D4: `normalise()` is retained but not called in the hot path

The function is exported and referenced by multiple unit tests. Removing it would break tests. It stays as a utility but is no longer called inside `scoreAndMatch`. A comment will mark it as a legacy utility.

### D5: Constants re-expressed as fractions of patch radius

After the fix, the physical meaning of each constant is:

| Constant | Old meaning | New meaning |
|---|---|---|
| `DISTANCE_THRESHOLD = 0.10` | 10% of star bounding box max dim | 10% of patch radius = 1° (at 10° patch) |
| `VERTEX_SIGMA = 0.08` | 8% of star bounding box max dim | 8% of patch radius = 0.8° |
| `BRIGHTNESS_WEIGHT = 0.3` | tuned against unstable dVtx scale | tuned against dVtx in patch-fraction units |

Constants will be annotated with their angular equivalents at the default patch size.

## Risks / Trade-offs

- **[Risk] Quality regression during constant transition** → The existing constants were calibrated in the old space. Initial values may degrade results. Mitigation: run the test harness before and after; iterate constants against the word suite rather than guessing.
- **[Risk] SKELETON_FILL_RATIO assumption wrong** → If 0.8 is too large or too small, many words will degrade at once. Mitigation: 0.8 is conservative and close to the implicit previous scale; the test harness makes it easy to try 0.6, 0.8, 1.0 and compare grids.
- **[Risk] Flat-sky approximation at large Dec** → `(ra2 - ra1) * cos(dec)` is not accounted for in the star projection. The existing code has the same approximation in the star flat projection. Accepted as-is; a full spherical projection is a separate concern.
- **[Trade-off] Scale is no longer auto-fit** → Previously the skeleton was implicitly scaled to match whatever stars happened to be in the patch. Now it has a fixed scale, which is more principled but means a constellation that should span "the whole patch" must rely on SKELETON_FILL_RATIO being set correctly.

## Open Questions

- **What is the right starting value for SKELETON_FILL_RATIO?** 0.8 is the proposed default but should be validated empirically via the test harness after implementation.
- **Should BRIGHTNESS_WEIGHT be re-tuned before or after validating SKELETON_FILL_RATIO?** Recommendation: fix geometry constants first (DISTANCE_THRESHOLD, VERTEX_SIGMA, SKELETON_FILL_RATIO), then revisit BRIGHTNESS_WEIGHT separately.
