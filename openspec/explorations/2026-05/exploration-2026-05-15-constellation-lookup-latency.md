# Exploration: constellation-lookup-latency

**Date:** 2026-05-15
**Linked change:** none

## Context

Custom constellation lookup frequently exceeds 10 seconds end-to-end. The goal is to understand where time is lost, fill any logging gaps, identify what AWS surfaces can tell us, and converge on a plan that gets the happy path below 2 seconds. This exploration covers timing instrumentation, AWS observability, and the architectural choices that most affect latency.

## Observations

### Call path

```
Browser (20s client timeout)
  │
  └─→ CloudFront /api/*  (CACHING_DISABLED)
      │
      └─→ API Gateway HTTP API
          │
          └─→ Lambda: astra-skeleton (30s timeout, default 128 MB)
              │
              ├─→ DynamoDB GetCommand (astra-skeletons, PK=word)
              │     [no timing log]
              │
              ├─▶ CACHE HIT ─→ match(catalogue, skeletons)   ← still runs matcher!
              │                   └─→ matcher: 1-3 s
              │
              └─▶ CACHE MISS
                  │
                  ├─→ getOpenRouterKey()  [SSM if cold, in-memory if warm]
                  │
                  └─→ retrieveSkeleton(word, apiKey)
                      │
                      ├─ L0  normalise()                              ~1 ms
                      ├─ embed(normalised)  ← embedBatch([1])        ~1.5-3 s  ✓ logged
                      ├─ searchPinecone(queryVec, topK=5)            ~0.5-1 s  ✓ logged
                      │
                      ├─▶ L1 HIT (similarity ≥ 0.90 / 0.85 custom)
                      │     ├─ fetchSvgFromS3(id)                    ~0.5-1.5 s  ✗ NOT logged
                      │     └─ svgToSkeletonWithOpts(svg)            ~50-400 ms  ✗ NOT logged
                      │         → RETURN (layer=1)
                      │
                      └─▶ L1 MISS  →  parallel L3 + L4 with 5s timer
                          │
                          ├─ L3 (awaited first):
                          │   ├─ l3Candidates(word)  [Claude Haiku]  ~2-4 s  ✗ NOT logged (no t0 wrap)
                          │   ├─ embedBatch(5 candidates)            ~1-2 s  ✓ logged
                          │   └─ FOR i in 0..4 (SEQUENTIAL):
                          │       ├─ searchPinecone(vecs[i])         ~0.5-1 s  ✓ logged (per call)
                          │       ├─▶ HIT: fetchSvgFromS3(id)        ~0.5-1.5 s  ✗ NOT logged
                          │       └─▶ HIT: svgToSkeletonWithOpts()   ~50-400 ms  ✗ NOT logged
                          │               → RETURN early (first hit wins)
                          │
                          └─ L4 (concurrent, usually aborted):
                              ├─ l4GenerateFromImage()  [Gemini]     ~8-15 s
                              ├─ traceWithPotrace(png)               ~1-3 s
                              └─ svgToSkeletonWithOpts(svg)          ✗ NOT logged
                          │
                          └─→ match(catalogue, skeletons)
                                ├─ SpatialGrid init                  ~100 ms
                                ├─ Phase 1: pairwise prescreen       ~600-1500 ms  ✓ logged
                                ├─ Phase 2: greedy NN               ~300-800 ms   (included in search done)
                                └─ Phase 3: Hungarian               ~300-600 ms   (included in search done)
                                  Total match:                       ~1-3 s        ✓ logged (search done)
```

### Existing Pino timing coverage

