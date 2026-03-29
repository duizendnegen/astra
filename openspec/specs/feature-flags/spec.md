## ADDED Requirements

### Requirement: Runtime feature flags parsed from URL params
The system SHALL expose a `getFeatures(params: URLSearchParams)` function that returns a typed `Features` object with boolean fields for each flag. The function SHALL be the single source of truth for flag state and SHALL be pure (no side effects, no global reads).

#### Scenario: show_lines flag active
- **WHEN** URL contains `?show_lines=1`
- **THEN** `getFeatures(params).showLines` is `true`

#### Scenario: show_stars flag active
- **WHEN** URL contains `?show_stars=1`
- **THEN** `getFeatures(params).showStars` is `true`

#### Scenario: flags absent
- **WHEN** URL contains neither `?show_lines` nor `?show_stars`
- **THEN** both `showLines` and `showStars` are `false`

#### Scenario: flags are independent
- **WHEN** URL contains `?show_lines=1` but not `?show_stars=1`
- **THEN** `showLines` is `true` and `showStars` is `false`

### Requirement: Feature flags injectable in tests
The system SHALL allow tests to supply arbitrary `URLSearchParams` to `getFeatures` without mutating `window.location` or any global state.

#### Scenario: All four flag combinations testable
- **WHEN** tests call `getFeatures` with each of the four combinations of `show_lines` and `show_stars`
- **THEN** each returns the correct `Features` object without requiring DOM or browser environment
