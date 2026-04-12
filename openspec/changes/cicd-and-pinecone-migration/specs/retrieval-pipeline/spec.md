## MODIFIED Requirements

### Requirement: L1 direct embedding match
The system SHALL embed the normalised word via OpenRouter `text-embedding-3-small` and query the Pinecone Serverless index for the top-K nearest neighbours by cosine similarity, filtered by the configured `L1_SOURCES`. If the top result's similarity exceeds the source-specific threshold, the match SHALL be accepted, the corresponding SVG path SHALL be fetched from the icons S3 bucket at key `{source}/{name}` (derived by splitting the result `id` on `:`), and L3/L4 SHALL be skipped.

#### Scenario: High-confidence match accepted
- **WHEN** the top Pinecone result has similarity above the source-specific threshold
- **THEN** the pipeline fetches the SVG path from S3 at key `{source}/{name}` and does not call the LLM

#### Scenario: Low-confidence result falls through
- **WHEN** the top Pinecone result has similarity below the source-specific threshold
- **THEN** the pipeline proceeds to L3 and L4 in parallel

#### Scenario: Pinecone client reused across Lambda invocations
- **WHEN** the Lambda handler is invoked on a warm instance
- **THEN** the Pinecone client and index reference initialised at module level are reused without re-initialisation

#### Scenario: Local mode uses Pinecone emulator and MinIO
- **WHEN** `PINECONE_HOST` is set (e.g. `http://pinecone-local:5081`) and `AWS_ENDPOINT_URL` is set (e.g. `http://minio:9000`)
- **THEN** the Lambda queries the local Pinecone emulator and fetches SVG paths from MinIO without contacting production services

#### Scenario: Local mode skips SSM lookup
- **WHEN** `PINECONE_API_KEY` is set directly as an environment variable
- **THEN** the Lambda uses it without calling SSM `GetParameter`, enabling local development without AWS credentials
