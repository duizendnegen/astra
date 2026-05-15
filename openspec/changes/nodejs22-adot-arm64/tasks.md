## 1. Lambda package.json

- [x] 1.1 Remove `aws-xray-sdk` from `dependencies` in `lambda/package.json`
- [x] 1.2 Add `@opentelemetry/api` to `devDependencies` in `lambda/package.json`
- [x] 1.3 Run `npm install` in `lambda/` to update `package-lock.json`

## 2. CDK infrastructure

- [x] 2.1 Look up the latest ADOT arm64 Lambda layer ARN for the deployment region (check `aws ssm get-parameter --name /aws/service/aws-otel-lambda/arm64/nodejs/latest --region eu-central-1` or the [ADOT Lambda releases](https://github.com/aws-observability/aws-otel-lambda/releases))
- [x] 2.2 Change `lambda.Runtime.NODEJS_20_X` → `lambda.Runtime.NODEJS_22_X` in `infra/lib/infra-stack.ts`
- [x] 2.3 Add `architecture: lambda.Architecture.ARM_64` to the `NodejsFunction` construct
- [x] 2.4 Import and add the ADOT layer via `lambda.LayerVersion.fromLayerVersionArn` using the ARN from task 2.1
- [x] 2.5 Add `layers: [adotLayer]` to the `NodejsFunction` construct
- [x] 2.6 Add `AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler'` to the Lambda `environment` map
- [x] 2.7 Remove `'aws-xray-sdk'` from the `nodeModules` array in CDK bundling config
- [x] 2.8 Add `'@opentelemetry/api'` to the `externalModules` array in CDK bundling config

## 3. Dockerfiles

- [x] 3.1 Update `lambda/Dockerfile`: `FROM node:20-slim` → `FROM node:22-slim`
- [x] 3.2 Update `frontend/Dockerfile`: `FROM node:20-alpine` → `FROM node:22-alpine`

## 4. GitHub Actions workflows

- [x] 4.1 Update `node-version: '20'` → `'22'` in the `test` job in `.github/workflows/ci.yml`
- [x] 4.2 Update `node-version: '20'` → `'22'` in the `cdk-diff` job in `.github/workflows/ci.yml`
- [x] 4.3 Update `node-version: '20'` → `'22'` in the `test` job in `.github/workflows/deploy.yml`
- [x] 4.4 Update `node-version: '20'` → `'22'` in the `build-index` job in `.github/workflows/deploy.yml`
- [x] 4.5 Update `node-version: '20'` → `'22'` in the `deploy` job in `.github/workflows/deploy.yml`
- [x] 4.6 Add `- uses: docker/setup-qemu-action@v3` as the first step in the `deploy` job in `.github/workflows/deploy.yml` (before the CDK deploy step)

## 5. retrieval.ts — remove aws-xray-sdk

- [x] 5.1 Remove `import AWSXRay from 'aws-xray-sdk'` and the `captureAWSv3Client`/`resolveSegment` destructure
- [x] 5.2 Remove the `captureAWSv3Client(...)` wrapper from the `S3Client` initialisation — use `new S3Client(...)` directly
- [x] 5.3 Remove the `tryAddSubsegment` helper function

## 6. retrieval.ts — add OTel spans

- [x] 6.1 Add `import { trace } from '@opentelemetry/api'` and `const tracer = trace.getTracer('astra-lambda')` at module level
- [x] 6.2 Replace the `embed` `tryAddSubsegment` pattern in `embedBatch` with `tracer.startActiveSpan('embed', async (span) => { try { res = await fetch(...) } finally { span.end() } })`
- [x] 6.3 Replace the `l3-candidates` `tryAddSubsegment` pattern in `l3Candidates` with `tracer.startActiveSpan`
- [x] 6.4 Replace the `l4-image-gen` `tryAddSubsegment` pattern in `l4GenerateFromImage` with `tracer.startActiveSpan`
- [x] 6.5 Replace all three `svg-to-skeleton` `tryAddSubsegment` patterns in `retrieval.ts` with `tracer.startActiveSpan` (L1 path, L4 path, L3 loop)

## 7. skeleton.ts — remove aws-xray-sdk

- [x] 7.1 Remove `import AWSXRay from 'aws-xray-sdk'` and the `captureAWSv3Client`/`resolveSegment` destructure
- [x] 7.2 Remove the `captureAWSv3Client(...)` wrapper from `DynamoDBDocumentClient.from(...)` — use the unwrapped client directly
- [x] 7.3 Remove the `captureAWSv3Client(...)` wrapper from `SSMClient` — use `new SSMClient(...)` directly
- [x] 7.4 Remove the `tryAddSubsegment` helper function

## 8. skeleton.ts — add OTel spans

- [x] 8.1 Add `import { trace } from '@opentelemetry/api'` and `const tracer = trace.getTracer('astra-lambda')` at module level
- [x] 8.2 Replace the first `matcher` `tryAddSubsegment` pattern (backward-compat cache path) with `tracer.startActiveSpan`
- [x] 8.3 Replace the second `matcher` `tryAddSubsegment` pattern (main path) with `tracer.startActiveSpan`

## 9. Test and verify

- [x] 9.1 Run `npm test` in `lambda/` and confirm all tests pass
- [x] 9.2 Run `npm test` in `frontend/` and confirm all tests pass
- [x] 9.3 Restart Docker Compose (`docker compose up --build -d`) to test locally with updated Node.js 22 images
- [x] 9.4 Open the app in a browser via the Playwright MCP server and submit a constellation search request to verify the end-to-end response is correct
- [x] 9.5 Run `cdk diff` in `infra/` and verify: runtime shows `nodejs22.x`, architecture shows `arm64`, ADOT layer is listed, `aws-xray-sdk` is absent from asset dependencies
