## MODIFIED Requirements

### Requirement: Feature state loaded from localStorage
The system SHALL expose a `loadFeatures(): Features` function that reads the `astra-features` key from `localStorage` and returns a typed `Features` object. If the key is absent, unreadable, or invalid JSON, `loadFeatures` SHALL return the default `Features` object. The function SHALL be the single source of truth for flag state.

The system SHALL expose a `saveFeatures(features: Features): void` function that serialises the `Features` object and writes it to `localStorage` key `astra-features`. Both functions SHALL be pure with respect to any DOM or URL state.

`Features` SHALL contain `showStarLabels: boolean` (default `false`) as the single toggle for constellation star labels. The `showStars` field is removed.

#### Scenario: Key absent returns defaults
- **WHEN** `localStorage` contains no `astra-features` key
- **THEN** `loadFeatures()` returns `{ showStarLabels: false, showConstellationImage: false, showAssociation: false }`

#### Scenario: showStarLabels persisted and restored
- **WHEN** `saveFeatures({ ...defaults, showStarLabels: true })` is called and the page reloads
- **THEN** `loadFeatures()` returns `showStarLabels: true`

#### Scenario: Feature flags injectable in tests
- **WHEN** tests pre-seed `localStorage` and call `loadFeatures()`
- **THEN** the correct `Features` object is returned without requiring DOM or browser environment

## REMOVED Requirements

### Requirement: showStars URL param modes
**Reason:** `showStars: false | 'named' | 'constellation'` is removed from `Features`. Star labels are now controlled by `showStarLabels: boolean` via the settings panel. The `'named'` mode had no UI entry point and is dropped along with `drawNamedStars()`.
**Migration:** Replace all guards on `features.showStars === 'constellation'` with `features.showStarLabels`. Remove `drawNamedStars()` call and function body.
