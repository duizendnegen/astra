## Why

Custom constellation lookup takes 10+ seconds end-to-end for cache misses due to three compounding issues: the L3 Pinecone search loop runs sequentially (5 × ~700 ms), every cache hit still reruns the 1–3 s matcher because `MatchResult` is not stored, and there is no per-layer timing visibility to confirm where time is actually spent. The goal is a warm-path response time below 2 seconds.

## What Changes

- Enable AWS X-Ray active tracing on the Lambda and API Gateway; patch all AWS SDK clients for automatic sub-segment capture; add manual sub-segments for OpenRouter HTTP calls (`embedBatch`, `l3Candidates`, `l4GenerateFromImage`), `svgToSkeletonWithOpts`, and `match()` — replacing scattered Pino timing additions with unified trace-level visibility
- Add a single Pino `log.info` for total request wall-clock duration in `skeleton.ts` handler
- Parallelize the L3 candidate loop: all 5 Pinecone queries run concurrently via `Promise.all`; S3 fetches for all hits run concurrently; the first valid skeleton result wins
- Store the full `MatchResult` in DynamoDB alongside skeletons; return it directly on cache hit, skipping the matcher entirely

## Capabilities

### New Capabilities

- `xray-observability`: AWS X-Ray active tracing on Lambda and API Gateway, with automatic AWS SDK sub-segments and manual sub-segments for OpenRouter calls and CPU-intensive operations

### Modified Capabilities

- `retrieval-pipeline`: L3 candidate search changes from sequential-with-early-exit to parallel-all-then-first-valid-skeleton; trail accumulation must remain correct under parallel execution
- `constellation-api`: DynamoDB cache now stores and returns the full `MatchResult`; cache hits skip the matcher and return in < 100 ms

## Impact

- **`lambda/src/retrieval.ts`**: L3 loop refactored; X-Ray sub-segments added to `embedBatch`, `l3Candidates`, `l4GenerateFromImage`, `fetchSvgFromS3`, `svgToSkeletonWithOpts`
- **`lambda/src/skeleton.ts`**: DynamoDB schema extended to store `matchResult`; cache-hit path returns stored result directly; total request duration logged; X-Ray SDK client patching at module init
- **`lambda/src/matcher.ts`**: X-Ray sub-segment wrapping `match()` call
- **`infra/lib/infra-stack.ts`**: `tracing: lambda.Tracing.ACTIVE` on Lambda; X-Ray write permissions granted to execution role
- **`lambda/package.json`**: add `aws-xray-sdk` dependency
- **DynamoDB schema**: `matchResult` field added to cache items (backward-compatible; existing items without it fall through to matcher as before)
