## Requirements

### Requirement: Self-contained report HTML
The runner SHALL generate `test-harness/reports/{runId}/report.html` — a single file with all result data and patch stars embedded as JSON in a `<script>` tag. It SHALL load D3 from CDN for projection and require no other external resources.

#### Scenario: Report opens without a server
- **WHEN** Playwright (or a browser) opens `report.html` as a `file://` URL
- **THEN** the page renders fully without network requests (except the D3 CDN script tag)

### Requirement: Grid layout
The report SHALL display all words in a responsive grid. Each card SHALL be approximately 200×180px.

#### Scenario: Grid renders all words
- **WHEN** the report HTML is opened
- **THEN** every word from the run appears as a card in the grid

### Requirement: Word card content
Each word card SHALL contain:
1. The word as a bold heading
2. A ~150×130px canvas showing: faint background stars (patch stars), brighter matched stars, pale blue skeleton edges connecting constellation stars
3. A score bar colored green (≥80%), amber (≥65%), or red (<65%)
4. Metric labels: matched star count and angular size in degrees
5. A ⚠️ flag if angular size < 2.5° (less than 10% of Orion's ~25°)

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

### Requirement: Report header
The report SHALL include a header showing: run ID, generation date, total word count, count of green passes (≥80%), count of red fails (<65%).

#### Scenario: Header summary
- **WHEN** a run has 34 words ≥80% and 3 words <65%
- **THEN** the header displays "✓ 34  ✗ 3" (or equivalent)

### Requirement: Compare report
The runner SHALL generate `test-harness/reports/compare-{idA}-{idB}.html` when invoked with `--compare <idA> <idB>`. This report SHALL use the same grid layout but split each card vertically: left half shows run A, right half shows run B.

#### Scenario: Compare card shows delta
- **WHEN** a word's score changes between runs
- **THEN** the card displays the delta (e.g. "+3%" in green, "-8%" in red)

#### Scenario: Missing run
- **WHEN** `--compare` is used and one of the run directories does not exist
- **THEN** the runner exits with a descriptive error naming the missing run ID
