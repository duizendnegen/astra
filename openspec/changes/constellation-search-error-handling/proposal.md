## Why

The triangle fallback is a silent failure: when the retrieval pipeline finds nothing, it returns a generic 3-point constellation without telling the user anything went wrong. Combined with a missing client-side timeout, slow or failed searches leave the UI stuck or render a meaningless shape. The experience should fail clearly and elegantly instead.

## What Changes

- **Drop best-cosine fallback**: Remove the low-similarity cosine fallback path from the retrieval pipeline — if L3/L4 both miss, go straight to triangle fallback (which is then converted to an error response).
- **Backend returns 4xx on fallback**: When the pipeline falls back to the triangle, both `local.ts` and `skeleton.ts` return HTTP 422 with `{ error: 'No constellation found.' }` instead of a silent 200.
- **20-second client timeout**: The frontend fetch is wrapped in an `AbortController` that fires after 20 seconds; on abort the search is abandoned (not retried).
- **Error display in `catalogueStatus`**: On timeout or 4xx, show "No constellation found." in the `#catalogue-status` field at `opacity: 0.8` (vs the normal `0.5` for loading hints).
- **Fix catch/finally ordering bug**: Currently `setLoading(false)` in `finally` overwrites the error text set in `catch`. Fix by setting error state after `setLoading(false)`.

## Capabilities

### New Capabilities

- `constellation-search-error`: Error display contract — when the search fails (timeout or no match), show a short, styled message in `catalogueStatus` and leave the landing state intact.

### Modified Capabilities

- `retrieval-pipeline`: Drop the best-cosine fallback branch; pipeline now has two outcomes — success or triangle fallback (which maps to an error).
- `constellation-api`: API now returns 422 when no constellation is found, instead of always returning 200 with skeletons.

## Impact

- `lambda/src/retrieval.ts`: remove best-cosine fallback branch
- `lambda/src/skeleton.ts`: return 422 on `isFallback`
- `lambda/src/local.ts`: return 422 on `isFallback`
- `frontend/src/main.ts`: add `AbortController` timeout, fix catch/finally, add error CSS class
- `frontend/src/style.css`: add `.status-error` modifier (opacity 0.8)
