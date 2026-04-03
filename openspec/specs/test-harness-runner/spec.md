## Requirements

### Requirement: Word list
The harness SHALL maintain a word list in `test-harness/words.ts` organised into five categories that exercise distinct pipeline layers. The list SHALL always be run in full; subsetting is not supported.

Categories:
- **A — direct index match** (should hit L1): wolf, eagle, mushroom, guitar, crown, anchor, bicycle, butterfly, shark, telescope, sloth, oak
- **B — near-match** (should hit L1 via embedding proximity): hound, automobile, spectacles
- **C — concept mapping + translation** (should hit L3): justice, Beethoven, capitalism, melancholy, pirate, Faultier, Löwe, Fernsehturm
- **D — no index match** (should fall through to L4): eternity, quantum, bureaucracy, serendipity
- **E — edge cases** (multiple valid shapes or cross-source candidates): mercury, star

#### Scenario: Word list is imported by the runner
- **WHEN** `run.ts` starts
- **THEN** it imports the word list from `words.ts` and processes every word across all categories

#### Scenario: Category metadata available in results
- **WHEN** the runner completes
- **THEN** each entry in `results.json` includes the word's category (A–E) and the pipeline layer that fired (1, 3, 4, or "fallback")

### Requirement: Fixture caching
The harness SHALL store skeleton fixtures in `test-harness/fixtures/{word}.json`, each containing `{ skeletons: Skeleton[] }` matching the response shape of `POST /api/skeleton`. Fixture files SHALL be committed to git.

#### Scenario: Fixture exists
- **WHEN** the runner processes a word and `fixtures/{word}.json` exists
- **THEN** the runner loads it from disk without calling the API

#### Scenario: Fixture missing
- **WHEN** the runner processes a word and `fixtures/{word}.json` does not exist
- **THEN** the runner POSTs `{ word }` to `http://localhost:3001/api/skeleton`, writes the response to `fixtures/{word}.json`, and continues

#### Scenario: API unreachable and fixture missing
- **WHEN** the runner processes a word, the fixture is missing, and `localhost:3001` is not reachable
- **THEN** the runner exits with a descriptive error message instructing the user to start the local API

### Requirement: Matcher execution
For each word, the runner SHALL call `match(stars, skeletons.skeletons)` from `frontend/src/matcher.ts` using the full star catalogue loaded from `frontend/public/data/stars.json`. After matching, the runner SHALL call `renderPatch` and write the result to `reports/{runId}/{word}.png`.

#### Scenario: Successful match
- **WHEN** the matcher returns a result
- **THEN** the runner records all metrics AND writes `{word}.png` to the run directory

#### Scenario: No match found
- **WHEN** `match()` returns null
- **THEN** the runner records score=0, writes a "no match" placeholder PNG to `{word}.png`

### Requirement: PNG files saved to run directory
For every word processed, the runner SHALL write `reports/{runId}/{word}.png` using the output of `renderPatch`. PNG files SHALL be written at 300×300px resolution.

#### Scenario: PNG files exist after run
- **WHEN** the runner completes all words
- **THEN** `reports/{runId}/` contains one `.png` file per word in the word list

### Requirement: Run ID assignment
The runner SHALL accept `--run-id <id>` as a CLI argument. If omitted, it SHALL auto-assign the next ID by scanning `test-harness/reports/` for existing `v{N}` directories and using `v{N+1}`.

#### Scenario: Auto-increment
- **WHEN** `--run-id` is not provided and `reports/v1` and `reports/v2` exist
- **THEN** the runner uses `v3`

#### Scenario: First run
- **WHEN** `--run-id` is not provided and `reports/` is empty
- **THEN** the runner uses `v1`

#### Scenario: Explicit ID
- **WHEN** `--run-id my-label` is provided
- **THEN** the runner uses `my-label` as the run directory name

### Requirement: Results output
The runner SHALL write `test-harness/reports/{runId}/results.json` containing an array of per-word result objects and a run metadata header (run ID, date, word count, pass/fail counts).

#### Scenario: Results file written
- **WHEN** the runner completes all words
- **THEN** `reports/{runId}/results.json` exists and contains one entry per word with all collected metrics
