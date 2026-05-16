## ADDED Requirements

### Requirement: Word input has a maximum length

The Lambda handler SHALL reject `POST /api/constellation` requests where the `word` field exceeds 100 characters. The response SHALL be `400 Bad Request` with body `{ "error": "word must be 100 characters or fewer" }`.

#### Scenario: Word within length limit is accepted

- **WHEN** a `POST /api/constellation` request is made with a `word` of 100 characters or fewer
- **THEN** the request proceeds to constellation matching normally

#### Scenario: Word exceeding length limit is rejected

- **WHEN** a `POST /api/constellation` request is made with a `word` longer than 100 characters
- **THEN** the Lambda returns `400 Bad Request`
- **THEN** the response body is `{ "error": "word must be 100 characters or fewer" }`
- **THEN** no Pinecone query or LLM call is made

#### Scenario: Empty word is rejected (existing behaviour preserved)

- **WHEN** a `POST /api/constellation` request is made with an empty or whitespace-only `word`
- **THEN** the Lambda returns `400 Bad Request`
