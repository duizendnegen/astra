## Context

The retrieval pipeline has a silent failure mode: when all layers (L1, L3, L4) miss, it returns `TRIANGLE_FALLBACK` — a generic 3-point skeleton — as a 200 response. The frontend renders it as a real constellation with no indication anything went wrong. There is also a "best-cosine" fallback that uses the nearest-neighbour result regardless of similarity score, which produces unreliable shapes.

On the client side, there is no timeout: if the pipeline hangs (cold Lambda, slow LLM), the UI spins indefinitely. There is also a bug in `main.ts` where `setLoading(false)` in the `finally` block overwrites any error text set in `catch`, making all errors invisible.

## Goals / Non-Goals

**Goals:**
- Pipeline has exactly two outcomes: success or an explicit error
- Best-cosine fallback removed; triangle fallback maps to a 4xx response
- Client abandons after 20 seconds and shows a clean error
- "No constellation found." displayed at visible opacity when search fails
- catch/finally ordering fixed so errors are actually shown

**Non-Goals:**
- Retrying the search automatically on timeout or failure
- Differentiating timeout vs. no-match with different messages (both show the same text)
- Changing the L3/L4 parallel race logic or thresholds

## Decisions

### 1. HTTP 422 for no-match, not 404 or 500

**Decision**: Return `422 Unprocessable Entity` when the pipeline falls back to the triangle.

**Rationale**: 404 implies the resource doesn't exist; 500 implies a server error. 422 signals "the request was valid but we couldn't fulfill it" — semantically correct for "word understood, no constellation found". The frontend's existing `if (!res.ok)` check catches any non-200, so the specific code is less important than the body message.

**Alternative considered**: Return 200 with an `error` field. Rejected because it requires a schema change on the frontend and breaks the simple `if (!res.ok)` pattern.

### 2. Drop best-cosine fallback entirely

**Decision**: Remove the `bestSeen` tracking and fallback branch from `retrieval.ts`.

**Rationale**: The best-cosine path uses a below-threshold result (by definition, since it only fires when L1 didn't accept the match). With L4 (LLM SVG generation) running in parallel, any word that genuinely has a visual representation should produce something from L4. The best-cosine result is therefore either redundant (L4 found something better) or misleading (threshold wasn't met for a reason). Removing it simplifies the pipeline to: L1 → (L3 ∥ L4) → triangle fallback → 422.

### 3. Detect fallback via `match === null`, not `TRIANGLE_FALLBACK` identity

**Decision**: Handlers (`local.ts`, `skeleton.ts`) check `result.match === null` to determine whether to return 422, rather than importing and comparing against `TRIANGLE_FALLBACK`.

**Rationale**: `match === null` is the semantic condition — no provenance means nothing was found. Checking object identity against `TRIANGLE_FALLBACK` is an implementation detail of `retrieval.ts` that leaks into the handlers and requires them to import the constant. With the best-cosine fallback removed, `match === null` is exactly equivalent, and the handlers no longer need to reference `TRIANGLE_FALLBACK` at all. The constant can also be removed from `core.ts` once `retrieval.ts` is updated to return `{ match: null, skeletons: [] }` on failure.

### 4. Client-side 20-second timeout with AbortController

**Decision**: Use `AbortController` + `setTimeout` on the frontend to abort the fetch after 20 seconds. On abort, show the error and do not retry.

**Rationale**: The Lambda has a 30-second hard timeout. A 20-second client timeout gives users a clean error before the Lambda times out and returns an error at the CloudFront/API Gateway level. No retry: re-submitting with the same word would likely timeout again, and the user is better served by trying a different word.

### 5. Separate error CSS class

**Decision**: Add `.status-error` modifier to `style.css` that sets `opacity: 0.8` (vs `.status-hint`'s normal `0.5`). Set this class on the element when displaying an error, remove it on next search.

**Rationale**: Errors need more visual weight than loading hints. A single class toggle keeps the implementation clean without duplicating element structure.

### 6. Fix catch/finally ordering

**Decision**: In `findConstellation`, set the error text *after* calling `setLoading(false)` (not in the `catch` block before `finally` runs).

**Rationale**: The current pattern `catch { set text } finally { setLoading(false) → clears text }` is always broken. Moving error display to after the `finally` block — or restructuring so `setLoading` doesn't clear when there's an error — is necessary. The cleanest fix: track a local `errorMessage` variable in `catch`, call `setLoading(false)` in `finally`, then apply the error text afterward.

## Risks / Trade-offs

- **Aggressive timeout**: 20 seconds may occasionally cut off valid slow searches (cold Lambda + slow LLM). Mitigation: this is intentional — users waiting 20+ seconds already have a bad experience.
- **422 in CloudFront cache**: The `/api/*` path has caching disabled in the CDK config, so 422 responses won't be cached.
- **Best-cosine removal**: Words that previously got a low-quality cosine result will now get "No constellation found." if L4 also fails. This is a deliberate trade: a wrong shape is worse than an honest error.

## Open Questions

- None. All decisions are made.