| Location | What's logged | Coverage |
|---|---|---|
| `retrieval.ts` embedBatch | count + durationMs of embed call | ✓ |
| `retrieval.ts` searchPinecone | count + durationMs + topScore | ✓ |
| `retrieval.ts` L1 hit | elapsed since t0 at log.info | ✓ |
| `retrieval.ts` L1 miss | elapsed since t0 | ✓ |
| `retrieval.ts` L3 candidates | array + elapsed since t0 | ✓ |
| `retrieval.ts` L3 batch embed done | elapsed since t0 | ✓ |
| `retrieval.ts` L3 hit | elapsed since t0 | ✓ |
| `retrieval.ts` L3/L4 misc | elapsed since t0 | ✓ |
| `matcher.ts` prescreen done | durationMs (performance.now) | ✓ |
| `matcher.ts` search done | durationMs | ✓ |
| **`skeleton.ts`** DynamoDB GetCommand | **nothing** | ✗ |
| **`skeleton.ts`** total request duration | **nothing** | ✗ |
| **`retrieval.ts`** fetchSvgFromS3 | **nothing** | ✗ |
| **`retrieval.ts`** svgToSkeletonWithOpts | **nothing** | ✗ |
| **`retrieval.ts`** l3Candidates (LLM call itself) | elapsed from t0, not the call duration | ✗ (partial) |
| **`retrieval.ts`** per-candidate Pinecone in L3 loop | per-call yes, but no candidate index | ✓ (partial) |

### Lambda configuration (infra-stack.ts)

- **Memory**: not set → defaults to **128 MB** — very low for a Node.js process running concave hull, RDP simplification, and Hungarian O(n³) assignment
- **Timeout**: 30 s
- **Concurrency**: no reserved or provisioned concurrency → cold starts possible
- **No X-Ray tracing configured** in CDK

### Key bottleneck profile (L1 miss → L3 hit scenario)

Estimated worst-realistic path for a word that misses L1 but hits L3 on candidate 3 out of 5:

| Step | Time |
|---|---|
| DynamoDB get (warm) | ~20 ms |
| L1 embed | ~2000 ms |
| L1 Pinecone | ~700 ms |
| l3Candidates LLM | ~3000 ms |
| L3 batch embed | ~1200 ms |
| L3 loop cands 1-3 sequential Pinecone | ~2100 ms |
| L3 S3 fetch (hit) | ~800 ms |
| svgToSkeletonWithOpts | ~150 ms |
| match() (matcher) | ~1800 ms |
| DynamoDB put | ~30 ms |
| **Total** | **~11800 ms** |

The 2× biggest contributors: **L3 sequential Pinecone loop** and the **LLM calls** (l1 embed + l3Candidates + l3 batch embed). The matcher adds 1-2 s even on cache hit.

### Parallelization gap in L3

`retrieval.ts` lines 440-469: the L3 loop `for i in candidates` sequentially awaits `searchPinecone(vecs[i])` → `fetchSvgFromS3(id)` → `svgToSkeletonWithOpts()`. Five sequential Pinecone calls alone cost ~3.5 s. These could be parallelized with `Promise.all` over embed+search, keeping only S3+skeleton sequential on first hit.

### Cache hit still runs the full matcher

`skeleton.ts` lines 53-62: on a DynamoDB cache hit, `match(catalogue, skeletons)` is still called — the match result is not stored. For cached words the total request time is therefore purely the matcher: typically 1-3 s. Storing the match result in DynamoDB would make cache hits near-instant (<50 ms).

### AWS observability gaps

- **No CloudWatch custom metrics**: no metric for per-layer timing, no alarm on p99 > 5 s
- **No X-Ray tracing**: no distributed trace linking API Gateway → Lambda segments → downstream AWS calls (S3, DynamoDB, SSM)
- **Lambda Insights not enabled**: no enhanced metrics (memory usage, init duration, etc.)
- **CloudFront logs**: can show client-perceived latency per request if enabled (currently unknown)

## Rounds

## Round 1 — Logging gaps to close

### Q1.1 — Add request-level timing to skeleton.ts

`skeleton.ts` has no timing at all — we can't see how long DynamoDB takes, how long match() takes post-retrieval, or the wall-clock total. Should we add a `t0 = performance.now()` at handler entry and log total, DynamoDB, and match durations?

- [ ] Yes, add request-level timing to skeleton.ts ← recommended: without it we have no single source of truth for total request duration; gives us DynamoDB vs retrieval vs match split
- [ ] No — the existing retrieval.ts and matcher.ts logs are sufficient to reconstruct
- [x] Partial — only log total request duration, skip individual sub-timings

