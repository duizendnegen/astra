## Context

The Lambda currently runs Node.js 20 with `aws-xray-sdk` for distributed tracing. Two issues compel action now:

1. **`aws-xray-sdk` maintenance mode** (Feb 2026): The SDK's `cls-hooked` dependency uses Continuation-Local Storage to track async context. Node.js native `fetch` (backed by `undici`) creates async contexts that `cls-hooked` does not track, so every custom sub-segment created via `resolveSegment().addNewSubsegment()` silently returns `null` — the `embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, and `matcher` spans have never appeared in X-Ray. AWS's recommended migration path is ADOT.

2. **Node.js 20 EOL** (April 2026): Node.js 22 is Active LTS. Staying on 20 past EOL is a security risk.

Switching to arm64 (Graviton3) is bundled because the ADOT migration already requires choosing the correct layer ARN (arm64 vs x86_64), and arm64 offers ~20% compute cost reduction with equivalent throughput.

## Goals / Non-Goals

**Goals:**
- Restore all five named spans in X-Ray by replacing `cls-hooked`-based context with `AsyncLocalStorage`-based OTel context
- Upgrade Lambda to Node.js 22 to exit EOL window
- Switch Lambda to arm64 and select the correct ADOT layer ARN
- Keep X-Ray as the tracing backend (console, service map, trace summaries unchanged)

**Non-Goals:**
- Changing the observability backend away from X-Ray
- Adding new spans or metrics beyond what already existed
- Upgrading the Pinecone, OTel, or AWS SDK dependencies beyond what the migration requires
- Splitting into multiple PRs

## Decisions

### D1: Single PR for all three changes

All three changes (Node.js 22, ADOT, arm64) are independent at the code level with no shared files. Bundling them avoids two separate deploy cycles and aligns naturally — the ADOT migration already requires choosing the arm64 layer ARN, making the arch decision unavoidable in the same change.

**Alternative considered:** Two PRs (Node.js 22 first, then ADOT + arm64). Rejected because the arm64 layer choice must be made alongside ADOT anyway, and one deploy cycle reduces total rollout risk.

### D2: ADOT managed Lambda layer + manual OTel spans

Use the AWS-managed ADOT Lambda layer (`aws-otel-nodejs-arm64-ver-*`) with `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler`. The layer auto-instruments AWS SDK v3 clients (replacing `captureAWSv3Client`). Manual spans for `embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, and `matcher` are replaced with `@opentelemetry/api` `tracer.startActiveSpan()` calls which correctly propagate via `AsyncLocalStorage`.

**Alternative A considered:** Layer only (no manual OTel spans). Rejected — the custom spans are the primary motivation for migrating; without them ADOT is just a library swap with no observability improvement.

**Alternative C considered:** Manual OTel SDK (no layer). Rejected — more invasive configuration, maintains our own SDK bootstrap code, no benefit over the managed layer at this scale.

### D3: `@opentelemetry/api` as `externalModules` (devDependency only)

The ADOT layer ships `@opentelemetry/api` at `/opt/nodejs/node_modules/@opentelemetry/api`. Marking it external in esbuild means Lambda resolves it from the layer at runtime, avoiding version skew and ~50 KB bundle bloat. Added as `devDependency` only for TypeScript compilation.

**Alternative considered:** Add to `nodeModules` (bundled copy). Rejected — two copies of the same package with potential version skew; the layer's copy is authoritative.

### D4: `tracer.startActiveSpan()` for all manual spans

`startActiveSpan()` passes the span as a callback argument and sets it as the active span in async context automatically via `AsyncLocalStorage`. Child AWS SDK spans created within the callback attach correctly to the right parent in X-Ray.

**Alternative considered:** `tracer.startSpan()` + manual context propagation. Rejected — requires threading a context object through every call, and child spans don't auto-attach.

### D5: QEMU setup step for arm64 Docker bundling on x86_64 CI

`potrace` is a native Node.js addon that must be compiled for arm64. CDK's `forceDockerBundling: true` with `architecture: ARM_64` selects the arm64 Lambda build image. GitHub Actions `ubuntu-latest` runners are x86_64 and need QEMU/binfmt support to run arm64 Docker images. Adding `docker/setup-qemu-action@v3` before the CDK deploy step enables this.

**Alternative considered:** Switching to arm64 GitHub Actions runners (`ubuntu-24.04-arm`). Rejected — incurs additional runner cost with no other benefit for this repo.

## Risks / Trade-offs

- **QEMU bundling is significantly slower** (3–5× for native compilation of potrace). The CDK deploy step has no explicit timeout; the deploy workflow may take 4–6 minutes longer. → Accept for now; switch to arm64 runners if this becomes a CI bottleneck.

- **ADOT layer version must be verified at implementation time.** The MAINTENANCE.md referenced `ver-1-30-0` (early 2025). Use the latest available version from the AWS public parameter store: `aws ssm get-parameter --name /aws/service/aws-otel-lambda/arm64/amd64/nodejs/latest --region {region}` or check the [ADOT Lambda layer releases](https://github.com/aws-observability/aws-otel-lambda). → Pin the version explicitly in CDK to avoid unexpected auto-upgrades.

- **potrace ARM binary.** The CDK arm64 build image should produce a correct arm64 binary via QEMU. If native compilation fails under QEMU emulation, the workaround is to pre-compile potrace and commit the binary or switch to the pure-JS `potrace` alternative. → Verify binary loads correctly in Lambda after first deployment.

- **`tryAddSubsegment` duplication removed.** Both `skeleton.ts` and `retrieval.ts` currently define their own `tryAddSubsegment`. After migration neither file needs it; removing both is net simplification.

## Migration Plan

1. Implement all code and CDK changes (see tasks.md)
2. Run `cdk diff` to confirm expected changes (new ADOT layer, ARM_64 arch, NODEJS_22_X runtime, no aws-xray-sdk in assets)
3. Deploy via `cdk deploy` — Lambda is replaced atomically; no in-flight requests are affected
4. Verify in X-Ray console: send a test request, confirm `DynamoDB`, `S3`, `SSM`, `embed`, `l3-candidates`, `svg-to-skeleton`, and `matcher` spans appear
5. **Rollback**: Revert the CDK stack changes (`NODEJS_20_X`, `X86_64`, remove ADOT layer, restore `aws-xray-sdk` in `nodeModules`) and redeploy — previous runtime, arch, and tracing are restored within a single `cdk deploy`
