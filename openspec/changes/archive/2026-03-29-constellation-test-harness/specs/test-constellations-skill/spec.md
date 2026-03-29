## ADDED Requirements

### Requirement: Skill invocation and argument parsing
The `/test-constellations` skill SHALL accept two optional argument forms:
- `[--run-id <id>]` — override the auto-assigned run ID
- `[--compare <id-a> <id-b>]` — generate and view a comparison report instead of running the suite

#### Scenario: No arguments
- **WHEN** the skill is invoked with no arguments
- **THEN** Claude runs the full suite with an auto-assigned run ID

#### Scenario: Explicit run ID
- **WHEN** the skill is invoked with `--run-id my-label`
- **THEN** Claude passes `--run-id my-label` to the runner script

#### Scenario: Compare mode
- **WHEN** the skill is invoked with `--compare v2 v3`
- **THEN** Claude generates `compare-v2-v3.html` and enters the compare review flow

### Requirement: Pre-flight fixture check
Before running the suite, Claude SHALL identify all words lacking a fixture file and handle them:
- If fixtures are missing and `localhost:3001` is reachable: generate them by POSTing to the API
- If fixtures are missing and `localhost:3001` is not reachable: stop and instruct the user to run `npm run dev:local` in the `lambda/` directory before retrying

#### Scenario: All fixtures present
- **WHEN** all word fixture files exist
- **THEN** Claude proceeds directly to running the suite without any API calls

#### Scenario: Some fixtures missing, API up
- **WHEN** three words are missing fixtures and the API is reachable
- **THEN** Claude generates the three missing fixtures, then runs the suite

#### Scenario: Fixtures missing, API down
- **WHEN** any fixture is missing and `localhost:3001` returns a connection error
- **THEN** Claude stops and outputs: "Start the local API first: `npm run dev:local` (in `lambda/`), then re-run this skill."

### Requirement: Suite execution
Claude SHALL execute the runner script using `npx tsx test-harness/run.ts [--run-id <id>]` and wait for it to complete.

#### Scenario: Runner completes successfully
- **WHEN** the runner exits with code 0
- **THEN** Claude proceeds to the visual review step

#### Scenario: Runner fails
- **WHEN** the runner exits with a non-zero code
- **THEN** Claude reports the error output and stops

### Requirement: Visual review via Playwright
After a successful run, Claude SHALL use Playwright to open `test-harness/reports/{runId}/report.html` and capture screenshots. Claude SHALL use the Playwright MCP plugin if available in the current session; otherwise use the locally installed `@playwright/test` CLI.

#### Scenario: Full overview screenshot
- **WHEN** the report opens successfully
- **THEN** Claude takes a full-page screenshot and displays it in the conversation

#### Scenario: Red-score zoom
- **WHEN** any word card has a red score (< 65%)
- **THEN** Claude takes an additional screenshot zoomed to that card and includes it in the report

### Requirement: In-conversation summary report
Claude SHALL output a markdown summary table after visual review, covering every word with columns: Word, Score, Stars, Size°, Orion%, and a Notes column flagging anomalies (red score, small size, unexpected result).

#### Scenario: Summary table
- **WHEN** the visual review is complete
- **THEN** Claude outputs a markdown table with one row per word and qualitative observations below it

### Requirement: Compare review flow
In compare mode, Claude SHALL open the compare HTML, take a full-page screenshot, and produce a summary highlighting words with the largest score deltas (positive and negative).

#### Scenario: Compare summary
- **WHEN** compare mode completes
- **THEN** Claude lists the top 5 most-improved and top 5 most-degraded words with their score deltas
