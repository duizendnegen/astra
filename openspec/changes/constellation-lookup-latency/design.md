## Context

The `POST /api/constellation` Lambda handler sits behind API Gateway and CloudFront (caching disabled for `/api/*`). Every request hits the Lambda; warm DynamoDB hits still run the full matcher. The retrieval pipeline (retrieval.ts) does L1 → L3/L4 with the L3 candidate loop fully sequential. AWS SDK calls (S3, DynamoDB) have no distributed tracing, and OpenRouter HTTP calls have no timing visibility at all. The star catalogue (~10 k stars) is loaded into memory at module init; the matcher runs on every request including cache hits.

## Goals / Non-Goals

**Goals:**
- Add X-Ray active tracing for end-to-end visibility with no Pino duplication for AWS SDK operations
- Manual X-Ray sub-segments for OpenRouter fetch calls and CPU operations (matcher, svg-to-skeleton)
- Parallelise L3 Pinecone queries and S3 fetches so the L3 path costs ~1 Pinecone RTT instead of 5
- Cache the full `MatchResult` in DynamoDB so warm cache hits skip the matcher entirely

**Non-Goals:**
- Lambda memory tuning — deferred until X-Ray baseline data is collected
- Provisioned concurrency / cold-start mitigation
- CloudWatch alarms or dashboards (first get data, then alert on it)
- Changing the L1 or L4 path execution model
- Pre-warming the DynamoDB cache with common words

## Decisions

### D1 — X-Ray SDK over OpenTelemetry

Use `aws-xray-sdk` with `captureAWSv3Client()` patching rather than the ADOT Lambda layer.

**Why:** ADOT requires a separate Lambda layer, more deployment steps, and additional CDK configuration. `aws-xray-sdk` is a standard npm package, integrates directly with the existing `DynamoDBClient`, `S3Client`, and `SSMClient` instances at module init, and adds automatic sub-segments for every AWS SDK call with no per-call changes. Manual sub-segments for OpenRouter and CPU operations use `AWSXRay.resolveSegment().addNewSubsegment()` which works correctly inside Lambda's automatically-created facade segment.

**Alternative considered:** OpenTelemetry via ADOT — vendor-neutral but adds layer management and a more complex SDK surface for what is a single-service Lambda.

### D2 — Parallel-all L3 pattern (not race/early-exit)

Run all 5 Pinecone queries concurrently via `Promise.all`, collect all hits, then fetch S3 for all hits concurrently, take the first valid skeleton in candidate-index order.

**Why:** An early-exit race (abort remaining queries when first hit is found) is harder to implement correctly with the abort-signal pattern already in use for L3/L4, and the Pinecone queries are cheap once in-flight — there is no meaningful cost to letting 4 run to completion. The result ordering (best candidate by index wins, not by arrival) is preserved.

**Trail accumulation:** The trail must still record every candidate. Under parallel execution, trail entries are written after `Promise.all` resolves: misses recorded for all non-winning candidates, one hit recorded for the winner.

**Alternative considered:** Sequential with `Promise.race` per pair — reduces maximum in-flight requests but saves nothing in the common case.

### D3 — Store MatchResult in DynamoDB as `matchResult` field

Extend the DynamoDB cache item schema with an optional `matchResult` field containing the serialised `MatchResult` (constellation stars, edges, scores, patch RA/Dec, procrustes angle). On cache hit, if `matchResult` is present, return it directly without calling `match()`.

**Why:** The matcher runs 1–3 s on every cache hit regardless of whether the star catalogue has changed. The catalogue is static (bundled at deploy time). Caching the result is safe indefinitely. Storing it alongside the existing `skeletons` field keeps the DynamoDB schema simple.

**Backward compatibility:** Existing cache items without `matchResult` fall through to the matcher as today. No migration needed.

**Alternative considered:** Separate DynamoDB table for match results — unnecessary complexity; the existing item is the right unit of cache.

### D4 — Single Pino total-duration log in skeleton.ts

Add one `log.info({ word, durationMs, cacheHit }, 'request complete')` at handler exit. No other Pino timing additions.

**Why:** X-Ray covers all sub-operation timing. The only gap is the wall-clock request total visible in CloudWatch Logs, which is useful for quick grep-based triage without opening X-Ray.

## Risks / Trade-offs

- **X-Ray cost**: ~$5 per million traces. At low traffic this is negligible; at scale it is still cheap relative to the latency gains.
- **aws-xray-sdk bundle size**: Adds ~1 MB to the Lambda bundle. Lambda cold start time increases slightly; acceptable given cold starts are out of scope.
- **Parallel S3 fetches when all 5 candidates hit**: Unlikely (typically 0–1 hits per request), but if all 5 hit, 5 concurrent S3 GetObject calls fire. S3 has no concurrency limit concern at this scale; the added cost (duration × memory) is dominated by the hit being rare.
- **MatchResult staleness**: If the star catalogue is updated (new HYG data bundled at deploy), cached match results reference the old star set. Since catalogue updates are intentional and infrequent, the acceptable mitigation is to flush the DynamoDB cache (batch delete all items) after a catalogue-changing deploy. Add this to the deploy runbook.
- **aws-xray-sdk facade segment in Lambda**: Inside Lambda, `AWSXRay.resolveSegment()` returns the facade segment injected by the runtime. If the Lambda is invoked without X-Ray active (e.g., direct test invocations), the facade segment may not exist. Guard all `addNewSubsegment()` calls with a `try/catch` that logs a debug-level warning rather than throwing.

## Migration Plan

1. Deploy X-Ray changes (CDK + SDK patching + sub-segments) to production
2. Run 5–10 test queries of each type (cache hit, L1 miss → L3 hit, L1 hit) and review X-Ray traces in the AWS Console to confirm baseline timing
3. Deploy L3 parallelisation — verify trail correctness via integration test
4. Deploy MatchResult caching — verify cache-hit path returns `matchResult` directly; verify backward compat with existing cache items (no `matchResult` field)
5. Review X-Ray traces post-deploy; decide on Lambda memory tuning if matcher sub-segment shows CPU saturation

**Rollback:** Each step is independently deployable and reversible. MatchResult caching is additive (existing items without the field are unaffected). L3 parallelisation is a behaviour-preserving refactor; reverting is a one-file change. X-Ray tracing is toggled via the CDK `tracing` property.
