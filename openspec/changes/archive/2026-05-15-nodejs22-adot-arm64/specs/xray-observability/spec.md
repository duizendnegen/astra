## MODIFIED Requirements

### Requirement: Automatic AWS SDK sub-segments via ADOT auto-instrumentation
At Lambda initialisation, AWS SDK v3 clients (`DynamoDBClient`, `S3Client`, `SSMClient`) SHALL NOT be wrapped with `captureAWSv3Client`. Instead, the ADOT Lambda layer SHALL automatically instrument all AWS SDK v3 calls and produce named sub-segments in X-Ray without any code-level wrapping. The `aws-xray-sdk` import SHALL be removed from `skeleton.ts` and `retrieval.ts`.

#### Scenario: DynamoDB GetCommand appears in trace
- **WHEN** the handler reads from the DynamoDB skeleton cache
- **THEN** the X-Ray trace contains a sub-segment for the DynamoDB call with operation and duration

#### Scenario: S3 GetObject appears in trace
- **WHEN** the pipeline fetches an SVG from S3 via `fetchSvgFromS3`
- **THEN** the X-Ray trace contains a sub-segment for the S3 call with operation and duration

#### Scenario: SSM GetParameter appears in trace
- **WHEN** the Lambda resolves the OpenRouter API key from SSM
- **THEN** the X-Ray trace contains a sub-segment for the SSM call

### Requirement: Manual X-Ray sub-segments for OpenRouter HTTP calls
`embedBatch`, `l3Candidates`, and `l4GenerateFromImage` in `retrieval.ts` SHALL each wrap their `fetch()` call in a manual OpenTelemetry span using `tracer.startActiveSpan('<name>', async (span) => { try { ... } finally { span.end(); } })`. The tracer SHALL be obtained via `trace.getTracer('astra-lambda')` from `@opentelemetry/api`. Span names SHALL be `embed`, `l3-candidates`, and `l4-image-gen` respectively. The `tryAddSubsegment` helper and all `resolveSegment` imports SHALL be removed.

#### Scenario: embed span recorded for L1 embedding
- **WHEN** `embedBatch` is called for the L1 query vector
- **THEN** the X-Ray trace contains a sub-segment named `embed` with its duration

#### Scenario: l3-candidates span recorded
- **WHEN** the pipeline calls `l3Candidates` to obtain synonym nouns
- **THEN** the X-Ray trace contains a sub-segment named `l3-candidates` with its duration

#### Scenario: l4-image-gen span recorded
- **WHEN** the pipeline calls `l4GenerateFromImage`
- **THEN** the X-Ray trace contains a sub-segment named `l4-image-gen` with its duration

#### Scenario: Missing OTel context does not break the pipeline
- **WHEN** the Lambda is invoked in a context without an active OTel span (e.g., local development without ADOT layer)
- **THEN** the request completes normally; `startActiveSpan` is a no-op and no exception is thrown

### Requirement: Manual X-Ray sub-segments for CPU operations
`svgToSkeletonWithOpts` call sites in `retrieval.ts` and `match()` invocations in `skeleton.ts` SHALL each be wrapped in a manual OpenTelemetry span using `tracer.startActiveSpan('<name>', (span) => { try { ... } finally { span.end(); } })`. Span names SHALL be `svg-to-skeleton` and `matcher` respectively. The `tryAddSubsegment` helper in `skeleton.ts` SHALL be removed.

#### Scenario: svg-to-skeleton span recorded
- **WHEN** an SVG is converted to a skeleton in the pipeline
- **THEN** the X-Ray trace contains a sub-segment named `svg-to-skeleton`

#### Scenario: matcher span recorded
- **WHEN** `match()` is called in the handler
- **THEN** the X-Ray trace contains a sub-segment named `matcher`