> **Your answer / freetext:**
>

### Q1.2 — Add fetchSvgFromS3 timing

`fetchSvgFromS3` has no timing. S3 GetObject in eu-central-1 for small SVG files is usually 50-300 ms but can spike. Should we log durationMs per S3 fetch?

- [x] Yes, log durationMs inside fetchSvgFromS3 ← recommended: S3 spikes are hard to detect without per-call timing; easy one-liner
- [ ] No — rely on X-Ray if we add it later
- [ ] Proxy via a wrapper in retrieval.ts instead

> **Your answer / freetext:**
>

### Q1.3 — Add svgToSkeletonWithOpts timing

SVG-to-skeleton conversion is synchronous CPU work: concave hull, RDP, normalisation. Estimated 50-400 ms per call, called up to 3 times per request (L1, L3, possibly L4). Should we log durationMs?

- [x] Yes, log durationMs in svgToSkeletonWithOpts or at each call site ← recommended: largest variance range of any CPU step; worth knowing if it's consistently fast or occasionally 400 ms
- [ ] No — profiling suggests it's negligible compared to network
- [ ] Add it only for the L4 path (most expensive)

> **Your answer / freetext:**
>

### Q1.4 — Improve l3Candidates timing

Currently `l3Candidates` duration is inferrable from t0 difference between "L0 normalised" and "L3 candidates" log lines, but not logged directly. Should we log the LLM call duration explicitly inside `l3Candidates`?

- [x] Yes, add t0/durationMs inside l3Candidates ← recommended: LLM latency is variable (2-4 s); knowing it directly makes it easier to attribute total time and detect model regressions
- [ ] No — the elapsed-since-t0 diff is close enough
- [ ] Move timing to the call site in retrieveSkeleton instead

> **Your answer / freetext:**
>

## Round 2 — AWS observability options

### Q2.1 — Enable AWS X-Ray tracing

X-Ray would give us a distributed trace: API Gateway → Lambda init duration → Lambda handler → S3/DynamoDB sub-segments, with timing for each AWS SDK call automatically captured. Costs ~$5/million traces. Should we enable it?

- [ ] Yes, enable X-Ray active tracing on the Lambda + API Gateway ← recommended: gives free DynamoDB and S3 sub-segment timing without code changes; pairs well with AWS Console Trace view for one-off diagnosis
- [ ] No — Pino structured logs in CloudWatch Logs Insights are sufficient
- [ ] Later — add Pino timing first, decide based on what we find

> **Your answer / freetext:**
> Yes, enable X-Ray active tracing on the Lambda + API Gateway. Remove custom timing measurement implementations in favour of X-Ray active tracing.

### Q2.2 — Increase Lambda memory

The CDK stack does not set `memorySize`, so the Lambda runs at 128 MB. Node.js heap for this function (star catalogue in memory, concave hull, Hungarian) almost certainly exceeds that, causing GC pressure and possibly hitting memory limits. Lambda CPU scales with memory (1792 MB = 1 vCPU). Should we increase it?

- [ ] Yes, set memorySize to 1024 MB ← recommended: CPU-intensive matcher and svg-to-skeleton will run faster; Lambda duration cost is cheap compared to the savings from shorter execution; easy CDK change
- [ ] Set to 512 MB as a conservative middle ground
- [x] Keep 128 MB until we measure — maybe most time is in network I/O not CPU

> **Your answer / freetext:**
>

### Q2.3 — CloudWatch Logs Insights queries for per-layer latency

We have structured Pino JSON logs. CloudWatch Logs Insights can query them with `filter @message like "L1 hit"` and `stats avg(durationMs)`. Should we define a set of saved queries to surface layer-by-layer latency from production logs?

- [ ] Yes, define 3-4 saved Logs Insights queries ← recommended: no infrastructure change needed; gives us baseline numbers before and after any optimization
- [x] No — X-Ray covers this if we add it
- [ ] Run ad-hoc queries manually, no need to save them

> **Your answer / freetext:**
>

