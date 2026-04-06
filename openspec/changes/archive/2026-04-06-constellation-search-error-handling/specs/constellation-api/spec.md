## MODIFIED Requirements

### Requirement: POST /api/constellation returns complete render-ready result
The endpoint SHALL accept `POST /api/constellation` with a JSON body containing `word: string`
and optional `excludeSeeds?: number[]`. It SHALL run the retrieval pipeline followed by the
matcher and return a single JSON response with `constellation`, `skeleton`, and `match` fields.
The `constellation` field SHALL contain `constellationStars`, `edges`, `patchRA`, `patchDec`,
`shapeScore`, and `vertexFitScore`. The `skeleton` field SHALL contain `points` and `edges`
in normalised coordinates. The `match` field SHALL contain match provenance (`source`, `id`,
`similarity`, `layer`).

When the retrieval pipeline returns `TRIANGLE_FALLBACK` (all layers failed), the endpoint SHALL
return HTTP 422 with body `{ "error": "No constellation found." }` instead of a 200 response.

#### Scenario: Successful request returns all fields
- **WHEN** a POST request is sent with `{ "word": "orion" }`
- **THEN** the response has status 200 and a body containing `constellation`, `skeleton`, and `match` fields

#### Scenario: Missing word returns 400
- **WHEN** a POST request is sent with an empty body or missing `word` field
- **THEN** the response has status 400 with `{ "error": "word is required" }`

#### Scenario: No constellation found returns 422
- **WHEN** the retrieval pipeline returns TRIANGLE_FALLBACK for the given word
- **THEN** the response has status 422 with `{ "error": "No constellation found." }`

#### Scenario: excludeSeeds filters anchor stars
- **WHEN** a POST request is sent with `{ "word": "orion", "excludeSeeds": [123, 456] }`
- **THEN** stars with HYG IDs 123 and 456 SHALL NOT be used as anchor seeds during matching

#### Scenario: Repeated words with excludeSeeds skip cache
- **WHEN** the same word is requested twice, the second time with a non-empty `excludeSeeds`
- **THEN** the cached result is not used and matching runs fresh with the seed exclusions applied
