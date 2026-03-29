## Context

The matcher algorithm (`frontend/src/matcher.ts`) is pure TypeScript with no DOM dependencies — it already runs in Node via the existing vitest suite. The star catalogue lives at `frontend/public/data/stars.json` (291 KB, ~9k stars). The local API server (`lambda/src/local.ts`) runs on port 3001 and generates skeleton variants via OpenRouter.

The test harness needs to: run the full pipeline over ~40 words, produce visual output for human review, and make before/after comparison fast enough to do routinely during algorithm iteration.

## Goals / Non-Goals

**Goals:**
- Run the matcher over a fixed word list without calling OpenRouter on every run
- Produce a self-contained visual HTML report (grid of constellation thumbnails + metrics)
- Support side-by-side comparison of two named runs
- Wrap the whole flow in a Claude skill usable in-conversation with Playwright for visual review

**Non-Goals:**
- Automated pass/fail assertions (this is human-judgment-driven evaluation)
- CI integration
- Testing the skeleton generation quality (only matcher quality is evaluated)
- Testing the production renderer (`renderer.ts`) — a minimal inline renderer is sufficient for thumbnails

## Decisions

### D1: Run matcher in Node, not in a browser

The matcher is pure TS. Running it via `npx tsx` avoids needing a browser or Vite dev server for the compute step. The existing vitest tests confirm this works. The report HTML is generated as a file artifact, not rendered in-process.

**Alternative considered:** Drive the real Vite dev server with Playwright, mock the `/api/skeleton` endpoint. Rejected: requires a running server, processes words one at a time through the UI, and doesn't give a grid overview.

### D2: Fixture files committed to git, auto-generated when missing

Fixtures (`test-harness/fixtures/{word}.json`) are committed so that algorithm runs are reproducible without calling OpenRouter. When a fixture is missing, the runner calls `localhost:3001/api/skeleton` and saves the result. This keeps skeleton generation out of the hot path.

**Alternative considered:** Always regenerate skeletons at run time. Rejected: makes runs slow, costly, and non-reproducible across algorithm tweaks.

### D3: Self-contained report.html with embedded patch stars

The report HTML embeds all necessary data inline (results + per-word patch stars). No external file loads. This lets Playwright open it as a `file://` URL without a server.

Patch stars (stars within `PATCH_RADIUS_DEG` of the match center) are collected during the run and written into `results.json`. The full 291 KB catalogue is not embedded.

**Alternative considered:** Serve the report via a local HTTP server. Rejected: adds operational complexity for no benefit in the local-only workflow.

### D4: Minimal inline canvas renderer, not reusing renderer.ts

The report uses a small inline canvas renderer (stereographic projection via D3 from CDN) rather than importing the production `renderer.ts`. The production renderer is coupled to DOM state, animation, and camera management that aren't needed for static thumbnails.

**Alternative considered:** Bundle renderer.ts as a separate Vite entry point. Rejected: adds build complexity; the thumbnail renderer is intentionally simpler.

### D5: Run IDs are short version strings (v1, v2, v3…)

Auto-incremented by scanning the `reports/` directory. User can override with `--run-id <label>`. Compare mode takes two IDs explicitly: `--compare v2 v3`.

### D6: Skill drives fixture generation, not a separate command

The `/test-constellations` skill checks for missing fixtures and generates them inline before running the suite. No separate `/refresh-fixtures` command. The skill stops early and explains what to do if the local API is unreachable.

## Risks / Trade-offs

- **Patch star collection duplicates matcher internals** → The runner filters stars by haversine distance to the patch center using the same radius constant. If `PATCH_RADIUS_DEG` changes in matcher.ts, the harness must be updated too. Mitigation: export the constant from matcher.ts or document the coupling clearly.
- **Fixture staleness** → If the skeleton generation prompts change, old fixtures become inconsistent with new behavior. Mitigation: fixtures are committed; stale fixtures are visible in git history. The skill can delete and regenerate individual fixtures.
- **D3 CDN dependency in report.html** → If CDN is unavailable, thumbnails won't render. Mitigation: acceptable for a local dev tool; note in skill instructions.
- **Playwright MCP vs installed** → The skill uses the MCP Playwright plugin when available (in-conversation), falling back to a locally installed `@playwright/test`. Both produce screenshots but the code path differs. Mitigation: skill instructions handle both cases.
