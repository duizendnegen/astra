## MODIFIED Requirements

### Requirement: Settings panel toggles three features
Clicking `#settings-btn` SHALL toggle the visibility of `#settings-panel`, a panel containing three labelled checkbox toggles: "Constellation image", "Match trail", and "Star labels". All three toggles SHALL be active and interactive.

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

## REMOVED Requirements

### Requirement: Star labels toggle is disabled
**Reason:** The "Star labels" feature is now fully implemented and wired to `features.showStarLabels`. The `disabled` attribute on `#feature-star-labels` is removed.
