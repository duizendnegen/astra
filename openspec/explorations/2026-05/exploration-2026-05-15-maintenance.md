# Exploration: maintenance

**Date:** 2026-05-15
**Linked change:** none

## Context

Two pending maintenance tasks from MAINTENANCE.md: upgrade the Lambda runtime from Node.js 20 to 22 (low-risk, mechanical), and migrate from the maintenance-mode `aws-xray-sdk` to AWS Distro for OpenTelemetry (ADOT) to fix silently-dropped custom sub-segments caused by `cls-hooked` losing async context through native `fetch`. Goal is to sequence and scope both changes clearly before proposing.

## Observations

### Node.js 22 upgrade — touch points

All changes are mechanical find-and-replace across 5 locations:

| File | Current | Target |
|------|---------|--------|
| `infra/lib/infra-stack.ts:105` | `lambda.Runtime.NODEJS_20_X` | `NODEJS_22_X` |
| `.github/workflows/ci.yml:18` | `node-version: '20'` | `'22'` (appears once in `test` job) |
| `.github/workflows/ci.yml:49` | `node-version: '20'` | `'22'` (appears again in `cdk-diff` job) |
| `.github/workflows/deploy.yml:19` | `node-version: '20'` | `'22'` (appears in `test` job) |
| `.github/workflows/deploy.yml:83` | `node-version: '20'` | `'22'` (appears in `deploy` job) |
| `lambda/Dockerfile:1` | `FROM node:20-slim` | `node:22-slim` |
| `frontend/Dockerfile:1` | `FROM node:20-alpine` | `node:22-alpine` |

No `scripts/Dockerfile` exists (scripts runs directly on the GitHub Actions runner via `actions/setup-node`). The deploy workflow has a `build-index` job that uses Node.js 20 too (line 49) — same fix applies.

Risk is low. Lambda Node.js 22 has been GA since November 2024; CDK's `NODEJS_22_X` enum value exists. The only gotcha is that CDK bundling uses Docker (`forceDockerBundling: true`) — the Dockerfile change handles that.

### ADOT migration — what X-Ray instrumentation exists today

**Automatically instrumented via `captureAWSv3Client`:**

| Client | File | Produces sub-segment? |
|--------|------|-----------------------|
| `DynamoDBDocumentClient` | `skeleton.ts:16` | Yes — `DynamoDB` sub-segment |
| `SSMClient` | `skeleton.ts:17` | Yes — `SSM` sub-segment |
| `S3Client` | `retrieval.ts:81–85` | Yes — `S3` sub-segment |

**Custom sub-segments via `tryAddSubsegment` (currently silently dropped through fetch):**

| Name | File | Wraps |
|------|------|-------|
| `embed` | `retrieval.ts:175` | `fetch()` to OpenRouter embeddings |
| `l3-candidates` | `retrieval.ts:275` | `fetch()` to OpenRouter chat |
| `l4-image-gen` | `retrieval.ts:309` | `fetch()` to OpenRouter image model |
| `svg-to-skeleton` | `retrieval.ts` (×3) + `skeleton.ts` | Synchronous CPU work |
| `matcher` | `skeleton.ts` (×2) | Synchronous CPU work |

The `tryAddSubsegment` helper is **duplicated** in both `skeleton.ts` and `retrieval.ts` — both call `resolveSegment()` which fails silently when `cls-hooked` loses context.

### ADOT approach options

**Option A — Managed Lambda layer (zero handler code change)**

Add the ADOT layer to the CDK stack and set `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler`. The layer auto-instruments `@aws-sdk` v3 clients (replaces `captureAWSv3Client`). Custom `fetch`-wrapping spans (`embed`, `l3-candidates`, `l4-image-gen`) are dropped — no replacement. Synchronous spans (`svg-to-skeleton`, `matcher`) are also dropped.

```
Result: AWS SDK calls (DynamoDB, S3, SSM) appear in X-Ray automatically.
        Custom spans gone. No code changes to lambda/src/.
```

**Option B — Managed layer + manual OTel spans**

Same as A, but also replace `tryAddSubsegment` usages with `@opentelemetry/api` span calls. The layer makes the OTel SDK available, so manual spans will actually propagate correctly.

