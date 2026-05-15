## Why

Node.js 20 reaches end-of-life in April 2026 and `aws-xray-sdk` entered maintenance mode (security fixes only) in February 2026; its `cls-hooked` dependency silently drops all custom X-Ray sub-segments through native `fetch`. Migrating to Node.js 22 and ADOT resolves both issues in one deploy, and switching the Lambda architecture to arm64 (Graviton3) reduces compute cost ~20%.

## What Changes

- Upgrade Lambda runtime from `NODEJS_20_X` to `NODEJS_22_X` in CDK
- Switch Lambda architecture from x86_64 to arm64 (Graviton3)
- Add ADOT managed Lambda layer (`aws-otel-nodejs-arm64`) with `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler`
- Remove `aws-xray-sdk` from `lambda/package.json` and CDK `nodeModules`
- Replace `captureAWSv3Client` wrapping (DynamoDB, SSM, S3) with ADOT auto-instrumentation
- Replace `tryAddSubsegment` / `resolveSegment` calls with `@opentelemetry/api` `startActiveSpan` — restoring the `embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, and `matcher` spans that are currently silently dropped
- Add `@opentelemetry/api` as `devDependency` and to `externalModules` in CDK bundling
- Update Node.js version from `20` to `22` in both CI and deploy GitHub Actions workflows
- Update `FROM node:20-slim` → `node:22-slim` in `lambda/Dockerfile`
- Update `FROM node:20-alpine` → `node:22-alpine` in `frontend/Dockerfile`
- Add `docker/setup-qemu-action@v3` to the CDK deploy job to support arm64 Docker bundling on x86_64 runners

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `aws-infrastructure`: Lambda runtime changes to Node.js 22, architecture changes to arm64, ADOT layer added, `aws-xray-sdk` removed from bundling config
- `xray-observability`: Instrumentation backend changes from `aws-xray-sdk` to ADOT; custom spans (`embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, `matcher`) are now correctly propagated instead of silently dropped
- `github-actions-cicd`: Node.js version updated to 22 across all workflow jobs; QEMU setup step added to the CDK deploy job for arm64 Docker bundling

## Impact

- **`infra/lib/infra-stack.ts`** — runtime, architecture, layer, environment vars, bundling config
- **`lambda/src/skeleton.ts`** — remove xray imports, replace `tryAddSubsegment` / `captureAWSv3Client`
- **`lambda/src/retrieval.ts`** — remove xray imports, replace `tryAddSubsegment` / `captureAWSv3Client`
- **`lambda/package.json`** — remove `aws-xray-sdk` dep, add `@opentelemetry/api` devDep
- **`lambda/Dockerfile`** — node:20-slim → node:22-slim
- **`frontend/Dockerfile`** — node:20-alpine → node:22-alpine
- **`.github/workflows/ci.yml`** — node-version 20 → 22
- **`.github/workflows/deploy.yml`** — node-version 20 → 22, QEMU setup step
