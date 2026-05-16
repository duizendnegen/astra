# Exploration: fixing-subsegment-tracing

**Date:** 2026-05-15
**Linked change:** none

## Context

Custom OTel spans (`embed`, `l3-candidates`, `l4-image-gen`, `svg-to-skeleton`, `matcher`) are instrumented via `tracer.startActiveSpan()` in `retrieval.ts` and `skeleton.ts`, but none appear in X-Ray traces. The ADOT layer is attached and `tracing: lambda.Tracing.ACTIVE` is set, but `AWS_LAMBDA_EXEC_WRAPPER` was removed after it caused a 500 on every request. The goal is to get sub-segment spans into X-Ray without crashing the Lambda.

## Observations

### Current state

```
infra-stack.ts
  layers:    [aws-otel-nodejs-arm64-ver-1-30-2]   ← layer present
  tracing:   lambda.Tracing.ACTIVE                 ← platform X-Ray on
  env:       (no AWS_LAMBDA_EXEC_WRAPPER)          ← wrapper disabled
  env:       (no OTEL_SERVICE_NAME etc.)

skeleton.ts / retrieval.ts
  import { trace } from '@opentelemetry/api'       ← bundled via nodeModules
  tracer = trace.getTracer('astra-lambda')         ← gets global no-op tracer
  tracer.startActiveSpan('embed', ...)             ← spans created but discarded
```

No TracerProvider is registered, so `trace.getTracer()` returns the global no-op provider. All `startActiveSpan` calls are silent no-ops at runtime.

### Why the wrapper crashed

The ADOT `otel-handler` wrapper script does roughly:

```js
const original = require(handlerModule);       // loads bundle
original.handler = wrapHandler(original.handler); // FAILS on Node 22
```

esbuild CJS output defines exports via `Object.defineProperty` with no `configurable: true`:

```js
Object.defineProperty(exports, "handler", {
  enumerable: true,
  get: () => handler   // non-configurable accessor
});
```

Attempting to redefine a non-configurable property throws `Cannot redefine property: handler`. This is not a Node 22 regression — it is a pre-existing esbuild behaviour, but the specific ADOT layer version (`1-30-2`) encountered it here for the first time (prior versions may have used a different patching strategy or the same bundle was previously CJS with plain `exports.handler = ...` assignment).

### ADOT layer contents (arm64 nodejs)

The layer provides:
- `/opt/otel-handler` — the wrapper script (broken on this bundle)
- `/opt/nodejs/node_modules/@opentelemetry/*` — full OTel SDK
- No separate ADOT collector; the nodejs layer exports spans directly to the Lambda X-Ray daemon via `@opentelemetry/exporter-otlp-*` → UDP port 2000 using X-Ray format

`@opentelemetry/api` is already bundled separately in the Lambda output via `nodeModules`. This means the layer's `@opentelemetry/api` and the bundled one are two separate instances — only one can hold the global TracerProvider.

### Fix surface area

Four distinct approaches exist, varying in invasiveness:

```
A. Newer ADOT layer version
   — check if ver-1-30-3+ or ver-1-31-x fixes Node 22 CJS compat
   — zero code changes if fixed upstream; unknown if available for arm64

B. Entrypoint shim (fix wrapper compat)
   — add a thin CJS shim as the Lambda entry that re-exports handler
     via plain assignment (writable + configurable by default)
   — the wrapper can then redefine it successfully
   — shim.js: module.exports.handler = require('./index.js').handler
   — re-enables AWS_LAMBDA_EXEC_WRAPPER; layer SDK is used as-is

C. NODE_OPTIONS --require bootstrap (bypass wrapper, keep layer SDK)
   — set NODE_OPTIONS=--require /opt/otel-bootstrap.js
   — a bootstrap file in the layer or bundled with the Lambda
     initializes NodeTracerProvider before handler code loads
   — no handler redefinition needed
   — unknown if /opt/otel-bootstrap.js exists in layer 1-30-2

D. Manual SDK init (no wrapper, no layer SDK)
   — remove the ADOT layer entirely
   — bundle @opentelemetry/sdk-trace-node + X-Ray exporter
   — call initTracing() synchronously at module top in skeleton.ts
   — full control; ~+150 KB to bundle
   — exporter question: how to reach X-Ray from OTel without the layer collector?
     → aws-xray-sdk's OTel bridge, or OTLP over HTTP to X-Ray daemon (port 2000 UDP
       only speaks X-Ray JSON, not OTLP — so needs a bridge or different exporter)
```

