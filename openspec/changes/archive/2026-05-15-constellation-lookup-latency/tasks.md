## 1. X-Ray Infrastructure

- [x] 1.1 Add `aws-xray-sdk` to `lambda/package.json` and run `npm install`
- [x] 1.2 Enable X-Ray active tracing on the Lambda in `infra/lib/infra-stack.ts` (`tracing: lambda.Tracing.ACTIVE`)
- [x] 1.3 Enable X-Ray tracing on the HTTP API Gateway stage in CDK
- [ ] 1.4 Run `cdk diff` to confirm only tracing-related IAM and Lambda changes are present

## 2. AWS SDK Client Patching

- [x] 2.1 In `lambda/src/skeleton.ts`, import `AWSXRay` from `aws-xray-sdk` and wrap `DynamoDBClient`, `S3Client`, and `SSMClient` instances with `AWSXRay.captureAWSv3Client()` at module init
- [x] 2.2 Wrap `DynamoDBDocumentClient` creation after patching the underlying `DynamoDBClient`
- [x] 2.3 Add a guard: if `AWSXRay.resolveSegment()` throws (no active segment), log at `debug` level and continue — apply this pattern to all manual sub-segment sites

## 3. Manual X-Ray Sub-Segments — OpenRouter Calls

- [x] 3.1 In `retrieval.ts` `embedBatch`: wrap the `fetch()` call in a sub-segment named `embed`; close in `finally`
- [x] 3.2 In `retrieval.ts` `l3Candidates`: wrap the `fetch()` call in a sub-segment named `l3-candidates`; close in `finally`
- [x] 3.3 In `retrieval.ts` `l4GenerateFromImage`: wrap the `fetch()` call in a sub-segment named `l4-image-gen`; close in `finally`

## 4. Manual X-Ray Sub-Segments — CPU Operations

- [x] 4.1 In `retrieval.ts`, wrap each `svgToSkeletonWithOpts()` call site in a sub-segment named `svg-to-skeleton`
- [x] 4.2 In `skeleton.ts`, wrap each `match()` call site in a sub-segment named `matcher`

## 5. Total Request Duration Log

- [x] 5.1 In `skeleton.ts` handler, record `const t0 = performance.now()` at entry
- [x] 5.2 At each `return` path, emit `log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit }, 'request complete')` before returning

## 6. Parallelize L3 Pinecone Queries and S3 Fetches

- [x] 6.1 In `retrieval.ts` L3 task, replace the sequential `for` loop with a `Promise.all` over all candidate vectors calling `searchPinecone(vecs[i])` concurrently
- [x] 6.2 Collect all Pinecone results that exceed `THRESHOLD_PHOSPHOR_L3`; run `Promise.all` over `fetchSvgFromS3` for each hit
- [x] 6.3 Iterate hits in candidate-index order, call `svgToSkeletonWithOpts()` for each, and return on the first valid skeleton
- [x] 6.4 Build the `TrailEntry[]` trail after parallel resolution: all non-winning candidates get `hitId: null, sim: null`; the winning candidate gets its `hitId` and `sim`
- [x] 6.5 Ensure the abort signal is still respected: check `l3Controller.signal.aborted` before issuing the Pinecone queries and before returning the result

## 7. Cache MatchResult in DynamoDB

- [x] 7.1 Extend the `CacheItem` interface in `skeleton.ts` with `matchResult?: MatchResult`
- [x] 7.2 On cache hit: if `item.matchResult` is present, return it directly without calling `match()`
- [x] 7.3 On cache hit without `matchResult`: run `match()`, update the DynamoDB item with `matchResult` via `PutCommand`, then return
- [x] 7.4 On cache miss after pipeline: include `matchResult` in the `PutCommand` item written to DynamoDB

## 8. Tests

- [x] 8.1 Add a unit test for the parallel L3 path: mock `searchPinecone` to return hits for candidates 2 and 4; assert that the skeleton for candidate 2 is returned and the trail is correct
- [x] 8.2 Add a unit test for the `MatchResult` cache hit path: mock DynamoDB to return an item with `matchResult`; assert `match()` is not called
- [x] 8.3 Add a unit test for the backward-compat path: mock DynamoDB to return an item with `skeletons` but no `matchResult`; assert `match()` is called and the result is written back to DynamoDB
- [x] 8.4 Run the existing test harness and confirm no regressions

## 9. Playwright Smoke Test

- [x] 9.1 Open the app in the browser via Playwright MCP and type a word into the search field
- [x] 9.2 Confirm the constellation renders within the visible timeout and no console errors appear
- [x] 9.3 Submit the same word a second time and confirm the response is visibly faster (cache hit path)

## 10. Deploy and Verify

- [ ] 10.1 Deploy via `cdk deploy`
- [ ] 10.2 Run 3–5 test queries in the production app (mix of cache hits and misses)
- [ ] 10.3 Open the AWS X-Ray console and confirm traces appear with named sub-segments for embed, l3-candidates, svg-to-skeleton, matcher, DynamoDB, and S3
- [ ] 10.4 Check CloudWatch Logs for `request complete` entries with `durationMs` and `cacheHit` fields
