# /test-constellations

Run the constellation test harness, screenshot the report with Playwright, and produce a markdown summary.

## Arguments

- `[--run-id <id>]` — override the auto-assigned run ID (default: next v{N})
- `[--compare <id-a> <id-b>]` — generate and review a compare report instead of running

## Instructions

### Compare mode (`--compare <id-a> <id-b>`)

1. Run: `npx tsx test-harness/run.ts --compare <id-a> <id-b>`
2. Open `test-harness/reports/compare-<id-a>-<id-b>.html` with Playwright
3. Take a full-page screenshot and show it
4. From `results.json` for each run, compute per-word score deltas
5. Output: top 5 most-improved and top 5 most-degraded words with their score deltas

### Run mode (default)

**Step 1 — Pre-flight fixture check**

List all words from `test-harness/words.ts`. For each word, check if `test-harness/fixtures/{word}.json` exists.

If any fixtures are missing:
- Try to reach `localhost:3001` with a GET or OPTIONS request
- If **unreachable**: stop and output:
  ```
  Start the local API first: `cd lambda && npm run dev:local`, then re-run this skill.
  ```
- If **reachable**: generate missing fixtures by POSTing to `http://localhost:3001/api/skeleton`:
  ```bash
  # For each missing word:
  curl -s -X POST http://localhost:3001/api/skeleton \
    -H 'Content-Type: application/json' \
    -d '{"word":"<word>"}' \
    > test-harness/fixtures/<word>.json
  ```
  Confirm each fixture was saved before proceeding.

**Step 2 — Run the suite**

```bash
npx tsx test-harness/run.ts [--run-id <id>]
```

Wait for it to complete. If it exits non-zero, report the error and stop.

Note the run ID from the output (e.g. `Run ID: v3`).

**Step 3 — Visual review with Playwright**

Open `test-harness/reports/{runId}/report.html` in a browser using the Playwright MCP plugin (if available in this session) or `npx playwright`:

- Take a **full-page screenshot** and show it in the conversation
- For each word card with a red score (< 65%), take an additional screenshot zoomed to that card

If the D3 CDN is unreachable and canvases are blank, note this but continue with the JSON summary.

**Step 4 — Output markdown summary table**

Read `test-harness/reports/{runId}/results.json` and output:

```markdown
## Constellation Test Run: {runId}

| Word | Score | Stars | Size° | Orion% | Notes |
|------|-------|-------|-------|--------|-------|
| dog  | 84%   | 12    | 8.2°  | 33%    |       |
| ...  | ...   | ...   | ...   | ...    |       |
```

Notes column should flag:
- 🔴 red score (< 65%)
- ⚠️ small size (< 2.5°)
- ❓ no match (score = 0)
- Any other anomalies worth noting

End with a brief qualitative paragraph on overall quality and notable patterns.
