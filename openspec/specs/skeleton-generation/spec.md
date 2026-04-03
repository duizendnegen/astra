## ADDED Requirements

### Requirement: Skeleton endpoint
The system SHALL expose a `POST /api/skeleton` endpoint accepting `{ "word": string }` and returning `{ "skeletons": Skeleton[] }` where each skeleton has `points` and `edges`. The word SHALL be normalised (lowercased, trimmed) before processing.

#### Scenario: Valid word returns skeleton array
- **WHEN** a POST request is made to `/api/skeleton` with a valid word
- **THEN** the response contains `{ skeletons: [...] }` with 1–3 valid skeleton objects

### Requirement: LLM prompt and response schema
The Lambda SHALL use the retrieval-first pipeline (L0→L5) as the primary skeleton generation strategy. An LLM SHALL only be called at L3 (concept mapping, one call returning candidate nouns) or L4 (SVG generation, last resort). The previous two-step DESCRIBE_MULTI + DRAW pipeline is replaced.

#### Scenario: Concrete word produces skeleton via index
- **WHEN** the word is a concrete object present in the icon index (e.g. "wolf", "guitar")
- **THEN** no LLM call is made and the skeleton is derived from the matched SVG

#### Scenario: Abstract word reaches LLM at L3
- **WHEN** L1 embedding search does not produce a confident match
- **THEN** one LLM call is made to L3 for concept mapping, and the result is used to re-query the index

### Requirement: DynamoDB skeleton cache
The system SHALL check DynamoDB for a cached entry before running the pipeline. Cache entries SHALL use the extended schema: `{ word, match: { source, id, similarity, layer, svgPath }, skeletons }`. On a cache miss the full extended entry SHALL be stored after generation. Cache entries without a `match` field (written by the previous pipeline) SHALL be treated as cache misses and regenerated.

#### Scenario: Cache hit returns skeleton array
- **WHEN** a word has a valid extended cache entry
- **THEN** `skeletons` is returned without running the pipeline

#### Scenario: Legacy cache entry triggers regeneration
- **WHEN** a cache entry exists but has no `match` field
- **THEN** the pipeline runs, the result overwrites the old entry, and the new skeletons are returned

#### Scenario: Cache miss triggers pipeline
- **WHEN** no cache entry exists for the word
- **THEN** the full L0–L5 pipeline runs and the extended result is stored in DynamoDB

### Requirement: Retry and triangle fallback
On a malformed or schema-invalid LLM response the Lambda SHALL retry the full pipeline once. If all variants from both attempts are invalid, the endpoint SHALL return `{ skeletons: [TRIANGLE_FALLBACK] }` with HTTP 200.

#### Scenario: All variants invalid after retry
- **WHEN** both pipeline attempts produce no valid skeletons
- **THEN** `{ skeletons: [TRIANGLE_FALLBACK] }` is returned with HTTP 200

### Requirement: API key never exposed to client
The Lambda SHALL hold the OpenRouter API key as an environment variable. The key SHALL never be included in any response or client-reachable resource.

#### Scenario: Client requests skeleton
- **WHEN** the browser calls `/api/skeleton`
- **THEN** no API key or credential appears in the response or response headers
