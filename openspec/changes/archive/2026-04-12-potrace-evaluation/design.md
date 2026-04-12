## Context

The custom-skeleton-pipeline currently uses `vtracer` (a Rust binary) to trace generated PNGs to SVG. The pipeline is offline-only; the live Lambda L4 fallback uses LLM SVG generation instead. The goal is to eventually replace L4 with an image-gen + trace approach, but vtracer cannot run in a standard Node Lambda. `potrace` (`npm install potrace`) is a pure-JS Potrace implementation that can run anywhere Node runs. Before committing to it, we need to verify its output quality is comparable to vtracer on the kinds of PNGs the pipeline produces (simple black-line-drawing icons on white).

## Goals / Non-Goals

**Goals:**
- Add Potrace tracing to `02-trace-svgs.ts` so both tracers run on every PNG
- Store the Potrace SVG path in `words.csv`
- Show both SVGs in the vet UI for direct visual comparison
- Keep the ingest step unchanged (vtracer SVG remains the ingested artifact)

**Non-Goals:**
- Replacing vtracer in the pipeline (outcome of evaluation, not this change)
- Integrating Potrace into Lambda / L4 (follows if evaluation is positive)
- Tuning Potrace parameters extensively (basic settings first, tune later)

## Decisions

### D1 — Use `potrace` npm package (not a binary)

`potrace@2.1.8` is a pure-JS port of Potrace with `jimp` as its only dependency. It accepts a file path and returns SVG via callback. No binary download, no exec, works on all platforms.

Alternative considered: `node-potrace` — no maintained npm package found; effectively the same library under a different name.

### D2 — Trace in the same `02-trace-svgs.ts` step

Both vtracer and Potrace run on the same PNG in the same loop iteration. The Potrace SVG is written to `{word}-linedrawing-potrace.svg` alongside the existing `{word}-linedrawing.svg`. This keeps the trace step self-contained and avoids a new pipeline script.

Alternative considered: separate `02b-trace-potrace.ts` script — cleaner separation but adds operational friction (two scripts to run).

### D3 — Potrace parameters

Start with Potrace defaults. The input PNGs are already high-contrast black-on-white line drawings, so defaults should work without tuning. If evaluation shows quality issues, parameters can be adjusted iteratively.

### D4 — Vet UI layout

Add a "Potrace SVG" column between the existing SVG and skeleton columns:

```
PNG | SVG (vtracer) | SVG (potrace) | skeleton×3
```

Both SVGs rendered as `<img>` tags from base64. No interaction changes — the vet decision (accept/retry) remains based on the vtracer SVG for now.

### D5 — Potrace tracing failure handling

If Potrace fails for a word, log a warning and leave `potrace_svg_path` empty. The vtracer result is unaffected. The vet UI shows a placeholder if `potrace_svg_path` is absent.

## Risks / Trade-offs

- **`jimp@^0.14` is an older major**: may have peer-dep conflicts with other pipeline deps. Isolated `package.json` in `scripts/custom-pipeline/` minimises blast radius.
- **Potrace quality unknown**: the entire point of this change is to find out. If quality is poor, the L4 replacement plan pivots to Docker Lambda + vtracer.
- **Potrace is GPL-2.0**: acceptable for an offline evaluation tool; if it ends up in Lambda, the license implications need review.