### Q2.4 — Lambda cold start impact

Without provisioned concurrency, cold starts add 1-3 s to the first invocation after idle. Given that constellation lookup is triggered by user typing, cold starts hit real users. Should we address cold starts?

- [ ] Add provisioned concurrency for 1 instance (~$15/month)
- [ ] Add a scheduled ping every 5 minutes to keep the Lambda warm ← recommended: free, solves idle cold starts, sufficient for the traffic pattern
- [x] Accept cold starts — they're rare and the 2 s goal is for warm invocations
- [ ] Bundle the star catalogue into a Lambda layer to reduce init time

> **Your answer / freetext:**
>

## Round 3 — Architectural quick wins

### Q3.1 — Parallelize L3 Pinecone queries

The L3 loop calls `searchPinecone(vecs[i])` sequentially (retrieval.ts lines 440-469). With 5 candidates and ~700 ms per query, this alone costs ~3.5 s. We could `Promise.all` all 5 Pinecone queries simultaneously, then take the first hit for S3+skeleton.

- [x] Yes, parallelize all 5 Pinecone queries with Promise.all ← recommended: biggest single network win; drops L3 Pinecone time from ~3.5 s to ~0.7 s (one round trip); easy change, low risk
- [ ] Partial — run first 2 in parallel, early exit if hit, then next 2, etc.
- [ ] No — sequential is fine; LLM time dominates anyway

> **Your answer / freetext:**
>

### Q3.2 — Cache the match result in DynamoDB

Today the DynamoDB cache stores `{ word, skeletons, match: MatchProvenance }` but `match` is the provenance metadata, not the `MatchResult` from `matcher.match()`. So on every cache hit, the full 1-3 s matcher still runs. Storing the full `MatchResult` alongside skeletons would make cache hits sub-100 ms.

- [x] Yes, store MatchResult in DynamoDB cache and skip matcher on hit ← recommended: cache hits become near-instant; cache already persists indefinitely; biggest win for returning words
- [ ] No — MatchResult is large (star assignments, scores); keep cache slim
- [ ] Store a TTL-keyed summary and re-run matcher monthly to refresh star assignments

> **Your answer / freetext:**
>

### Q3.3 — Parallelize S3 fetches in L3 (after Pinecone parallelization)

If we parallelize Pinecone queries (Q3.1), multiple candidates might hit simultaneously. We'd need to fetch SVGs for all hits in parallel, then take the first valid skeleton.

- [x] Yes, fetch S3 for all Pinecone hits in parallel after Promise.all ← recommended: natural follow-on to Q3.1; drops total S3 wait from N× to 1× round trip
- [ ] Take the best-scoring hit only and fetch sequentially
- [ ] Not worth it — there's usually only one hit per request

> **Your answer / freetext:**
>

## Round 4 — X-Ray instrumentation scope

### Q4.1 — X-Ray coverage for OpenRouter HTTP calls

X-Ray auto-instruments AWS SDK calls (S3, DynamoDB, SSM) but NOT arbitrary `fetch()` calls to OpenRouter. That means `embedBatch`, `l3Candidates`, and `l4GenerateFromImage` — the slowest operations in the pipeline — would be invisible in X-Ray traces unless we add manual sub-segments via `aws-xray-sdk`. The alternative is to keep Pino timing for those calls only.

- [x] Add manual X-Ray sub-segments for each OpenRouter call ← recommended: keeps all timing in one place (X-Ray service map); `AWSXRay.captureAsyncFunc('embed', ...)` pattern is ~5 lines per call site
- [ ] Keep Pino durationMs for OpenRouter calls, rely on X-Ray for AWS SDK calls only
- [ ] Skip OpenRouter timing for now — X-Ray cold data is enough to start

> **Your answer / freetext:**
>

### Q4.2 — X-Ray sub-segment for matcher and svgToSkeletonWithOpts

Matcher and SVG-to-skeleton are pure CPU — no AWS services involved. X-Ray won't capture them automatically. Without instrumentation they appear as a silent block inside the Lambda segment. Should we wrap them in manual X-Ray sub-segments?

