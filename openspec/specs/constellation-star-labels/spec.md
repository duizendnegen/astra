## Requirements

### Requirement: Star name data loaded from static asset
The system SHALL load star names from `frontend/public/data/star-names.json` — a `{ [hipId: string]: string }` map produced by the `generate-star-names` build script. The map SHALL use proper names where available (HYG `proper` column), falling back to Bayer designation formatted as `"α Ori"` style.

Loading SHALL occur:
- **Eagerly** at boot when `loadFeatures().showStarLabels` is `true` (returning user with the setting persisted)
- **Lazily** on first toggle-on from the settings panel; result cached in module scope

#### Scenario: Names available after load
- **WHEN** `loadStarNames()` resolves
- **THEN** a `Map<number, string>` is available mapping HIP IDs to display names

#### Scenario: Star with proper name
- **WHEN** the map is queried for HIP 32263
- **THEN** it returns `"Sirius"`

#### Scenario: Star with Bayer only
- **WHEN** the map is queried for a star with no proper name but a Bayer designation
- **THEN** it returns the Bayer designation formatted with a Unicode Greek letter (e.g. `"β Ori"`)

#### Scenario: Unknown star
- **WHEN** the map is queried for a HIP ID not in the dataset
- **THEN** it returns `undefined`

### Requirement: Matched constellation stars labelled when star labels are on
When `features.showStarLabels` is `true`, the system SHALL render a text label beside each matched constellation star (`constellationStars`) using the name from the star names map. Stars with no entry in the map SHALL be drawn without a label. Labels SHALL fade in and out with `constellationAlpha` alongside the rest of the constellation rendering.

#### Scenario: Labels visible with star labels on
- **WHEN** the settings panel "Star labels" checkbox is checked and a constellation is matched
- **THEN** each `constellationStar` with a known name has a text label rendered beside its dot

#### Scenario: Unnamed matched stars render without label
- **WHEN** `showStarLabels` is `true` and a constellation star has no entry in the name map
- **THEN** the star dot and glow render normally with no label

#### Scenario: Labels absent when star labels off
- **WHEN** `showStarLabels` is `false`
- **THEN** no constellation-star labels are rendered

### Requirement: Star name build script produces star-names.json
The system SHALL include a `scripts/generate-star-names.ts` script that reads a local HYG database CSV, filters to HIP IDs present in `stars.json`, and writes `frontend/public/data/star-names.json`. The script SHALL prefer the `proper` column value; when absent or empty it SHALL derive a Bayer label from the `bf` column by expanding the three-letter Greek abbreviation to its Unicode character and appending the constellation abbreviation.

#### Scenario: Proper name preferred
- **WHEN** a HYG row has a non-empty `proper` field
- **THEN** `star-names.json` maps that HIP ID to the proper name

#### Scenario: Bayer fallback
- **WHEN** a HYG row has an empty `proper` field but a non-empty `bf` field
- **THEN** `star-names.json` maps that HIP ID to a formatted Bayer string (e.g. `"α Ori"`)

#### Scenario: Star absent from catalogue excluded
- **WHEN** a HYG row's HIP ID is not in `stars.json`
- **THEN** that entry is not written to `star-names.json`
