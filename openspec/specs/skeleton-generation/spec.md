## ADDED Requirements

### Requirement: Skeleton endpoint
The system SHALL expose a `POST /api/skeleton` endpoint accepting `{ "word": string }` and returning `{ "name": string, "points": [number, number][], "edges": [number, number][] }`. The word SHALL be normalised (lowercased, trimmed) before processing.

#### Scenario: Valid word returns skeleton
- **WHEN** a POST request is made to `/api/skeleton` with a valid word
- **THEN** the response contains a name (1–2 words), 6–10 normalised (x,y) points, and a list of index-pair edges

#### Scenario: Word is normalised
- **WHEN** the word is submitted with mixed case or surrounding whitespace
- **THEN** the normalised form is used for cache lookup and LLM prompt

### Requirement: DynamoDB skeleton cache
The system SHALL check DynamoDB for a cached skeleton before calling the LLM. On a cache miss the result SHALL be stored after a successful LLM response. Cache entries do not expire.

#### Scenario: Cache hit
- **WHEN** a word has been requested before
- **THEN** the cached skeleton is returned without an LLM call

#### Scenario: Cache miss triggers LLM call
- **WHEN** no cached skeleton exists for the word
- **THEN** OpenRouter is called, the result is stored in DynamoDB, and the skeleton is returned

### Requirement: LLM prompt and response schema
The Lambda SHALL prompt the LLM with instructions to return a JSON skeleton capturing the most recognisable silhouette or profile of the word, using visual metaphor for abstract words, with 6–10 normalised (x,y) points, index-pair edges, and a 1–2 word poetic constellation name.

#### Scenario: Concrete word returns silhouette skeleton
- **WHEN** the word is a concrete noun (e.g. "wolf")
- **THEN** the skeleton captures a recognisable silhouette of that subject

#### Scenario: Abstract word returns metaphorical skeleton
- **WHEN** the word is abstract (e.g. "longing")
- **THEN** the skeleton depicts a conventional visual symbol or metaphor for that concept

### Requirement: Retry and triangle fallback
On a malformed or schema-invalid LLM response the Lambda SHALL retry once. If the second attempt also fails, the endpoint SHALL return the triangle fallback skeleton `{ name: "Triangulum", points: [[0.5,0],[0,1],[1,1]], edges: [[0,1],[1,2],[2,0]] }` with HTTP 200.

#### Scenario: First LLM response malformed
- **WHEN** the LLM returns a response that fails schema validation
- **THEN** the Lambda retries the LLM call once

#### Scenario: Both attempts fail
- **WHEN** both LLM attempts return invalid responses
- **THEN** the triangle fallback is returned with HTTP 200

### Requirement: API key never exposed to client
The Lambda SHALL hold the OpenRouter API key as an environment variable. The key SHALL never be included in any response or client-reachable resource.

#### Scenario: Client requests skeleton
- **WHEN** the browser calls `/api/skeleton`
- **THEN** no API key or credential appears in the response or response headers
