## 1. MatchResult diagnostic fields

- [x] 1.1 Add `selectedScore?`, `topScore?`, `nextBestScore?`, `acceptableCount?`, `distantCount?` to `MatchResult` in `lambda/src/types.ts`
- [x] 1.2 Populate the five new fields in the `match()` return statement in `lambda/src/matcher.ts` from the already-computed `pool`, `topScore`, `acceptable`, `distant`, and `selected` values
- [x] 1.3 Add unit test cases in `lambda/src/__tests__/matcher-pipeline.test.ts` verifying the new fields are present and correct (selectedScore === topScore when no diversity applied; distantCount === 0 when no distant candidates)

## 2. /api/skeleton endpoint

- [x] 2.1 Add `POST /api/skeleton` route to `lambda/src/local.ts`: parse body, call `retrieveSkeleton()`, return `PipelineResult` as JSON; return 400 on missing word, 422 on empty skeletons; reuse the existing `cache` map
- [x] 2.2 Add startup env-var check in `local.ts` that logs a warning if `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ICONS_BUCKET_NAME`, or `OPENROUTER_API_KEY` are absent

## 3. Test-harness word list and diagnostics

- [x] 3.1 Add banana (A), bunny (A), tree (A), love (E) to `test-harness/words.ts` in the appropriate category arrays
- [x] 3.2 Add `selectedScore?`, `topScore?`, `nextBestScore?`, `acceptableCount?`, `distantCount?` to the `WordDiagnostic` interface in `test-harness/run.ts` and populate them from `matchResult` in `processWord()`

## 4. post-preview-comment script

- [x] 4.1 Create `test-harness/post-preview-comment.ts`: accept `--run-id` and `--pr-number` args; read PNG files from `reports/<runId>/`; push each PNG to the `ci-previews` branch at `<head-sha>/<word>.png` using `git` shell commands
- [x] 4.2 Build the metadata table Markdown from `reports/<runId>/results.json` (word, phase1, phase2, phase3, score, Δ top, Δ 2nd, acceptable, distant); include ⚠ rows for missing/failed words
- [x] 4.3 Upsert the PR comment via `gh api`: search existing comments for `<!-- constellation-previews-bot -->` marker, PATCH if found or POST if not
- [x] 4.4 Exit 1 if all five preview words have ⚠ rows (total failure); exit 0 otherwise

## 5. CI workflow

- [x] 5.1 Add `constellation-previews` job to `.github/workflows/ci.yml` with `needs: test`, per-job `permissions` block (`contents: write`, `pull-requests: write`, `id-token: write`), and AWS OIDC credentials step (reuse vars/secrets already used by `cdk-diff`)
- [x] 5.2 Add steps to the job: install harness deps (`npm ci` in `test-harness/`), start `npm run dev:local` in background, wait for port 3001 (curl retry loop), run `npx tsx run.ts --words banana,anchor,love,bunny,tree`, run `npx tsx post-preview-comment.ts --pr-number ${{ github.event.pull_request.number }}`

## 6. Verification

- [ ] 6.1 Run the test harness locally with `--words banana,anchor,love,bunny,tree` against a running `npm run dev:local` to confirm all five words succeed and PNGs are written
- [ ] 6.2 Inspect `diagnostics.json` output to verify the five new score fields are populated for matched words

- [x] 6.3 Run the lambda test suite (`npm test` in `lambda/`) to confirm no regressions
