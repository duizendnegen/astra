## Requirements

### Requirement: Per-run diagnostics file written alongside results

After each suite run, the test harness SHALL write a file
`reports/{runId}/diagnostics.json` containing one `WordDiagnostic` record per processed word.
The file SHALL be written atomically (all words) after the run completes, not streamed per-word.

#### Scenario: Diagnostics file created for every run
- **WHEN** a suite run completes (with or without matches)
- **THEN** `reports/{runId}/diagnostics.json` exists and contains one record per word

#### Scenario: No-match words have a diagnostics record
- **WHEN** `match()` returns null for a word
- **THEN** the diagnostics record for that word has `matched: false` and null/empty fields for
  match-specific data

### Requirement: WordDiagnostic record structure

Each `WordDiagnostic` record SHALL contain the following fields:

**Run context:**
- `word: string` — the word processed
- `generator: string` — effective generator used (`'anchor-pair' | 'single-sweep' | 'any-vertex'`)
- `scorer: string` — effective scorer used
- `matched: boolean`

**Phase counts (null when not matched):**
- `phase1Candidates: number | null` — candidates entering Phase 2
- `phase2Candidates: number | null` — candidates entering Phase 3
- `phase3Candidates: number | null` — candidates evaluated in Phase 3

**Winning placement (null when not matched):**
- `seedStarId: number | null`
- `seedRA: number | null`
- `seedDec: number | null`
- `physVerts: [number, number][] | null` — winning candidate physical vertex positions

**Star pool:**
- `nearbyStarCount: number | null` — size of nearby union set used for winning candidate

**Scores (null when not matched):**
- `shapeScore: number | null`
- `vertexFitScore: number | null`
- `procrustesScore: number | null`

**Per-vertex assignments (empty array when not matched):**
- `vertexAssignments: VertexAssignment[]`

Each `VertexAssignment` SHALL contain:
- `vertexIndex: number`
- `physVertRA: number` — ideal vertex position (RA, degrees)
- `physVertDec: number` — ideal vertex position (Dec, degrees)
- `assignedStarId: number`
- `assignedStarRA: number`
- `assignedStarDec: number`
- `distanceDeg: number` — haversine distance between assigned star and ideal vertex
- `distanceNormBySpan: number` — `distanceDeg / span` (span = max pairwise physVerts distance)

#### Scenario: Vertex assignment detail captured
- **WHEN** a match is found for `guitar` with 15 vertices
- **THEN** `vertexAssignments` contains exactly 15 entries, one per skeleton vertex

#### Scenario: Distances computed in degrees
- **WHEN** vertex 3 ideal position is (102.3°, 8.1°) and assigned star is at (102.5°, 8.0°)
- **THEN** `distanceDeg ≈ 0.22°` (haversine distance)

### Requirement: Matcher exposes per-phase counts for diagnostic capture

The `match()` function SHALL return phase candidate counts on `MatchResult` so the test harness
can record them without re-running the matcher:
- `phase1Candidates: number` — how many candidates entered Phase 2
- `phase2Candidates: number` — how many candidates entered Phase 3
- `phase3Candidates: number` — how many candidates were evaluated in Phase 3

These fields SHALL be added to `MatchResult` in `lambda/src/types.ts`.

#### Scenario: Phase counts in MatchResult
- **WHEN** a match is found
- **THEN** `result.phase1Candidates`, `result.phase2Candidates`, `result.phase3Candidates` are
  all non-negative integers

### Requirement: diagnostics.json does not block the run on failure

Writing `diagnostics.json` SHALL be best-effort. If the write fails (e.g. permissions error)
the harness SHALL log a warning and continue — the main results file and PNGs take priority.

#### Scenario: Write failure is non-fatal
- **WHEN** the diagnostics write throws an error
- **THEN** the run completes normally and results.json is still written

### Requirement: MatchResult exposes diversity-selection metrics
`MatchResult` in `lambda/src/types.ts` SHALL gain five optional fields populated by `match()` whenever a match is found:

- `selectedScore?: number` — composite score of the selected placement (may differ from `topScore` when diversity selection chose a sky-distant candidate)
- `topScore?: number` — composite score of the highest-scoring candidate in the pool
- `nextBestScore?: number` — composite score of the second-highest candidate in the pool (undefined if pool has only one entry)
- `acceptableCount?: number` — number of candidates with `score >= topScore * (1 - DIVERSITY_TOLERANCE)` (the acceptable band)
- `distantCount?: number` — number of acceptable candidates whose sky centre is ≥ `DIVERSITY_MIN_DEG` from the champion

These fields SHALL be populated from the values already computed in the diversity-selection block of `match()` with no additional algorithmic work.

#### Scenario: All five fields present on successful match
- **WHEN** `match()` returns a non-null result
- **THEN** `selectedScore`, `topScore`, `acceptableCount`, and `distantCount` are all defined non-negative numbers

#### Scenario: nextBestScore undefined for single-candidate pool
- **WHEN** the pool contains exactly one candidate after Phase 3
- **THEN** `nextBestScore` is undefined

#### Scenario: selectedScore equals topScore when diversity not applied
- **WHEN** no distant acceptable candidates exist and the champion is selected
- **THEN** `selectedScore === topScore`

#### Scenario: selectedScore less than topScore when diversity applied
- **WHEN** a distant acceptable candidate is selected over the champion
- **THEN** `selectedScore < topScore` and `distantCount >= 1`

### Requirement: WordDiagnostic carries diversity-selection fields
The `WordDiagnostic` record written by the test harness SHALL include the five new `MatchResult` fields when available: `selectedScore`, `topScore`, `nextBestScore`, `acceptableCount`, `distantCount`. These SHALL be passed through from `MatchResult` in `run.ts` and written to `diagnostics.json`.

#### Scenario: Diagnostics include score fields on match
- **WHEN** a word is matched and diagnostics are written
- **THEN** the `WordDiagnostic` record for that word includes non-null `selectedScore`, `topScore`, `acceptableCount`, and `distantCount`
