## ADDED Requirements

### Requirement: Gear icon visible on landing screen only
The system SHALL render a gear icon button (`#settings-btn`) in the top-right corner of the viewport. The button SHALL be visible when the landing screen (`#landing`) is shown and hidden when the result panel (`#result`) is shown.

#### Scenario: Icon visible on landing
- **WHEN** the page loads with no constellation result
- **THEN** `#settings-btn` is visible in the top-right corner

#### Scenario: Icon hidden on result
- **WHEN** a constellation result is displayed and `#result` is shown
- **THEN** `#settings-btn` is not visible

### Requirement: Settings panel toggles three features
Clicking `#settings-btn` SHALL toggle the visibility of `#settings-panel`, a panel containing three labelled checkbox toggles: "Constellation image", "Match trail", and "Star labels". All three toggles SHALL be active and interactive.

#### Scenario: Panel opens on icon click
- **WHEN** the user clicks `#settings-btn`
- **THEN** `#settings-panel` becomes visible

#### Scenario: Panel closes on second click
- **WHEN** `#settings-panel` is visible and the user clicks `#settings-btn` again
- **THEN** `#settings-panel` is hidden

#### Scenario: Star labels toggle is active
- **WHEN** `#settings-panel` is open
- **THEN** the "Star labels" checkbox does NOT have the `disabled` attribute and can be clicked

#### Scenario: Toggle star labels on
- **WHEN** the user checks "Star labels" with a constellation result visible
- **THEN** `features.showStarLabels` becomes `true`, `saveFeatures` is called, and star name labels appear on `constellationStars` immediately

#### Scenario: Toggle star labels off
- **WHEN** the user unchecks "Star labels"
- **THEN** `features.showStarLabels` becomes `false`, `saveFeatures` is called, and labels disappear immediately

#### Scenario: Star labels setting persists across reload
- **WHEN** the user enables "Star labels" and reloads the page
- **THEN** the checkbox is checked on load and star names are available without a second toggle

### Requirement: Feature state persists to localStorage
`loadFeatures()` SHALL read the features object from `localStorage` key `astra-features` and return it; if the key is absent or unparseable, it SHALL return the defaults (`showConstellationImage: false`, `showAssociation: false`, `showStarLabels: false`). `saveFeatures(features)` SHALL serialise the features object and write it to `localStorage` key `astra-features`. Both functions SHALL wrap localStorage access in try/catch and fall back to in-memory defaults if storage is unavailable.

#### Scenario: First load returns defaults
- **WHEN** `loadFeatures()` is called and `localStorage` contains no `astra-features` key
- **THEN** it returns `{ showConstellationImage: false, showAssociation: false, showStarLabels: false }`

#### Scenario: Saved features survive reload
- **WHEN** `saveFeatures({ showConstellationImage: true, showAssociation: false, showStarLabels: false })` is called and the page is reloaded
- **THEN** `loadFeatures()` returns `{ showConstellationImage: true, showAssociation: false, showStarLabels: false }`

#### Scenario: Corrupt localStorage returns defaults
- **WHEN** `localStorage.astra-features` contains invalid JSON
- **THEN** `loadFeatures()` returns the default object without throwing

#### Scenario: Storage unavailable falls back to defaults
- **WHEN** `localStorage` access throws (e.g. private mode restriction)
- **THEN** `loadFeatures()` returns defaults and `saveFeatures()` silently discards the write

### Requirement: Toggling a checkbox immediately saves and applies the feature
Changing a checkbox state in `#settings-panel` SHALL call `saveFeatures()` with the updated features and immediately apply the new state to the current render without requiring a page reload.

#### Scenario: Toggle constellation image on
- **WHEN** the user checks "Constellation image" while a result is displayed
- **THEN** the SVG overlay becomes visible immediately

#### Scenario: Toggle match trail off
- **WHEN** the user unchecks "Match trail" while the association panel is visible
- **THEN** the association panel is hidden immediately

## REMOVED Requirements

### Requirement: Star labels toggle is disabled
**Reason:** The "Star labels" feature is now fully implemented and wired to `features.showStarLabels`. The `disabled` attribute on `#feature-star-labels` is removed.
