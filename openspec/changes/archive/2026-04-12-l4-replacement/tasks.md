## 1. Dependencies

- [x] 1.1 Add `potrace` to `lambda/package.json` (or equivalent) and install
- [x] 1.2 Add type declarations for `potrace` if no `@types/potrace` exists

## 2. Database

- [x] 2.1 Add `ensureCustomLiveTable()` helper to `retrieval.ts` that creates `custom_live` table if not exists, called once at module load alongside `getSharedIndex`

## 3. L4 Replacement

- [x] 3.1 Remove `l4GenerateSvg` and `L4_PROMPT` from `retrieval.ts`
- [x] 3.2 Add `L4_IMAGE_MODEL` env var constant (default: `google/gemini-2.5-flash-image`)
- [x] 3.3 Implement `l4GenerateFromImage(word, apiKey, signal)`: call Gemini image gen via OpenRouter, extract base64 PNG from `message.images[0]`, return Buffer or null
- [x] 3.4 Implement `traceWithPotrace(pngBuffer)`: promisify Potrace, return SVG string or null
- [x] 3.5 Compose new `l4Task` in `retrieveSkeleton`: call `l4GenerateFromImage` then `traceWithPotrace`, pass SVG to `svgToSkeletonWithOpts`, set `match.source = 'generated'`

## 4. Async Promotion

- [x] 4.1 After L4 produces a valid result, fire-and-forget a `promoteToCustomLive(word, svg, db)` call that upserts into `custom_live`
- [x] 4.2 Catch and log any errors from the async promotion without affecting the response

## 5. Type Updates

- [x] 5.1 Add `'generated'` to the `source` union in `MatchProvenance` type; remove `'llm'`

## 6. Tests

- [x] 6.1 Unit test `l4GenerateFromImage`: mock OpenRouter response with base64 image, assert Buffer returned
- [x] 6.2 Unit test `traceWithPotrace`: mock Potrace, assert SVG string returned on success and null on failure
- [x] 6.3 Unit test async promotion: assert `custom_live` row inserted after L4 hit; assert response not delayed on promotion failure

## 7. Spec Archive

- [x] 7.1 Run `openspec archive --change l4-replacement` to merge spec deltas into canonical specs

## 8. Visual Verification

- [x] 8.1 Run the local server with a word that forces an L4 path and use Playwright to screenshot the result; confirm a constellation renders
- [x] 8.2 Verify `custom_live` table has the promoted entry after the L4 hit