```
Result: All spans restored. Requires replacing ~9 tryAddSubsegment call sites.
```

**Option C — Manual OTel SDK (no layer)**

Install `@aws/aws-distro-opentelemetry-node-autoinstrumentation` and configure manually. More control, more code, no Lambda layer dependency.

```
Result: Full control. More invasive. Not recommended for this scale.
```

### Architecture mismatch in MAINTENANCE.md

MAINTENANCE.md's CDK snippet references `aws-otel-nodejs-arm64-ver-1-30-0` (ARM64 layer). But `infra-stack.ts` does **not** specify `architecture` on `NodejsFunction`, which defaults to `X86_64`. The correct layer for the current setup is `aws-otel-nodejs-amd64-ver-1-30-0`. This needs to be confirmed before the proposal — or we could migrate to `arm64` (Graviton) at the same time for the ~20% cost reduction.

### Current ADOT layer version

The MAINTENANCE.md references `ver-1-30-0` (published early 2025). As of May 2026 newer versions likely exist. The version should be verified against the AWS public ECR or parameter store at proposal time.

### Sequencing

```
Option 1: Single PR — Node.js 22 + ADOT together
  + One `cdk diff` / `cdk deploy`
  - Harder to bisect if something regresses

Option 2: Two PRs — Node.js 22 first, then ADOT
  + Each is independently verifiable in X-Ray console
  + Node.js 22 unblocks aws-xray-sdk's deprecation warning immediately
  - Two deploy cycles
```

Both tasks are independent at the code level (no shared files changed). Node.js 22 is ~7 lines; ADOT is removing `aws-xray-sdk` from CDK bundling and package.json, updating retrieval.ts and skeleton.ts, and adding the layer.

## Rounds

## Round 1 — Scope and sequencing

### Q1.1 — Single PR or two separate PRs?

Both tasks touch different files and are independently deployable. Splitting keeps each diff readable and easy to verify in prod.

- [ ] Two PRs — Node.js 22 first, then ADOT ← recommended: smallest blast radius, easier to verify X-Ray traces separately
- [x] Single PR — do both in one deploy
- [ ] Node.js 22 only (defer ADOT indefinitely)

> **Your answer / freetext:**
>

### Q1.2 — ADOT: restore custom spans or AWS SDK only?

