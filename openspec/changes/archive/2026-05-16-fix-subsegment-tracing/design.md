## Context

The ADOT Lambda layer (`aws-otel-nodejs-arm64-ver-1-30-2`) is attached and X-Ray active tracing is enabled, but custom OTel spans never appear in traces. The wrapper was disabled after `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` caused `TypeError: Cannot redefine property: handler` on every invocation. Two separate bugs are entangled:

1. **Wrapper crash**: esbuild's CJS output defines `exports.handler` via `Object.defineProperty` without `configurable: true`. The ADOT wrapper tries to reassign this property → throws.
2. **Two-instance `@opentelemetry/api` trap**: to work around the crash, `@opentelemetry/api` was moved to `nodeModules` (bundled). This creates two separate singletons — the layer's TracerProvider is registered on the layer's copy, but handler code imports the bundled copy → no-op tracer regardless of wrapper state.

The two bugs must be fixed together; fixing one without the other leaves tracing broken.

## Goals / Non-Goals

**Goals:**
- Custom spans (`embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, `matcher`) appear as X-Ray subsegments in every trace
- DynamoDB, S3, and SSM calls appear as auto-instrumented subsegments via the ADOT layer
- Lambda continues to serve requests with no regression

**Non-Goals:**
- Adding new span instrumentation call sites (already in code from prior change)
- Changing the ADOT layer version
- Adding CloudWatch alarms or Insights queries

## Decisions

### D1 — Fix export syntax via `module.exports = { handler }`

**Decision:** Add `module.exports = { handler };` at the end of `skeleton.ts`, removing the `export` keyword from the handler function declaration.

**Rationale:** When esbuild compiles `export async function handler`, it calls `Object.defineProperty(exports, "handler", { get: () => handler, enumerable: true })`. Without `configurable: true` (the default), Node.js refuses any subsequent redefinition. Adding `module.exports = { handler }` at module level outputs a plain object assignment in esbuild's CJS bundle — this replaces the entire `exports` reference with a new object whose `handler` property is configurable. This is the fix documented in the official AWS ADOT docs for esbuild-bundled Lambdas.

**Alternatives considered:**
- *Entrypoint shim file*: a separate `entry.js` doing `module.exports.handler = require('./bundle').handler`. Requires changing the CDK `entry` path and adds a file to maintain. The inline `module.exports` approach is simpler.
- *Newer ADOT layer version*: `ver-1-30-2` is already the latest; no upstream fix exists.
- *Manual SDK init without wrapper*: would require bundling `@opentelemetry/sdk-trace-node`, `@opentelemetry/instrumentation-aws-lambda`, and a custom X-Ray exporter. Significantly more code and bundle weight for the same result.

### D2 — Keep `@opentelemetry/api` bundled via `nodeModules`

**Decision:** Keep `@opentelemetry/api` in `nodeModules` in the CDK bundling config and in `lambda/package.json` production dependencies.

**Rationale:** The original plan was to move it to `externalModules` to avoid a "two-instance" problem. That plan was invalidated on two grounds:

1. **The two-instance concern was a misdiagnosis.** `@opentelemetry/api` ≥1.0 stores the global `TracerProvider` at `global[Symbol.for('opentelemetry.js.api.1')]` — a key shared across all `require()` instances in the same Node.js process. Even with two separate copies of the package loaded (one bundled, one from the layer), both copies read and write the same global slot. The ADOT wrapper's registered provider is therefore visible to bundled handler code.

2. **The ADOT layer does not expose `@opentelemetry/api` as a standalone resolvable package.** Moving to `externalModules` caused `Runtime.ImportModuleError: Cannot find module '@opentelemetry/api'` on every invocation — confirmed in CloudWatch Logs. The layer bundles `@opentelemetry/api` internally within its SDK but does not install it at a path reachable via `NODE_PATH`.

**Alternatives considered:**
- *Move to `externalModules`*: attempted during implementation; caused `Runtime.ImportModuleError` crash. Reverted.

### D3 — Enable selective auto-instrumentation

**Decision:** Set `OTEL_NODE_ENABLED_INSTRUMENTATIONS=aws-lambda,aws-sdk`.

**Rationale:** The default (`aws-sdk,aws-lambda,http`) would auto-instrument all `fetch()` calls via `http`, producing duplicate spans for the OpenRouter calls that are already wrapped in manual `startActiveSpan` calls. Disabling `http` keeps the waterfall clean. `aws-sdk` captures DynamoDB, S3, and SSM calls automatically at zero code cost.

## Risks / Trade-offs

- **`module.exports` and TypeScript types**: Mixing `import` statements and `module.exports` in the same TypeScript file is unusual. esbuild handles it correctly (CJS output), and TypeScript with `esModuleInterop: true` accepts it without errors. If `tsconfig` `module` is ever changed to `nodenext` or `esnext`, this pattern would need revisiting.
- **`@opentelemetry/api` is bundled, not from the layer**: If `AWS_LAMBDA_EXEC_WRAPPER` is accidentally removed, the bundled `@opentelemetry/api` will still load and the Lambda will serve requests normally — tracing becomes a silent no-op rather than a crash. This is a safe degradation mode.
- **Cold start overhead**: The ADOT wrapper adds OTel SDK initialisation to the cold start path. Expected impact is 100-300 ms on cold starts only. Warm invocations are unaffected.

## Migration Plan

1. Deploy all changes together in one CDK deploy — the `module.exports` fix, `externalModules` change, and env var additions must all land simultaneously
2. Trigger a warm invocation of a known word (e.g. "pheromone") and inspect the X-Ray trace in the AWS Console
3. Verify `embed`, `matcher`, and at least one of `l3-candidates`/`l4-image-gen`/`svg-to-skeleton` appear as named subsegments
4. Verify DynamoDB and S3 subsegments appear automatically

**Rollback:** Revert the CDK deploy. The prior state (no wrapper, bundled `@opentelemetry/api`) is a valid — if degraded — configuration: tracing is a no-op but the Lambda serves requests normally.
