## ADDED Requirements

### Requirement: Health check endpoint

The Lambda SHALL handle `GET /health` requests by returning `200 OK` with body `{ "status": "ok" }`. The handler SHALL make no external calls (no DynamoDB, Pinecone, or SSM) when serving this route. The API Gateway SHALL route `GET /health` to the Lambda integration.

#### Scenario: Health check returns 200

- **WHEN** a `GET /health` request is made to the API
- **THEN** the response is `200 OK`
- **THEN** the response body is `{ "status": "ok" }`
- **THEN** no external dependencies are contacted

#### Scenario: Health check is available without authentication

- **WHEN** a `GET /health` request is made without any authorization headers
- **THEN** the response is `200 OK` (the endpoint requires no credentials)

#### Scenario: POST to /health is not handled

- **WHEN** a `POST /health` request is made
- **THEN** the response is not `200 OK` (route is GET-only)
