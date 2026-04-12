## MODIFIED Requirements

### Requirement: Runtime feature flags parsed from URL params
The system SHALL expose a `getFeatures(params: URLSearchParams)` function that returns a typed `Features` object. The function SHALL be the single source of truth for flag state and SHALL be pure (no side effects, no global reads).

`showStars` SHALL be typed as `false | 'named' | 'constellation'`:
- `show_stars=1` → `'named'` (existing behaviour: 20 hardcoded named stars shown)
- `show_stars=constellation` → `'constellation'` (new: matched constellation star labels shown)
- absent or any other value → `false`

#### Scenario: show_lines flag active
- **WHEN** URL contains `?show_lines=1`
- **THEN** `getFeatures(params).showLines` is `true`

#### Scenario: show_stars=1 returns named mode
- **WHEN** URL contains `?show_stars=1`
- **THEN** `getFeatures(params).showStars` is `'named'`

#### Scenario: show_stars=constellation returns constellation mode
- **WHEN** URL contains `?show_stars=constellation`
- **THEN** `getFeatures(params).showStars` is `'constellation'`

#### Scenario: show_stars absent returns false
- **WHEN** URL contains no `show_stars` param
- **THEN** `getFeatures(params).showStars` is `false`

#### Scenario: flags absent
- **WHEN** URL contains neither `?show_lines` nor `?show_stars`
- **THEN** `showLines` is `false` and `showStars` is `false`

#### Scenario: flags are independent
- **WHEN** URL contains `?show_lines=1` but not `?show_stars`
- **THEN** `showLines` is `true` and `showStars` is `false`

### Requirement: Feature flags injectable in tests
The system SHALL allow tests to supply arbitrary `URLSearchParams` to `getFeatures` without mutating `window.location` or any global state.

#### Scenario: All showStars modes testable
- **WHEN** tests call `getFeatures` with `show_stars=1`, `show_stars=constellation`, and absent
- **THEN** each returns the correct `showStars` value (`'named'`, `'constellation'`, `false`) without requiring DOM or browser environment
