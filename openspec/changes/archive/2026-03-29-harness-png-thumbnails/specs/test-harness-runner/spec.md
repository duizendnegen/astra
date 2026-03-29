## MODIFIED Requirements

### Requirement: Matcher execution
For each word, the runner SHALL call `match(stars, skeletons.skeletons)` from `frontend/src/matcher.ts` using the full star catalogue. After matching, the runner SHALL call `renderPatch` and write the result to `reports/{runId}/{word}.png`.

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
