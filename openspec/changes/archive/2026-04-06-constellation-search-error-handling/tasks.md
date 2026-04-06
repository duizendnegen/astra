## 1. Backend — retrieval pipeline

- [x] 1.1 In `lambda/src/retrieval.ts`, remove the `bestSeen` variable and its tracking logic throughout the function
- [x] 1.2 Remove the best-cosine fallback branch (the `if (bestSeen)` block before the triangle fallback return)
- [x] 1.3 Change the triangle fallback return in `retrieval.ts` to `{ match: null, skeletons: [] }` and remove the `TRIANGLE_FALLBACK` import from `retrieval.ts`
- [x] 1.4 Remove `TRIANGLE_FALLBACK` from `lambda/src/core.ts` and delete the `__tests__/core.test.ts` assertion that references it

## 2. Backend — API error response

- [x] 2.1 In `lambda/src/local.ts`, after calling `retrieveSkeleton`, check `result.match === null` and return `res.writeHead(422)` + `{ error: 'No constellation found.' }` instead of proceeding to match; remove the `TRIANGLE_FALLBACK` import
- [x] 2.2 In `lambda/src/skeleton.ts`, change the fallback branch to check `result.match === null` and return `{ statusCode: 422, headers, body: JSON.stringify({ error: 'No constellation found.' }) }` instead of 200 with triangle skeletons; remove the `TRIANGLE_FALLBACK` import
- [x] 2.3 Restart Docker Compose and confirm a word that previously triggered the triangle fallback now returns 422

## 3. Frontend — CSS error state

- [x] 3.1 In `frontend/src/style.css`, add a `.status-error` modifier class to `.status-hint` that sets `opacity: 0.8`

## 4. Frontend — fetch timeout and error display

- [x] 4.1 In `frontend/src/main.ts`, refactor `findConstellation` to use `AbortController` with a 20-second `setTimeout`; pass `signal` to the `fetch` call and clear the timer on both success and failure
- [x] 4.2 Fix the catch/finally ordering bug: capture `errorMessage` in the `catch` block, call `setLoading(false)` in `finally`, then set `catalogueStatus.textContent = errorMessage` and add `.status-error` class after the try/finally block
- [x] 4.3 In `setLoading(false)`, remove the `.status-error` class from `catalogueStatus` (so the next search starts clean)
- [x] 4.4 Handle the `AbortError` case in `catch`: set `errorMessage = 'No constellation found.'` when `err instanceof Error && err.name === 'AbortError'`
- [x] 4.5 For non-abort fetch errors or 4xx responses, set `errorMessage = 'No constellation found.'` (single message for all failure modes)

## 5. Visual testing

- [ ] 5.1 Use the Playwright MCP server to navigate to the landing page and submit a word that triggers the fallback; verify `#catalogue-status` shows "No constellation found." with opacity 0.8
- [ ] 5.2 Verify the error clears and loading messages resume on the next search attempt

## 6. Test harness

- [x] 6.1 Run the test harness (`npm run test-harness` or equivalent) and confirm no regressions in constellation quality for words that previously succeeded
