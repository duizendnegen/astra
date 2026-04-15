## MODIFIED Requirements

### Requirement: Feature state loaded from localStorage
The system SHALL expose a `loadFeatures(): Features` function that reads the `astra-features` key from `localStorage` and returns a typed `Features` object. If the key is absent, unreadable, or invalid JSON, `loadFeatures` SHALL return the default `Features` object. The function SHALL be the single source of truth for flag state.

The system SHALL expose a `saveFeatures(features: Features): void` function that serialises the `Features` object and writes it to `localStorage` key `astra-features`. Both functions SHALL be pure with respect to any DOM or URL state.

#### Scenario: Key absent returns defaults
- **WHEN** `localStorage` contains no `astra-features` key
- **THEN** `loadFeatures()` returns the default `Features` object

#### Scenario: Valid key returns saved features
- **WHEN** `localStorage` contains a valid serialised `Features` object
- **THEN** `loadFeatures()` returns it

#### Scenario: Feature flags injectable in tests
- **WHEN** tests call `loadFeatures()` with a pre-seeded `localStorage` stub
- **THEN** each returns the correct `Features` object without requiring DOM or browser environment

## REMOVED Requirements

### Requirement: Runtime feature flags parsed from URL params
**Reason:** Feature flags are now managed through the settings panel backed by `localStorage`. URL params are no longer the source of truth for flag state, and `getFeatures(URLSearchParams)` is removed.
**Migration:** Replace all calls to `getFeatures(params)` with `loadFeatures()`. Remove URL param reads for `show_lines`, `show_stars`, and `render_mode`. Use `saveFeatures(features)` to persist changes from the settings panel.
