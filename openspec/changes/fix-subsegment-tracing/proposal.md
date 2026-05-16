## Why

Custom OTel spans (`embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, `matcher`) are instrumented in code but never appear in X-Ray traces. The ADOT layer is attached but the wrapper was disabled after it crashed on every request with `TypeError: Cannot redefine property: handler`. Without the wrapper, no TracerProvider is ever registered and all `startActiveSpan` calls are silent no-ops.

## What Changes

- Change `skeleton.ts` handler export from `export async function handler` to `module.exports = { handler }` — this makes the property configurable so the ADOT wrapper can patch it at runtime
- Move `@opentelemetry/api` from `nodeModules` back to `externalModules` in CDK bundling config — resolves the two-instance trap where the layer's TracerProvider is invisible to bundled handler code
- Remove `@opentelemetry/api` from `lambda/package.json` production dependencies (back to devDependencies) — it is no longer bundled
- Re-enable `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` in the Lambda environment
- Add `OTEL_SERVICE_NAME=astra-skeleton` to the Lambda environment
- Add `OTEL_NODE_ENABLED_INSTRUMENTATIONS=aws-lambda,aws-sdk` to the Lambda environment — keeps DynamoDB/S3/SSM auto-instrumentation, disables `http` to avoid duplicate spans for OpenRouter calls that are already wrapped manually

## Capabilities

### New Capabilities

_None — this change restores functionality that was already specified but broken._

### Modified Capabilities

- `xray-observability`: add requirement that the Lambda handler SHALL be exported via `module.exports` to ensure the ADOT wrapper can instrument it
- `aws-infrastructure`: add requirements for `OTEL_SERVICE_NAME` and `OTEL_NODE_ENABLED_INSTRUMENTATIONS` environment variables on the Lambda

## Impact

- `lambda/src/skeleton.ts` — export syntax change
- `infra/lib/infra-stack.ts` — CDK bundling config (`externalModules`), three new env vars, re-add `AWS_LAMBDA_EXEC_WRAPPER`
- `lambda/package.json` / `lambda/package-lock.json` — `@opentelemetry/api` back to devDependencies
- No API contract changes; no new AWS resources; no cost impact beyond existing X-Ray trace pricing
