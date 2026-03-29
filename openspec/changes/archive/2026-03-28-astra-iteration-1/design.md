## Context

Greenfield application. No existing codebase. The stack is intentionally minimal: a static frontend (HTML + vanilla JS + Canvas) backed by a single AWS Lambda function. All intelligence is either client-side (star matching, rendering, export) or delegated to an LLM via OpenRouter. The project plan and all technical decisions are documented in `project-plan.md`.

## Goals / Non-Goals

**Goals:**
- Ship a working end-to-end experience: word in → constellation on real stars → shareable link + PNG export
- Keep the backend surface minimal (one Lambda, one DynamoDB table)
- All infrastructure reproducible via CDK
- Real star data everywhere — no fake or procedural stars

**Non-Goals:**
- Line drawing animation (deferred to post-MVP)
- Location-aware sky filtering (Iteration 2)
- User accounts, saved history, or server-side constellation storage
- Native mobile app

## Decisions

### Rendering: Pure Canvas (not SVG)
D3 is used for projection math only (RA/Dec → screen x,y). All drawing is on a single `<canvas>` element. The word overlay is HTML/CSS positioned above the canvas and composited via `ctx.fillText()` at PNG export time.

**Why over SVG:** PNG export via `canvas.toDataURL()` is one line and pixel-perfect. SVG→canvas conversion (html2canvas or Blob serialisation) is fragile and drops CSS filters/fonts that the design relies on. At 9,000 stars, canvas performance is trivially fast; SVG would create 9,000 DOM nodes.

### Camera model: projection centre + field of view
The star field has no fixed crop. A D3 stereographic projection is parameterised by `rotate` (centre RA/Dec) and `scale` (derived from field of view and viewport short dimension). Landing and result are two camera states; the transition is a D3 tween over both parameters simultaneously.

```
scale = (shortDimension / 2) / (2 × tan(fov / 2))
```

Landing: Orion centre (RA 83.8°, Dec −5.4°), 60° FOV. Result: matched patch centre, 25° FOV (~2.6× zoom).

**Why anchored to short dimension:** Ensures consistent angular coverage on any aspect ratio. A portrait mobile and landscape desktop both show the same 60° in their constrained dimension.

### Star matching: client-side Hungarian algorithm
All matching runs in the browser after the skeleton arrives from Lambda. HYG data (~1MB gzipped) is bundled as a static asset and loaded on page load. The Hungarian algorithm on 6–10 points is O(n³) but trivially fast at this size (<5ms). Patch sampling retries until 60% coverage threshold is met.

**Why client-side:** Zero server cost, no latency beyond the initial HYG asset load, and the matching is embarrassingly fast at this point count.

### Backend: single Lambda + DynamoDB cache
One endpoint: `POST /api/skeleton` → `{ name, points, edges }`. Lambda checks DynamoDB first (keyed by word, lowercase-trimmed). On cache miss, calls OpenRouter and writes the result back. The browser never holds an API key.

**Why DynamoDB over ElastiCache/Redis:** No VPC required, on-demand billing, Lambda-native. Skeletons are tiny (~300 bytes). Cost is negligible.

**Why OpenRouter over direct Claude/GPT-4 API:** Model-agnostic. Swap providers by config change, not code change. Single billing relationship.

### Share link: base64-encoded URL parameter, no backend
Constellation data (word, HYG star IDs, edges, patch RA/Dec) is serialised as compact JSON, base64-encoded, and stored as a URL parameter. Replaying a shared link requires no backend — the browser decodes and renders directly from the URL.

**Why no backend for replay:** Keeps Iteration 1 simple and eliminates any concern about constellation storage/expiry. The URL is the record.

### Infrastructure: CDK, single stack
One CDK stack provisions: S3 (private, OAC), CloudFront (custom domain, HTTPS), ACM certificate (us-east-1 — required for CloudFront), Route53 A alias, API Gateway (HTTP API), Lambda (Node.js), DynamoDB (on-demand).

**Why CDK over Terraform/SAM:** Native AWS, TypeScript, good L2 constructs for CloudFront + ACM + Route53 wiring. No additional toolchain.

## Risks / Trade-offs

**LLM response quality for unusual words** → Prompt includes explicit fallback instruction for abstract words (use visual metaphor). Schema validation + one retry + triangle fallback ensures no broken state.

**HYG asset load time (~1MB gzipped)** → Loaded on page load, not on submit. User types their word while the data loads. On slow connections the submit button should be disabled until ready, with a subtle loading indicator.

**Patch sampling may take multiple retries for sparse sky regions** → Matching is fast enough that 10–20 retries are imperceptible. Hungarian algorithm on 9,000 stars × 10 points per patch is still <50ms total for many attempts.

**Canvas text rendering for PNG export** → Web fonts must be loaded before `ctx.fillText()` is called, or the export falls back to a system font. Use `document.fonts.ready` before triggering export.

**CloudFront cache invalidation on deploy** → CDK deployment should trigger a CloudFront invalidation for `/*` on each S3 sync. Add to CDK stack as a custom resource or deployment hook.

## Migration Plan

Greenfield — no migration required.

Deployment order:
1. Deploy CDK stack (provisions all AWS resources, outputs CloudFront domain + API endpoint)
2. Update frontend config with API endpoint URL from CDK outputs
3. Build and sync frontend assets to S3
4. Trigger CloudFront invalidation
5. Verify astra.plusx.black resolves and end-to-end flow works

Rollback: re-sync previous S3 assets + CloudFront invalidation. Lambda rollback via alias/version pointer.

## Open Questions

None — all design decisions resolved through project planning.
