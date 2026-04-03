## ADDED Requirements

### Requirement: vertex-penalty accepted as valid model
The harness `VALID_MODELS` array SHALL include `'vertex-penalty'`. Passing `--model vertex-penalty` SHALL not exit with an error.

#### Scenario: vertex-penalty model runs full suite
- **WHEN** `npm run harness -- --model vertex-penalty` is executed
- **THEN** all words in the suite are processed and a report is written without validation errors

### Requirement: renderMode parameter for thumbnail generation
The `renderPatch` function used to generate PNG thumbnails SHALL accept an optional `renderMode: 'skeleton' | 'stars'` parameter (default `'skeleton'`). When `renderMode` is `'stars'`, thumbnails SHALL draw lines between constellation star positions rather than skeleton positions.

#### Scenario: Default thumbnails use skeleton lines
- **WHEN** harness runs without a render mode flag
- **THEN** PNG thumbnails show constellation lines at skeleton positions

#### Scenario: stars mode thumbnails connect star dots
- **WHEN** harness runs with `--render-mode stars`
- **THEN** PNG thumbnails show constellation lines connecting actual star dot positions
