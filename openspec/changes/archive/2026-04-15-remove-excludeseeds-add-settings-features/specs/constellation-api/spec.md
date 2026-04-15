## MODIFIED Requirements

### Requirement: POST /api/constellation returns complete render-ready result
The endpoint SHALL accept `POST /api/constellation` with a JSON body containing `word: string`. It SHALL run the retrieval pipeline followed by the matcher and return a single JSON response with `constellation`, `skeleton`, and `match` fields. The `constellation` field SHALL contain `constellationStars`, `edges`, `patchRA`, `patchDec`, `shapeScore`, `vertexFitScore`, `skeletonPoints`, and `procrustesAngle`. The `skeleton` field SHALL contain `points` and `edges` in normalised coordinates. The `match` field SHALL contain match provenance (`source`, `id`, `similarity`, `layer`, `svgPath`, and optional `trail`). When the retrieval pipeline returns no match (all layers failed), the endpoint SHALL return HTTP 422 with body `{ "error": "No constellation found." }` instead of a 200 response.

#### Scenario: Successful request returns all fields
- **WHEN** a POST request is sent with `{ "word": "orion" }`
- **THEN** the response has status 200 and a body containing `constellation`, `skeleton`, and `match` fields, with `constellation.procrustesAngle` present as a number

#### Scenario: No constellation found returns 422
- **WHEN** the retrieval pipeline returns no match
- **THEN** the response has status 422 with `{ "error": "No constellation found." }`

#### Scenario: Missing word returns 400
- **WHEN** a POST request is sent with an empty body or missing `word` field
- **THEN** the response has status 400 with `{ "error": "word is required" }`

## REMOVED Requirements

### Requirement: excludeSeeds filters anchor stars
**Reason:** The `excludeSeeds` cross-request mechanism is removed to simplify the API and eliminate frontend/backend coupling. Repeated searches on the same word may return the same constellation.
**Migration:** Remove `excludeSeeds` from all POST request bodies. Remove `seedStarId` consumption from response handling. The backend no longer accepts or processes the field.

### Requirement: Repeated words with excludeSeeds skip cache
**Reason:** Removed alongside the `excludeSeeds` mechanism. The cache is now always consulted for warm instances.
**Migration:** No client-side action required. The server will use cached results for repeated queries.
