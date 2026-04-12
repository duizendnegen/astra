## Context

The custom pipeline grew two comparison mechanisms during the evaluation phase: vtracer alongside Potrace for SVG tracing, and three skeleton strategies (`concave-hull`, `polygon-union`, `subpath-components`) displayed side-by-side in the vetting UI. Evaluation is complete — Potrace + `polygon-union` won. The comparison code is now dead weight.

`svgToSkeletonWithOpts` in `retrieval.ts` currently branches on source: `polygon-union` for `phosphor`, `concave-hull` for everything else. This was a temporary heuristic, not a deliberate architecture.

The in-progress `skeleton-subpath-components` OpenSpec change (21/29 tasks) introduced `subpath-components`. It is abandoned.

## Goals / Non-Goals

**Goals:**
- Single SVG tracing path: Potrace only, output goes directly to `svg_path`
- Single skeleton strategy: `polygon-union` everywhere, no source-based branching
- Vetting UI reduced to: PNG | SVG | skeleton — no selection step before accept
- Dead code removed: `concave-hull` and `subpath-components` branches in `svg-to-skeleton.ts`, vtracer binary, `setup.ts`
- `skeleton-subpath-components` change directory deleted

**Non-Goals:**
- Any changes to the ingest or retrieval logic beyond the strategy constant
- Migrating existing `words.csv` data (the `skeleton_strategy` column is kept as-is)
- Changing the database schema or cache format

## Decisions

**D1 — `potrace_svg_path` column removed from CSV**

`potrace_svg_path` was a comparison column. Potrace now writes directly to `svg_path`. Removing the column cleans up the schema. Any existing CSV rows with a value in `potrace_svg_path` will lose that pointer, but the file on disk is unaffected — only the CSV field is gone.

**D2 — `skeleton_strategy` column kept, always written as `polygon-union`**

Dropping it would require a migration. Keeping it costs nothing and preserves ingest compatibility. The vetting server writes `polygon-union` unconditionally on accept.

**D3 — strategy parameter removed from `svgToSkeleton` public API**

With one strategy, the parameter is noise. Remove it from `SvgToSkeletonOptions` entirely. All internal callers updated. The disk-cache key currently includes the strategy string — it will be fixed as `polygon-union` going forward (existing cache entries keyed on other strategies will simply never be hit again, which is fine).

**D4 — `concaveHullContour` and `buildMultiComponentSkeleton` helpers deleted**

These functions have no callers after the strategy branches are removed. Dead code deleted, not kept as unexported internals.

**D5 — Vetting UI: accept requires no strategy selection**

The "pick a skeleton strategy first" guard and the 1/2/3 keyboard shortcuts are removed. Accept fires immediately. The `skeletonStrategy` field sent to `/api/decide` is hardcoded to `polygon-union`.

## Risks / Trade-offs

- **Existing custom DB entries will be re-skeletonised with `polygon-union` on next live hit** — previously they used `concave-hull`. This is intentional and beneficial, but worth noting.
- **Disk cache invalidation** — L5 cache entries keyed on `concave-hull` or `subpath-components` will become unreachable. They'll age out naturally; no active purge needed.
- **`skeleton-subpath-components` task work is discarded** — 21 completed tasks worth of implementation is rolled back as part of removal.
