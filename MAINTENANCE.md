# Maintenance Notes

## Upgrade Lambda runtime to Node.js 22

Lambda currently runs `nodejs20.x` (`infra/lib/infra-stack.ts`, `runtime: lambda.Runtime.NODEJS_20_X`).

Node.js 20 enters maintenance-only LTS in April 2026 and reaches end-of-life in April 2026. Node.js 22 is the current Active LTS. The `aws-xray-sdk` dependency already logs a deprecation warning in the Docker build output that its packages published after January 2027 will require Node.js ≥ 22.

**Steps:**
- Change `NODEJS_20_X` → `NODEJS_22_X` in `infra/lib/infra-stack.ts`
- Update `"node": "20"` in `.github/workflows/ci.yml` and `.github/workflows/deploy.yml`
- Update `FROM node:20-slim` / `FROM node:20-alpine` in `lambda/Dockerfile` and `frontend/Dockerfile`
- Run full test suite and `cdk diff` to confirm no regressions

---

## Migrate from aws-xray-sdk to OpenTelemetry (ADOT)

The AWS X-Ray SDK for Node.js entered **maintenance mode on February 25, 2026** — security fixes only, no new features. AWS's recommended replacement is the [AWS Distro for OpenTelemetry (ADOT)](https://aws-otel.github.io/).

### Is OpenTelemetry still X-Ray compatible?

Yes. ADOT exports traces to X-Ray using the same backend — the X-Ray console, trace summaries, service map, and segment structure all remain unchanged. The switch affects instrumentation code only, not the observability backend.

### Why to migrate

- Fixes the current issue where `cls-hooked` (used by aws-xray-sdk) loses async context through Node.js native `fetch` / `undici`, causing custom sub-segments (`embed`, `l3-candidates`, `svg-to-skeleton`, `matcher`) to be silently dropped
- OpenTelemetry uses `AsyncLocalStorage` natively, which propagates correctly through all async boundaries in Node.js 18+
- Actively maintained; aws-xray-sdk is not

### Approach for Lambda

AWS provides a managed Lambda layer that auto-instruments Node.js and exports to X-Ray with zero code changes to the handler:

```typescript
// infra/lib/infra-stack.ts
import * as lambdaPython from 'aws-cdk-lib/aws-lambda';

const adotLayer = lambda.LayerVersion.fromLayerVersionArn(
  this, 'AdotLayer',
  `arn:aws:lambda:${this.region}:901920570463:layer:aws-otel-nodejs-arm64-ver-1-30-0:1`,
);

// Add to SkeletonFn:
layers: [adotLayer],
environment: {
  AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler',
  OPENTELEMETRY_COLLECTOR_CONFIG_URI: '...',  // or omit to default to X-Ray
  ...
},
```

Alternatively, instrument manually with `@aws/aws-distro-opentelemetry-node-autoinstrumentation` and `@opentelemetry/exporter-trace-otlp-http` for more control.

**Steps:**
- Remove `aws-xray-sdk` from `lambda/package.json` dependencies and `nodeModules` in CDK bundling
- Remove `captureAWSv3Client` wrapping and `tryAddSubsegment` calls from `retrieval.ts` and `skeleton.ts`
- Add ADOT Lambda layer in CDK and set `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler`
- Verify traces appear in X-Ray console with sub-segments for DynamoDB, S3, SSM, and fetch calls
