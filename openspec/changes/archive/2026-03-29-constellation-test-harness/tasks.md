## 1. Project Setup

- [x] 1.1 Create `test-harness/` directory and add `test-harness/reports/` to `.gitignore`
- [x] 1.2 Add `tsx` as a dev dependency to the root or a new `test-harness/package.json`
- [x] 1.3 Create `test-harness/tsconfig.json` extending the frontend tsconfig, with path aliases to resolve `frontend/src/*`

## 2. Word List

- [x] 2.1 Create `test-harness/words.ts` with ~40 words in three commented categories: concrete, moderate, abstract — including potato, dog, cat, bird, fish, tree, house, car, rocket, moon, sun, key, sword, hammer, crown, boat, mountain, island, heart, skull, wave, cloud, fire, eye, hand, leaf, spider, butterfly, love, desire, hope, fear, chaos, freedom, death, music, time, joy, anger, peace

## 3. Runner Script

- [x] 3.1 Create `test-harness/run.ts` skeleton: parse `--run-id` and `--compare` CLI args; auto-assign next `v{N}` ID by scanning `reports/`
- [x] 3.2 Implement star catalogue loading: `fs.readFileSync` on `frontend/public/data/stars.json`, parse as `Star[]`
- [x] 3.3 Implement fixture loading: for each word, try `fixtures/{word}.json`; if missing POST to `localhost:3001/api/skeleton`, save response, handle connection errors with a clear message
- [x] 3.4 Implement matcher invocation: call `match(stars, fixture.skeletons)` from `frontend/src/matcher.ts`; collect score, star count, angular size, Orion%, variant index, patchRA/Dec
- [x] 3.5 Implement patch star collection: filter catalogue to stars within `PATCH_RADIUS_DEG` of patchRA/patchDec for each result
- [x] 3.6 Write `reports/{runId}/results.json` with run metadata header and per-word result array

## 4. Report HTML Generation

- [x] 4.1 Implement the report HTML template as a TypeScript string in `run.ts` (or a separate `template.ts`): header section with run ID, date, pass/fail counts
- [x] 4.2 Implement word card HTML: bold word heading, score bar with green/amber/red coloring, metric labels (star count, size°), ⚠️ flag for size < 2.5°
- [x] 4.3 Implement the inline canvas renderer in the report HTML: load D3 from CDN, use `d3.geoStereographic()` to project patch stars and skeleton points onto each card's canvas; draw faint background stars, brighter matched stars, pale blue constellation edges
- [x] 4.4 Embed all result data (including patch stars per word) as a JSON `<script>` tag; confirm the file opens correctly via `file://` with no server

## 5. Compare Mode

- [x] 5.1 Implement `--compare <idA> <idB>` arg handling: validate both run directories exist, exit with a descriptive error if either is missing
- [x] 5.2 Generate `reports/compare-{idA}-{idB}.html`: same grid, each card split left/right with per-run canvas, score, and score delta (colored green for improvement, red for regression)

## 6. Claude Skill

- [x] 6.1 Create `.claude/commands/test-constellations.md` with the skill definition: argument parsing, pre-flight fixture check logic, runner invocation, Playwright screenshot steps, summary table format
- [x] 6.2 Document the Playwright steps in the skill: use MCP plugin if available, else `npx playwright`; full-page screenshot first, then individual screenshots for red-score cards
- [x] 6.3 Document the compare review flow in the skill: open compare HTML, full-page screenshot, list top 5 most-improved and top 5 most-degraded words

## 7. Validation

- [x] 7.1 Run the harness end-to-end: start `npm run dev:local` in `lambda/`, run `npx tsx test-harness/run.ts`, confirm `reports/v1/results.json` and `report.html` are generated
- [ ] 7.2 Open `report.html` in a browser and confirm all cards render correctly with canvases, score bars, and metrics
- [x] 7.3 Run compare mode: `npx tsx test-harness/run.ts --compare v1 v1` (self-compare, all deltas should be 0); confirm compare HTML renders
- [ ] 7.4 Invoke `/test-constellations` in a Claude session and confirm the full skill flow works end-to-end
