## MODIFIED Requirements

### Requirement: Skeleton endpoint
The system SHALL expose a `POST /api/skeleton` endpoint accepting `{ "word": string }` and returning `{ "skeletons": Skeleton[] }` where each skeleton has `points` and `edges`. The word SHALL be normalised (lowercased, trimmed) before processing.

#### Scenario: Valid word returns skeleton array
- **WHEN** a POST request is made to `/api/skeleton` with a valid word
- **THEN** the response contains `{ skeletons: [...] }` with 1–3 valid skeleton objects

### Requirement: LLM prompt and response schema
The Lambda SHALL use a two-step LLM pipeline: a single `DESCRIBE_MULTI` call returning a JSON array of 3 iconic descriptions, followed by 3 parallel `DRAW` calls. The `DESCRIBE_MULTI` prompt SHALL instruct the LLM to describe 3 distinct iconic silhouettes from the natural human viewing angle, as an illustrator or emoji designer would draw them. Overhead views, floor plans, and cross-sections SHALL be explicitly discouraged.

#### Scenario: Concrete word produces illustrator-perspective variants
- **WHEN** the word is a concrete object
- **THEN** the 3 descriptions each depict a different recognisable aspect from a human-eye viewpoint, not a technical overhead view

#### Scenario: Three DRAW calls run in parallel
- **WHEN** 3 valid descriptions are returned
- **THEN** all 3 DRAW calls are initiated simultaneously via Promise.all

### Requirement: DynamoDB skeleton cache
The system SHALL check DynamoDB for a cached skeleton array before calling the LLM. On a cache miss the full `{ skeletons: Skeleton[] }` result SHALL be stored after generation. Cache entries do not expire.

#### Scenario: Cache hit returns skeleton array
- **WHEN** a word has been requested before
- **THEN** the cached `{ skeletons: [...] }` is returned without an LLM call

#### Scenario: Cache miss triggers parallel generation
- **WHEN** no cached skeleton array exists for the word
- **THEN** the multi-variant pipeline runs, the result is stored in DynamoDB, and the skeleton array is returned

### Requirement: Retry and triangle fallback
On a malformed or schema-invalid LLM response the Lambda SHALL retry the full pipeline once. If all variants from both attempts are invalid, the endpoint SHALL return `{ skeletons: [TRIANGLE_FALLBACK] }` with HTTP 200.

#### Scenario: All variants invalid after retry
- **WHEN** both pipeline attempts produce no valid skeletons
- **THEN** `{ skeletons: [TRIANGLE_FALLBACK] }` is returned with HTTP 200
