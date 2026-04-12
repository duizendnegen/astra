## Why

After evaluating vtracer vs. Potrace side-by-side in the vetting UI and all three skeleton strategies in production, the verdict is clear: Potrace produces better results and `polygon-union` is the only skeleton strategy worth keeping. The comparison machinery (vtracer binary, `concave-hull`, `subpath-components`) is now dead weight that complicates the pipeline without adding value.

## What Changes

- **Remove vtracer**: delete the `vtracer.exe` binary and `setup.ts` downloader; `02-trace-svgs.ts` runs Potrace only and writes to `svg_path` directly
- **Remove `concave-hull` strategy**: eliminated from `svg-to-skeleton.ts` and all call sites
- **Remove `subpath-components` strategy**: eliminated from `svg-to-skeleton.ts` and all call sites
- **`polygon-union` becomes the sole strategy**: `svgToSkeletonWithOpts` always uses it regardless of source; no branching on `phosphor` vs. other
- **Simplify vetting UI**: one SVG panel (unlabelled), one skeleton canvas, accept without picking a strategy
- **`skeleton_strategy` CSV column kept**: always written as `polygon-union` on accept
- **Abandon `skeleton-subpath-components` OpenSpec change**: delete the in-progress change directory

## Capabilities

### New Capabilities

- None

### Modified Capabilities

- `svg-to-skeleton`: strategy union type narrowed to `polygon-union` only; `concave-hull` and `subpath-components` branches removed
- `potrace-tracing`: Potrace is now the sole tracer; `svg_path` written directly (no more `potrace_svg_path` split)
- `svg-icon-index`: `skeleton_strategy` column always written as `polygon-union`

## Impact

- `scripts/custom-pipeline/bin/vtracer.exe` — deleted
- `scripts/custom-pipeline/setup.ts` — deleted
- `scripts/custom-pipeline/02-trace-svgs.ts` — remove vtracer, Potrace writes to `svg_path`
- `scripts/custom-pipeline/03-vet-server.ts` — remove strategy picker, second SVG panel, keyboard shortcuts 1/2/3
- `scripts/custom-pipeline/csv.ts` — remove `potrace_svg_path` field
- `lambda/src/svg-to-skeleton.ts` — remove strategy branches, type, helper functions
- `lambda/src/retrieval.ts` — `svgToSkeletonWithOpts` always uses `polygon-union`
- `openspec/changes/skeleton-subpath-components/` — deleted
