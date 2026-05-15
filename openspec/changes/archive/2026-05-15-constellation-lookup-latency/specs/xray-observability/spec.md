## ADDED Requirements

### Requirement: X-Ray active tracing on Lambda and API Gateway
The CDK stack SHALL enable X-Ray active tracing on the skeleton Lambda function (`tracing: lambda.Tracing.ACTIVE`) and on the HTTP API Gateway stage. The Lambda execution role SHALL have the `xray:PutTraceSegments` and `xray:PutTelemetryRecords` permissions granted automatically by CDK's managed policy.

#### Scenario: X-Ray trace appears after request
- **WHEN** a POST request is made to `/api/constellation`
- **THEN** an X-Ray trace is recorded in the AWS X-Ray console containing a Lambda segment with sub-segments for downstream AWS SDK calls

### Requirement: Automatic AWS SDK sub-segments via captureAWSv3Client
At Lambda module initialisation in `skeleton.ts`, all AWS SDK v3 clients (`DynamoDBClient`, `S3Client`, `SSMClient`) SHALL be wrapped with `AWSXRay.captureAWSv3Client()` before being used. This causes every AWS SDK call made through these clients to appear as a named sub-segment in the X-Ray trace automatically.

#### Scenario: DynamoDB GetCommand appears in trace
- **WHEN** the handler reads from the DynamoDB skeleton cache
- **THEN** the X-Ray trace contains a sub-segment named `DynamoDB` with the operation and duration

#### Scenario: S3 GetObject appears in trace
- **WHEN** the pipeline fetches an SVG from S3 via `fetchSvgFromS3`
- **THEN** the X-Ray trace contains a sub-segment named `S3` with the operation and duration

### Requirement: Manual X-Ray sub-segments for OpenRouter HTTP calls
`embedBatch`, `l3Candidates`, and `l4GenerateFromImage` in `retrieval.ts` SHALL each wrap their `fetch()` call in a manual X-Ray sub-segment using `AWSXRay.resolveSegment().addNewSubsegment('<name>')`. The sub-segment SHALL be closed in a `finally` block. Sub-segment names SHALL be `embed`, `l3-candidates`, and `l4-image-gen` respectively.

If `AWSXRay.resolveSegment()` throws (e.g., during local development without an active segment), the error SHALL be caught and logged at `debug` level; the underlying operation SHALL proceed unaffected.

#### Scenario: embed sub-segment recorded for L1 embedding
- **WHEN** `embedBatch` is called for the L1 query vector
- **THEN** the X-Ray trace contains a sub-segment named `embed` with its duration

#### Scenario: l3-candidates sub-segment recorded
- **WHEN** the pipeline calls `l3Candidates` to obtain synonym nouns
- **THEN** the X-Ray trace contains a sub-segment named `l3-candidates` with its duration

#### Scenario: Missing X-Ray segment does not break the pipeline
- **WHEN** the Lambda is invoked in a context without an active X-Ray segment (e.g., local development)
- **THEN** the request completes normally and a debug-level log entry is emitted instead of throwing

### Requirement: Manual X-Ray sub-segments for CPU operations
`svgToSkeletonWithOpts` call sites in `retrieval.ts` and `match()` invocations in `skeleton.ts` SHALL each be wrapped in a manual X-Ray sub-segment. Sub-segment names SHALL be `svg-to-skeleton` and `matcher` respectively.

#### Scenario: svg-to-skeleton sub-segment recorded
- **WHEN** an SVG is converted to a skeleton in the pipeline
- **THEN** the X-Ray trace contains a sub-segment named `svg-to-skeleton`

#### Scenario: matcher sub-segment recorded
- **WHEN** `match()` is called in the handler
- **THEN** the X-Ray trace contains a sub-segment named `matcher`

### Requirement: Total request duration logged in skeleton.ts
The handler in `skeleton.ts` SHALL record `performance.now()` at entry and emit a single `log.info` at exit with fields `{ word, durationMs, cacheHit: boolean }` and message `'request complete'`.

#### Scenario: Duration logged on cache hit
- **WHEN** the handler returns a cached result
- **THEN** a `request complete` log entry is emitted with `cacheHit: true` and `durationMs` reflecting the total handler wall-clock time

#### Scenario: Duration logged on cache miss
- **WHEN** the handler runs the full pipeline
- **THEN** a `request complete` log entry is emitted with `cacheHit: false` and `durationMs` reflecting the total handler wall-clock time
