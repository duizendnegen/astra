## MODIFIED Requirements

### Requirement: Self-contained report HTML
The runner SHALL generate `test-harness/reports/{runId}/report.html`. It SHALL load D3 from CDN and embed run metadata as JSON. Patch star data SHALL NOT be embedded in the HTML — thumbnails are served as separate PNG files. The report SHALL require a local server (or file access) to display images.

#### Scenario: Report opens via local server
- **WHEN** Playwright (or a browser) opens `report.html` via `http://localhost:PORT`
- **THEN** the page renders fully with all thumbnail images visible

### Requirement: Word card content
Each word card SHALL contain:
1. The word as a bold heading
2. A thumbnail image (`<img src="./{word}.png">`) at ≥300px wide showing the patch render
3. A score bar colored green (≥80%), amber (≥65%), or red (<65%)
4. Metric labels: matched star count and angular size in degrees
5. A ⚠️ flag if angular size < 2.5°

#### Scenario: Green card
- **WHEN** a word has score ≥ 80%
- **THEN** its score bar is rendered in green

#### Scenario: Amber card
- **WHEN** a word has score ≥ 65% and < 80%
- **THEN** its score bar is rendered in amber

#### Scenario: Red card
- **WHEN** a word has score < 65%
- **THEN** its score bar is rendered in red

#### Scenario: Small constellation warning
- **WHEN** a word's matched constellation spans less than 2.5°
- **THEN** the card displays a ⚠️ symbol alongside the size metric

### Requirement: Grid layout
The report SHALL display all words in a responsive grid. Each card SHALL be approximately 320px wide to accommodate the larger thumbnails.

#### Scenario: Grid renders all words
- **WHEN** the report HTML is opened
- **THEN** every word from the run appears as a card in the grid

### Requirement: Report header
The report SHALL include a header showing: run ID, generation date, total word count, count of green passes (≥80%), count of red fails (<65%).

#### Scenario: Header summary
- **WHEN** a run has 34 words ≥80% and 3 words <65%
- **THEN** the header displays "✓ 34  ✗ 3" (or equivalent)

### Requirement: Compare report
The runner SHALL generate `test-harness/reports/compare-{idA}-{idB}.html` when invoked with `--compare <idA> <idB>`. Each card SHALL show both thumbnails side by side using `<img>` tags referencing the respective run directories (e.g. `../{idA}/{word}.png` and `../{idB}/{word}.png`). Each thumbnail SHALL be ≥200px wide.

#### Scenario: Compare card shows delta
- **WHEN** a word's score changes between runs
- **THEN** the card displays the delta (e.g. "+3%" in green, "-8%" in red)

#### Scenario: Missing run
- **WHEN** `--compare` is used and one of the run directories does not exist
- **THEN** the runner exits with a descriptive error naming the missing run ID
