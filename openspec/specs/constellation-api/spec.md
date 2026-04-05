## Requirements

### Requirement: POST /api/constellation returns complete render-ready result
The endpoint SHALL accept `POST /api/constellation` with a JSON body containing `word: string`
and optional `excludeSeeds?: number[]`. It SHALL run the retrieval pipeline followed by the
matcher and return a single JSON response with `constellation`, `skeleton`, and `match` fields.
The `constellation` field SHALL contain `constellationStars`, `edges`, `patchRA`, `patchDec`,
`shapeScore`, and `vertexFitScore`. The `skeleton` field SHALL contain `points` and `edges`
in normalised coordinates. The `match` field SHALL contain match provenance (`source`, `id`,
`similarity`, `layer`).

#### Scenario: Successful request returns all fields
- **WHEN** a POST request is sent with `{ "word": "orion" }`
- **THEN** the response has status 200 and a body containing `constellation`, `skeleton`, and `match` fields

#### Scenario: Missing word returns 400
- **WHEN** a POST request is sent with an empty body or missing `word` field
- **THEN** the response has status 400 with `{ "error": "word is required" }`

#### Scenario: excludeSeeds filters anchor stars
- **WHEN** a POST request is sent with `{ "word": "orion", "excludeSeeds": [123, 456] }`
- **THEN** stars with HYG IDs 123 and 456 SHALL NOT be used as anchor seeds during matching

#### Scenario: Repeated words with excludeSeeds skip cache
- **WHEN** the same word is requested twice, the second time with a non-empty `excludeSeeds`
- **THEN** the cached result is not used and matching runs fresh with the seed exclusions applied

### Requirement: Star catalogue loaded once at server startup
The server SHALL load `stars.json` from disk once at module initialisation (before handling any
request). The catalogue SHALL be held in memory for the lifetime of the process. If the file
cannot be loaded the server SHALL log an error and exit.

#### Scenario: Catalogue available on first request
- **WHEN** the server receives its first request after startup
- **THEN** the star catalogue is already in memory and no file I/O occurs per-request

#### Scenario: Missing catalogue file exits process
- **WHEN** `stars.json` cannot be found at the configured path
- **THEN** the server logs a fatal error and exits with a non-zero code