### Exporter question for option D

Lambda's X-Ray daemon at `127.0.0.1:2000` speaks X-Ray JSON over UDP. It does NOT speak OTLP. To get OTel spans into X-Ray without ADOT layer infrastructure, the options are:

- **`aws-xray-sdk-core` as a span processor/exporter** — wraps native X-Ray SDK calls; sends over UDP directly to the daemon. This is what ADOT's nodejs layer does internally.
- **`@opentelemetry/exporter-trace-otlp-proto` → `localhost:4317`** — only works if the ADOT *collector* layer is also attached (a separate layer from the nodejs one, heavier at ~90 MB).

### @opentelemetry/api singleton and the two-instance trap

`@opentelemetry/api` uses a global singleton pattern: whoever calls `trace.setGlobalTracerProvider()` first wins, and all subsequent `trace.getTracer()` calls in any module in the same process use that provider. This only works if every module in the process resolves to the **same physical file** on disk. If two copies exist (one bundled, one from the layer), each has its own singleton — registering a provider in one is invisible to the other.

Current state:
- ADOT layer ships `@opentelemetry/api` at `/opt/nodejs/node_modules/@opentelemetry/api`
- The Lambda bundle ships its own copy at `/var/task/node_modules/@opentelemetry/api` (via `nodeModules`)
- Handler code `import { trace } from '@opentelemetry/api'` resolves to the **bundled** copy
- The ADOT wrapper (if active) registers a TracerProvider on the **layer** copy
- Result: handler gets a no-op tracer even if the wrapper runs successfully

Fix: make `@opentelemetry/api` external (`externalModules`, not `nodeModules`) so it resolves from the layer. Commit `0ef65ff` put it in `nodeModules` because Node 22 couldn't find it from the layer **without** the wrapper setting `NODE_PATH`. If the wrapper runs, Node 22 finds it from the layer fine — so fixing the wrapper crash also unblocks making the API external again.

### Why the wrapper crashes: esbuild output format

esbuild's CJS output for `export async function handler` compiles to:

```js
var __export = (target, all) => {
  for (var name in all)
    Object.defineProperty(target, name, { get: all[name], enumerable: true });
                                       // ^ no configurable: true  ← problem
};
__export(exports, { handler: () => handler });
```

`Object.defineProperty` without `configurable: true` defaults to `configurable: false`. Node.js then refuses any attempt to redefine or reassign the property. The ADOT wrapper does roughly `exports.handler = wrapFn(exports.handler)` → `TypeError: Cannot redefine property: handler`.

**Official fix (documented by AWS ADOT):** Replace the ES module export with a CommonJS assignment at module level:

```typescript
// Before (causes non-configurable accessor):
export async function handler(event) { ... }

// After (creates plain writable property):
async function handler(event) { ... }
module.exports = { handler };
```

When esbuild sees `module.exports = { handler }`, it outputs a plain object assignment that **replaces** the `exports` reference entirely. The resulting property is configurable and writable — the wrapper can patch it normally.

In TypeScript, using `module.exports` alongside other `import` statements works because esbuild targets CJS output regardless. TypeScript itself will type-check it correctly as long as `esModuleInterop` is enabled (it is in the CDK NodejsFunction default tsconfig).

### SpanKind: segments vs subsegments in X-Ray

X-Ray has two concepts:
- **Segment** — top-level trace entry, one per request
- **Subsegment** — child of a segment, any depth

OTel maps to these via `SpanKind`:
- `SpanKind.SERVER` → X-Ray **segment**
- Everything else (`INTERNAL`, `CLIENT`, `PRODUCER`, `CONSUMER`) → X-Ray **subsegment**

The current `startActiveSpan('embed', ...)` calls have no SpanKind (defaults to `INTERNAL`) → they would be subsegments. **But they need a parent segment to attach to.** Without a root `SERVER` span, X-Ray has no segment to nest them under, and they may be dropped or appear disconnected.

