## ADDED Requirements

### Requirement: Three-skeleton side-by-side display
The vetting server SHALL display three skeleton canvases per word, one for each strategy (`concave-hull`, `polygon-union`, `subpath-components`), rendered side-by-side in the UI. Each canvas SHALL be labelled with its strategy name. All three skeletons SHALL be pre-computed at server startup and cached in memory.

#### Scenario: All three skeletons render on load
- **WHEN** the vetting UI loads a word that has a valid SVG
- **THEN** three skeleton canvases appear, each showing the skeleton for its respective strategy

#### Scenario: Failed strategy renders empty canvas
- **WHEN** a strategy returns null for a given SVG (e.g. degenerate input)
- **THEN** that canvas displays a "no skeleton" placeholder and the other two canvases render normally

### Requirement: Per-word strategy selection via keyboard
The operator SHALL be able to highlight a strategy using keyboard shortcuts `1`, `2`, `3` (corresponding to `concave-hull`, `polygon-union`, `subpath-components` respectively). The selected canvas SHALL be visually highlighted (e.g. coloured border). No strategy is pre-selected by default; the operator MUST select one before accepting.

#### Scenario: Key 1 highlights concave-hull
- **WHEN** the operator presses `1`
- **THEN** the `concave-hull` canvas is highlighted and the others are not

#### Scenario: Accept without selection is blocked
- **WHEN** the operator presses `A` without having selected a strategy
- **THEN** the accept action does not fire and a visual hint prompts strategy selection

#### Scenario: Pressing same key deselects
- **WHEN** the operator presses the same strategy key twice
- **THEN** the selection is cleared

### Requirement: Strategy persisted to CSV on accept
When the operator accepts a word, the `/api/decide` endpoint SHALL write the chosen `skeleton_strategy` value to the `words.csv` row for that word alongside the existing `status: 'accepted'` update.

#### Scenario: Accept records strategy
- **WHEN** operator selects strategy `2` and presses `A`
- **THEN** the word's CSV row has `status=accepted` and `skeleton_strategy=polygon-union`

#### Scenario: Retry clears strategy
- **WHEN** operator presses `R` to mark a word for retry
- **THEN** `skeleton_strategy` is set to empty string in the CSV row

### Requirement: skeleton_strategy column in words.csv
The `words.csv` file SHALL include a `skeleton_strategy` column on every row. Valid values are `concave-hull`, `polygon-union`, `subpath-components`, or empty string (not yet selected). Existing rows without this column SHALL be treated as having an empty value.

#### Scenario: New rows initialise with empty strategy
- **WHEN** a new word is added to words.csv via the pipeline
- **THEN** its `skeleton_strategy` field is empty string

#### Scenario: Accepted word has non-empty strategy
- **WHEN** a word is accepted via the vetting UI
- **THEN** its `skeleton_strategy` field contains one of the three valid strategy names