Option A (layer only) restores DynamoDB/S3/SSM traces automatically. Option B also restores `embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, and `matcher` spans using the OTel SDK API — these are currently always silently dropped so they've never appeared in X-Ray.

- [x] Option B — restore all custom spans too ← recommended: fixes the original motivation for migrating; these spans give visibility into the slow parts of each request
- [ ] Option A — AWS SDK auto-instrumentation only (no custom spans)

> **Your answer / freetext:**
>

### Q1.3 — Lambda architecture: keep x86_64 or switch to arm64 at the same time?

MAINTENANCE.md's CDK snippet referenced the ARM64 ADOT layer by mistake (the function currently runs on x86_64). We can stay on x86_64 (no change) or switch to arm64/Graviton3 at the same time, which reduces Lambda compute cost ~20% and requires updating the layer ARN and adding `architecture: lambda.Architecture.ARM_64` to the CDK definition.

- [ ] Stay on x86_64 — simpler, no architecture change ← recommended: one less variable during the ADOT migration
- [x] Switch to arm64 (Graviton) at the same time — save on compute

> **Your answer / freetext:**
>

## Round 2 — ADOT implementation details

### Q2.1 — OTel span API: `startActiveSpan` or `startSpan` + manual context?

The `tryAddSubsegment` pattern is currently call-site-synchronous: `const seg = tryAddSubsegment('embed'); try { ... } finally { seg?.close(); }`. Two OTel replacements exist:

**`startActiveSpan` (recommended)** — passes the span as a callback argument and sets it as the active span in async context automatically:
```typescript
await tracer.startActiveSpan('embed', async (span) => {
  try { ... } finally { span.end(); }
});
```
Works correctly with `AsyncLocalStorage`. Child AWS SDK spans and nested spans attach automatically.

**`startSpan` + manual context** — creates a span without touching async context; caller must propagate manually:
```typescript
const span = tracer.startSpan('embed');
try { ... } finally { span.end(); }
```
Simpler syntax but child spans won't auto-attach. Not appropriate here since the ADOT layer relies on context propagation for the X-Ray parent/child relationship.

- [x] `startActiveSpan` ← recommended: correct async context propagation; matches how ADOT layer wires spans to the Lambda root segment
- [ ] `startSpan` + manual context

> **Your answer / freetext:**
>

### Q2.2 — `@opentelemetry/api` in bundling: `externalModules` or bundled?

The ADOT Lambda layer ships `@opentelemetry/api` at `/opt/nodejs/node_modules/@opentelemetry/api`. If we mark it **external** in esbuild, Lambda resolves it from the layer at runtime — no extra bytes in the deployment package, always consistent with the layer version.

If we add it to **`nodeModules`** (bundled by CDK as a full npm install), we ship our own copy alongside the layer's copy — version skew risk and ~50 KB wasted.

The correct approach:
- Add `@opentelemetry/api` to `lambda/package.json` **devDependencies** only (for TypeScript compilation)
- Add `@opentelemetry/api` to `externalModules` in the CDK bundling config (alongside `@aws-sdk/*`)
- Do **not** add it to `nodeModules`

- [x] External (resolved from ADOT layer at runtime) ← recommended: no bundle bloat, no version skew
- [ ] Bundle it alongside the layer copy

> **Your answer / freetext:**
>

### Q2.3 — potrace native module: arm64 build on x86_64 CI runners

`potrace` is in `nodeModules` (native addon — must be compiled for the target architecture). Switching to arm64 means Docker bundling must produce an arm64 binary. With `forceDockerBundling: true` and `architecture: lambda.Architecture.ARM_64`, CDK uses the arm64 Lambda build image (`public.ecr.aws/sam/build-nodejs22.x:latest-arm64`).

On GitHub Actions `ubuntu-latest` (x86_64), pulling and running an arm64 Docker image requires QEMU binfmt support. AWS CDK docs note this works via QEMU emulation but is **significantly slower** (~3–5× for native compilation). The CI/deploy workflow currently has no Docker QEMU setup step.

Two options:
- **Add QEMU setup** — prepend `docker/setup-qemu-action@v3` to the CDK deploy job. Bundling takes longer but works on x86_64 runners.
- **Switch to arm64 runners** — use `runs-on: ubuntu-24.04-arm` (GitHub Actions arm64 runners, available on paid plans). Native speed, no emulation.

Current deploy workflow (`deploy.yml`) has no explicit timeout on the CDK step. QEMU-based arm64 bundling for potrace is slow but has completed in other projects in ~4–6 min.

- [x] Add QEMU setup step to the CDK deploy job ← recommended: no runner cost change; one extra setup step
- [ ] Switch to arm64 GitHub Actions runners

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Single PR combining Node.js 22 upgrade and ADOT migration — _Reason:_ files don't overlap; one deploy cycle preferred over two.

_Decision:_ Restore all custom spans (`embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, `matcher`) via `@opentelemetry/api` — _Reason:_ these spans have never actually appeared in X-Ray due to the `cls-hooked` bug; fixing that is the whole point of migrating.

_Decision:_ Switch Lambda to arm64 (Graviton3) in the same PR — _Reason:_ ~20% compute cost reduction; the ADOT migration already requires choosing the correct layer ARN so the arch choice needs to be made now anyway.

_Decision:_ Replace `tryAddSubsegment` pattern with `tracer.startActiveSpan()` — _Reason:_ correctly propagates async context via `AsyncLocalStorage`; child AWS SDK spans attach automatically to the right parent.

_Decision:_ `@opentelemetry/api` as `devDependency` only, added to `externalModules` in CDK bundling — _Reason:_ the ADOT layer ships the package at runtime; bundling a second copy risks version skew and wastes ~50 KB.

_Decision:_ Add `docker/setup-qemu-action@v3` to the CDK deploy job (before the CDK deploy step) — _Reason:_ potrace is a native addon that must be compiled for arm64; GitHub Actions `ubuntu-latest` runners are x86_64 and need QEMU emulation to run the arm64 Lambda build image.