The ADOT layer's `@opentelemetry/instrumentation-aws-lambda` solves this automatically: it wraps the Lambda handler and creates a root `SpanKind.SERVER` span for every invocation, giving all custom `INTERNAL` spans a parent. This is activated by the wrapper, not by any code change.

Without the wrapper, a root span must be created manually:

```typescript
tracer.startActiveSpan('handler', { kind: SpanKind.SERVER }, async (rootSpan) => {
  // all startActiveSpan calls inside are nested subsegments
  rootSpan.end();
});
```

### Span flushing and Lambda freeze

Lambda freezes the container immediately after the handler returns. `BatchSpanProcessor` uses background timers to flush — those timers are frozen too, so buffered spans may never be exported. The ADOT `AwsLambdaInstrumentation` calls `provider.forceFlush()` synchronously at the end of each invocation, which is why it works correctly. Without the instrumentation, a manual flush must be called before the handler resolves.

### Layer version status

`aws-otel-nodejs-arm64-ver-1-30-2` is currently the latest patch of the 1.30 series. No newer version specifically fixes the esbuild non-configurable export issue — the documented workaround is the `module.exports` fix above. The `ver-1-30-0` → `ver-1-30-2` patches added Node 22 runtime support and selective instrumentation env vars (`OTEL_NODE_ENABLED_INSTRUMENTATIONS`).

## Rounds

## Round 1 — Approach selection

### Q1.1 — Try a newer ADOT layer version first?

Research shows `ver-1-30-2` is already the latest patch and no newer version specifically addresses the esbuild non-configurable export issue. The fix is documented as a code-side workaround, not a layer update. No need to wait.

- [x] No — `ver-1-30-2` is current; the documented fix is in the handler export syntax, not the layer ← confirmed by research
- [ ] Yes, wait for a newer layer version

> **Your answer / freetext:**
>

### Q1.2 — Preferred fix approach

Research narrows the options. The officially documented fix (in AWS ADOT docs) is to use `module.exports = { handler }` instead of `export async function handler`. This makes the property configurable so the wrapper can patch it. Two sub-approaches:

- [x] A — Add `module.exports = { handler }` at the end of `skeleton.ts`, re-enable `AWS_LAMBDA_EXEC_WRAPPER`, move `@opentelemetry/api` back to `externalModules` ← recommended: ~3 line change, official documented fix, keeps ADOT layer doing all OTel init
- [ ] B — Manual SDK init: remove ADOT layer, bundle `@opentelemetry/sdk-trace-node` + `@opentelemetry/instrumentation-aws-lambda` + X-Ray exporter, init via `NODE_OPTIONS=--require`; no wrapper needed but ~150 KB extra bundle and more code to maintain

> **Your answer / freetext:**
>

### Q1.3 — @opentelemetry/api instance: external vs bundled

