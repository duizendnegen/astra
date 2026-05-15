## ADDED Requirements

### Requirement: POST /api/skeleton route on local dev server
The local dev server (`lambda/src/local.ts`) SHALL expose a `POST /api/skeleton` route alongside the existing `POST /api/constellation` route. The endpoint SHALL accept a JSON body of `{ word: string, promptVariant?: string, model?: string }`, run `retrieveSkeleton(word, API_KEY)`, and return the raw `PipelineResult` as JSON (`{ match: MatchProvenance | null, skeletons: Skeleton[] }`). The endpoint SHALL return 400 if `word` is missing or blank. The endpoint SHALL return 422 if the pipeline produces zero skeletons. The in-memory cache applied to `/api/constellation` SHALL also apply to `/api/skeleton` so repeated calls for the same word do not re-invoke the retrieval pipeline.

#### Scenario: Valid word returns pipeline result
- **WHEN** `POST /api/skeleton` is called with `{ "word": "anchor" }`
- **THEN** the response is 200 with body `{ match: {...}, skeletons: [{points: [...], edges: [...]}] }`

#### Scenario: Missing word returns 400
- **WHEN** `POST /api/skeleton` is called with an empty body or `{ "word": "" }`
- **THEN** the response is 400 with body `{ "error": "word is required" }`

#### Scenario: No skeleton derived returns 422
- **WHEN** `POST /api/skeleton` is called and the retrieval pipeline returns `skeletons: []`
- **THEN** the response is 422 with body `{ "error": "No constellation found." }`

#### Scenario: Repeated call uses cache
- **WHEN** `POST /api/skeleton` is called twice for the same word
- **THEN** the second call does not invoke `retrieveSkeleton()` again and returns immediately from cache
