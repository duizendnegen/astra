## ADDED Requirements

### Requirement: Association panel renders below RA/Dec when feature is enabled
When the "association" feature is enabled and a constellation result is available, the system SHALL render `#association-panel` below `#coord-panel` containing a single text line summarising the retrieval path. The panel SHALL be hidden when the feature is disabled or no result is shown.

#### Scenario: Association panel visible with feature on
- **WHEN** a constellation result is displayed and `showAssociation` is `true`
- **THEN** `#association-panel` is visible below `#coord-panel`

#### Scenario: Association panel hidden with feature off
- **WHEN** `showAssociation` is `false`
- **THEN** `#association-panel` is not visible regardless of result state

#### Scenario: Panel cleared on result close
- **WHEN** the result panel is closed
- **THEN** `#association-panel` content is cleared

### Requirement: L1 direct match shows layer and icon identity
When `match.layer === 1` and `showAssociation` is `true`, `#association-panel` SHALL display: `L1 · direct — <id> @ <similarity rounded to 2 dp>`.

#### Scenario: L1 result renders correctly
- **WHEN** the constellation response has `match.layer === 1` and `match.similarity === 0.913`
- **THEN** `#association-panel` shows text matching the pattern `L1 · direct — <id> @ 0.91`

### Requirement: L3 result shows synonym trial trail
When `match.layer === 3` and `showAssociation` is `true`, `#association-panel` SHALL display: `L3 · <word> →` followed by each entry in `match.trail` in order. Missed candidates SHALL be rendered in a muted style; the hit candidate SHALL be rendered with its similarity score highlighted.

#### Scenario: L3 trail with one miss and one hit
- **WHEN** `match.layer === 3`, `match.trail` is `[{candidate:"hawk", hitId:null, sim:null}, {candidate:"feather", hitId:"phosphor:feather", sim:0.83}]`
- **THEN** the panel shows "hawk" in muted style followed by "feather" with "0.83" highlighted

#### Scenario: All-miss trail (no hit recorded)
- **WHEN** `match.layer === 3` and all `trail` entries have `hitId: null`
- **THEN** all candidates are shown in muted style (this is a data-integrity edge case; the panel still renders)

### Requirement: L4 generated result shows generation notice
When `match.layer === 4` and `showAssociation` is `true`, `#association-panel` SHALL display: `L4 · generated — no icon match`.

#### Scenario: L4 result renders correctly
- **WHEN** the constellation response has `match.layer === 4`
- **THEN** `#association-panel` shows text matching `L4 · generated — no icon match`