Research confirms: if `@opentelemetry/api` is bundled (current `nodeModules`), there are two instances and the ADOT wrapper's TracerProvider registration is invisible to handler code → still no-op. The fix for approach A is to move it back to `externalModules` so the layer's copy is used. This only works when the wrapper runs (it sets `NODE_PATH` so the layer's copy is resolvable in Node 22). Commit `0ef65ff` moved it to `nodeModules` precisely because the layer copy wasn't resolvable without the wrapper. Fixing the wrapper crash (Q1.2) unblocks moving it back.

- [x] Move `@opentelemetry/api` back to `externalModules` once wrapper crash is fixed ← required for approach A; the two fixes are coupled
- [ ] Keep bundled copy, manually init TracerProvider in the bundled copy ← required for approach B

> **Your answer / freetext:**
>

## Round 2 — Span correctness

### Q2.1 — Root SERVER span

The ADOT `AwsLambdaInstrumentation` (activated by the wrapper) automatically creates a `SpanKind.SERVER` root span for each Lambda invocation — this becomes the X-Ray segment. All custom `startActiveSpan` calls inside become subsegments nested under it. No code change needed for this if the wrapper is running.

If approach B (manual SDK init) is chosen, a root `SERVER` span must be created manually at the top of the handler. Which is acceptable?

- [x] Rely on `AwsLambdaInstrumentation` via the ADOT wrapper (approach A) — no manual root span needed ← recommended
- [ ] Create root span manually in handler with `{ kind: SpanKind.SERVER }` (approach B or fallback)

> **Your answer / freetext:**
>

### Q2.2 — Span flush before Lambda freeze

Without explicit flushing, `BatchSpanProcessor` timers are frozen with the container and spans may be lost. `AwsLambdaInstrumentation` calls `provider.forceFlush()` synchronously after each invocation — this is handled automatically by the ADOT wrapper. No code change needed for approach A.

- [x] Rely on ADOT layer's `AwsLambdaInstrumentation` flush (approach A) ← recommended: already handled, no code change
- [ ] Add manual `forceFlush()` call at end of handler (required for approach B)

> **Your answer / freetext:**
>

### Q2.3 — OTEL_NODE_ENABLED_INSTRUMENTATIONS scope

The ADOT layer by default auto-instruments `aws-sdk,aws-lambda,http`. For this Lambda, auto-instrumenting `aws-sdk` captures DynamoDB, S3, and SSM as subsegments automatically at zero code cost. `http` captures all outgoing `fetch()` calls including OpenRouter — but the current code already wraps those in manual `startActiveSpan` calls, so there would be duplicate spans. Should we limit auto-instrumentation to avoid duplicates?

- [x] Set `OTEL_NODE_ENABLED_INSTRUMENTATIONS=aws-lambda,aws-sdk` — keep AWS SDK auto-instrumentation, disable `http` to avoid duplicates with manual spans ← recommended
- [ ] Keep default (`aws-sdk,aws-lambda,http`) — accept duplicate spans for OpenRouter calls
- [ ] Disable all auto-instrumentation (`OTEL_NODE_ENABLED_INSTRUMENTATIONS=aws-lambda`) — only manual spans

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Change `export async function handler` in `skeleton.ts` to `async function handler` + `module.exports = { handler }` at the end of the file — _Reason:_ esbuild's CJS output for ES module exports uses `Object.defineProperty` without `configurable: true`, making the property non-redefinable; a `module.exports` assignment replaces the exports object with a plain configurable property the ADOT wrapper can patch.

_Decision:_ Re-enable `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` in the Lambda environment — _Reason:_ the wrapper crash was the only reason it was removed; fixing the export syntax resolves the crash; the wrapper is required for OTel SDK init, root span creation, and pre-freeze flush.

_Decision:_ Move `@opentelemetry/api` from `nodeModules` back to `externalModules` in CDK bundling config — _Reason:_ two bundled copies of the API create separate singletons; the ADOT wrapper registers the TracerProvider on the layer copy while handler code imports the bundled copy, leaving it as a no-op; making it external forces resolution to the layer's single copy; this is only safe once the wrapper is running (it sets `NODE_PATH` so the layer copy is resolvable on Node 22).

_Decision:_ Remove `@opentelemetry/api` from `lambda/package.json` dependencies (move back to devDependencies) — _Reason:_ it no longer needs to be bundled or installed in the output once it's external again.

_Decision:_ Set `OTEL_SERVICE_NAME=astra-skeleton` in Lambda environment — _Reason:_ names the service in X-Ray service map; without it traces appear under a generic name.

_Decision:_ Set `OTEL_NODE_ENABLED_INSTRUMENTATIONS=aws-lambda,aws-sdk` in Lambda environment — _Reason:_ disables `http` auto-instrumentation to avoid duplicate spans for OpenRouter `fetch()` calls that are already wrapped in manual `startActiveSpan` calls; keeps `aws-sdk` to capture DynamoDB, S3, and SSM subsegments automatically.

**Implementation order:**
1. `skeleton.ts`: change export syntax to `module.exports = { handler }`
2. `infra-stack.ts`: move `@opentelemetry/api` to `externalModules`, add `AWS_LAMBDA_EXEC_WRAPPER`, `OTEL_SERVICE_NAME`, `OTEL_NODE_ENABLED_INSTRUMENTATIONS`
3. `lambda/package.json`: move `@opentelemetry/api` back to devDependencies
4. Deploy and verify a trace for a known word shows `embed`, `l3-candidates`, `matcher`, etc. as subsegments
