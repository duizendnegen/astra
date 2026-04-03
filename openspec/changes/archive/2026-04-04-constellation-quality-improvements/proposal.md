## Why

The constellation shape-matching pipeline produces results that are visually unsatisfying: shapes are warped, stars cluster on edge midpoints rather than vertices, and organic shapes (bird, crown) are barely recognisable. A systematic harness-driven experiment series — one change at a time, each compared to a baseline — will identify which matcher interventions actually improve shape legibility.

## What Changes

- **Immediate fix**: Seed star placement changed from skeleton centroid to per-vertex anchoring in the matcher
- **H2** — `vertexBonusEndpoint` tuned from 0.6 to 2.0–4.0; strongly rewards stars exactly at skeleton tips
- **H3** — New `vertex-penalty` scoring model that penalises skeleton vertices with no nearby matched star
- **H4** — `rotationSteps` doubled from 12 → 24 (15° resolution → 7.5°)
- **H5** — New `?render_mode=stars` URL param: lines drawn between actual constellation star positions rather than ideal skeleton positions
- **H6** — New `skeleton-shape` scoring model: instead of matching individual skeleton vertices to individual nearby stars, find the set of star-to-star connections in the patch that best matches the skeleton's overall edge geometry (skeleton-level graph matching rather than point-to-vertex distance)
- **B-series** — Coarse-to-fine rotation, quadratic loss, multi-scale search, RA/Dec distortion diagnostic, coverage threshold sweep
- **C-series** — Hungarian algorithm vertex assignment, increased `maxConstellationStars`
- **Star-snapping** — Once `skeleton-shape` is the default, replace the straight-line edge rendering with per-edge star chains: for each skeleton edge, collect real stars that fall within a corridor around the ideal line segment, sort them by projection along the edge, and connect them in sequence. This snaps the constellation lines to actual star positions rather than drawing ideal straight lines between two assigned endpoint stars. Duplicate stars across edges are permitted (a star at a junction naturally belongs to multiple edges).
- **Default model promotion** — `skeleton-shape` becomes the default model once harness experiments confirm it outperforms vertex-distance models. `constellationStars` is uncapped (one entry per skeleton vertex, always), separating display dots from edge anchors.

Each experiment is run independently against the test harness and compared to a prior baseline run.

## Cleanup (post-experiment)

Once the winning matcher configuration is confirmed by harness experiments:

- **Remove stale prompt variants** — `core.ts` currently exports 12+ experimental prompt functions (P1–P4, Q1–Q6, A2, DRAW_DIRECT). Remove all but the single best-performing prompt path. Remove the `PROMPT_VARIANT` env-var branching.
- **Remove weak matcher models** — Keep only `skeleton-shape` (best overall) and one best vertex-distance model as a fast fallback. Remove `simple` and `spread`; remove whichever of `vertex` / `vertex-penalty` loses in harness.
- **Remove dead render-mode branching** — Once star-snapping is the permanent rendering path, remove the `skeleton` mode from `drawConstellation` and the `?render_mode` URL param.

## Capabilities

### New Capabilities

- `vertex-penalty-model`: New matcher scoring model that penalises missing vertex coverage
- `skeleton-shape-model`: New matcher scoring model that scores by comparing star-to-star edge geometry against skeleton edge geometry (skeleton-level shape matching)
- `render-mode-param`: URL query parameter controlling whether constellation lines connect skeleton points or actual star positions

### Modified Capabilities

- `star-matching`: Seed placement changed to vertex-anchoring; vertex bonus values retuned; rotation step count increased; coarse-to-fine rotation option; quadratic loss option; multi-scale search option
- `constellation-star-selection`: Hungarian algorithm assignment option; `maxConstellationStars` ceiling raised
- `constellation-rendering`: `render_mode` query param routes between skeleton-point lines and star-position lines
- `test-harness-runner`: Supports new model names (`vertex-penalty`, `skeleton-shape`), new override flags

## Impact

- `frontend/src/matcher.ts` — seed placement, vertex bonus constants, new models, rotation logic, loss function, scale search
- `frontend/src/renderer.ts` — render_mode branching
- `frontend/src/main.ts` — URL param parsing
- `test-harness/run.ts` — VALID_MODELS update
- No schema or API changes; no breaking changes to the share-link or export formats