## Why

Algorithm changes to the matcher (constants, scoring logic, skeleton selection) are hard to evaluate confidently — there's no structured way to see whether a change is an improvement across a representative range of words. We need a repeatable, visual test suite that makes iteration fast and comparison easy.

## What Changes

- New `test-harness/` directory with a runner script and word list
- Fixture cache (`test-harness/fixtures/`) storing pre-generated skeletons per word, committed to git
- Report generation: a self-contained `report.html` per run showing a visual grid of all constellation results
- Compare mode: side-by-side HTML report diffing two run IDs
- New Claude skill `/test-constellations` that runs the full suite, takes Playwright screenshots, and reports back with qualitative observations — entirely in-conversation

## Capabilities

### New Capabilities

- `test-harness-runner`: Loads fixtures (generating missing ones via the local API), runs the matcher over all words, collects metrics, writes `results.json` and a self-contained `report.html` grid
- `test-harness-report`: Self-contained HTML grid report with per-word canvas rendering, score badges, metric labels, and ⚠️ flags; compare mode for side-by-side diff of two runs
- `test-constellations-skill`: Claude skill that orchestrates the full suite run, uses Playwright to screenshot the report, and delivers a markdown summary with visual assessment

### Modified Capabilities

## Impact

- New dev dependency: `tsx` (for running TypeScript scripts directly in Node)
- New dev dependency: `@playwright/test` or use of the existing Playwright MCP plugin
- Imports from `frontend/src/matcher.ts` and `frontend/src/types.ts` — no changes to those files
- Reads `frontend/public/data/stars.json` at test time
- Calls `http://localhost:3001/api/skeleton` when fixtures are missing (requires `npm run dev:local` in `lambda/`)
- `test-harness/reports/` added to `.gitignore`
- `test-harness/fixtures/` committed to git as stable test data