- [x] Yes, add a sub-segment for match() and one for svgToSkeletonWithOpts() ← recommended: makes the CPU vs I/O split visible in the trace waterfall without adding log noise
- [ ] No — matcher already logs via Pino; that's sufficient
- [ ] Only for match(), not svgToSkeletonWithOpts (too granular)

> **Your answer / freetext:**
>

### Q4.3 — X-Ray SDK approach

The `aws-xray-sdk` package can patch the AWS SDK automatically (`AWSXRay.captureAWSv3Client()`), but adding manual sub-segments requires `AWSXRay.getSegment()` which behaves differently inside Lambda (uses the automatically-created segment vs a custom root). Which approach fits best here?

- [x] Use aws-xray-sdk: patch AWS clients automatically + addNewSubsegment() for manual spans ← recommended: standard Lambda pattern; AWS SDK patching is zero-effort; manual subsegments for non-AWS calls add ~5 lines each
- [ ] Use OpenTelemetry with ADOT Lambda layer instead — vendor-neutral and future-proof
- [ ] Instrument only at the skeleton.ts handler level — coarse segments only

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Enable X-Ray active tracing on the Lambda and API Gateway via CDK (`tracing: lambda.Tracing.ACTIVE`) — _Reason:_ X-Ray auto-instruments AWS SDK calls (S3, DynamoDB, SSM) at zero code cost and gives a distributed waterfall trace that replaces ad-hoc Pino timing for AWS operations.

_Decision:_ Patch all AWS SDK clients with `AWSXRay.captureAWSv3Client()` at module init — _Reason:_ makes S3 GetObject, DynamoDB Get/Put, and SSM GetParameter appear as named sub-segments automatically; no call-site changes needed.

_Decision:_ Add manual X-Ray sub-segments (`AWSXRay.resolveSegment().addNewSubsegment()`) for `embedBatch`, `l3Candidates`, `l4GenerateFromImage`, `svgToSkeletonWithOpts`, and `match()` — _Reason:_ these are the operations X-Ray cannot see automatically (arbitrary `fetch()` and pure CPU work); without them the waterfall has a silent multi-second gap.

_Decision:_ Add a single Pino `log.info` for total request wall-clock duration in `skeleton.ts` handler — _Reason:_ gives a top-level number in CloudWatch Logs without duplicating what X-Ray already captures for sub-operations; all other Pino timing additions (Q1.2–Q1.4) are superseded by X-Ray sub-segments.

_Decision:_ Parallelize L3 Pinecone queries with `Promise.all` across all 5 candidates, then parallelize S3 fetches for all hits — _Reason:_ the sequential L3 loop is the single biggest architectural bottleneck (~3.5 s for 5 queries at ~700 ms each); parallelizing drops it to ~0.7 s; S3 parallelization follows naturally once queries run concurrently.

_Decision:_ Store the full `MatchResult` in DynamoDB alongside skeletons and skip `match()` on cache hit — _Reason:_ today every cache hit still runs the 1–3 s matcher; caching the result makes returning words respond in <100 ms (DynamoDB round-trip only).

_Decision:_ Defer Lambda memory increase until X-Ray baseline data shows CPU saturation — _Reason:_ most latency is suspected to be in I/O (OpenRouter, Pinecone, S3); bumping memory without data risks spending money without measurable gain.

_Decision:_ Accept Lambda cold starts for now; 2 s target applies to warm invocations only — _Reason:_ cold start frequency is low for the expected traffic pattern; provisioned concurrency adds fixed cost without clear ROI at this stage.

**Recommended implementation order:**
1. Add X-Ray tracing (CDK + SDK patching + manual sub-segments) and deploy — establish baseline
2. Review X-Ray traces for one L1 hit, one L3 hit, and one cache hit to confirm bottleneck profile
3. Implement L3 parallelization (`Promise.all` Pinecone + S3)
4. Implement MatchResult caching in DynamoDB
5. Re-evaluate Lambda memory if X-Ray shows matcher CPU time > 500 ms
