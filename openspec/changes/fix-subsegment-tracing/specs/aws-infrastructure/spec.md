## ADDED Requirements

### Requirement: OTEL_SERVICE_NAME set on Lambda
The Lambda function SHALL have the environment variable `OTEL_SERVICE_NAME` set to `astra-skeleton`. This names the service in the X-Ray service map and in OpenTelemetry resource attributes.

#### Scenario: Service name appears in X-Ray trace
- **WHEN** a Lambda invocation is traced in X-Ray
- **THEN** the service is identified as `astra-skeleton` in the service map

### Requirement: OTEL_NODE_ENABLED_INSTRUMENTATIONS scoped to aws-lambda and aws-sdk
The Lambda function SHALL have the environment variable `OTEL_NODE_ENABLED_INSTRUMENTATIONS` set to `aws-lambda,aws-sdk`. The `http` instrumentation SHALL NOT be enabled to avoid duplicate spans for OpenRouter `fetch()` calls that are already wrapped in manual `startActiveSpan` calls.

#### Scenario: DynamoDB call appears as auto-instrumented subsegment
- **WHEN** the Lambda reads from the DynamoDB skeleton cache
- **THEN** the X-Ray trace contains a subsegment for the DynamoDB call produced by the `aws-sdk` auto-instrumentation (not a manual span)

#### Scenario: No duplicate spans for OpenRouter fetch calls
- **WHEN** the Lambda calls `embedBatch` which wraps a `fetch()` in a manual `embed` span
- **THEN** the X-Ray trace contains exactly one `embed` subsegment (not an additional http subsegment wrapping the same call)
