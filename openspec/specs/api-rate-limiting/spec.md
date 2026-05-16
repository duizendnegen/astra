## ADDED Requirements

### Requirement: API Gateway enforces request rate limits

The API Gateway stage SHALL apply throttling limits of burst 10 requests/second and steady-state 2 requests/second to the `POST /api/constellation` endpoint. Requests exceeding these limits SHALL receive a `429 Too Many Requests` response from API Gateway before Lambda is invoked.

#### Scenario: Request within rate limit is processed

- **WHEN** a client sends a `POST /api/constellation` request within the allowed rate
- **THEN** the request is forwarded to Lambda and processed normally

#### Scenario: Burst of requests exceeds throttle limit

- **WHEN** a client sends more than 10 requests per second to `POST /api/constellation`
- **THEN** API Gateway returns `429 Too Many Requests` for requests exceeding the burst limit
- **THEN** Lambda is NOT invoked for the throttled requests

#### Scenario: Sustained traffic exceeds steady-state limit

- **WHEN** a client sustains more than 2 requests per second over a period
- **THEN** API Gateway throttles excess requests with `429 Too Many Requests`
