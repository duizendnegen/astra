## Why

Every PR currently exercises only unit tests and a CDK diff — the full retrieval pipeline (Pinecone → S3 → SVG → skeleton → matcher) is only exercised in production. Adding a CI preview job gives every PR a visual + numerical baseline so matching regressions are caught before merge, not after.

## What Changes

- New `POST /api/skeleton` route in `lambda/src/local.ts` that returns the raw `PipelineResult` (skeletons + match provenance) without running the matcher — this endpoint is already called by the test harness but does not yet exist.
- `MatchResult` in `lambda/src/types.ts` gains five diversity-selection diagnostic fields: `selectedScore`, `topScore`, `nextBestScore`, `acceptableCount`, `distantCount`.
- `match()` in `lambda/src/matcher.ts` populates those five new fields from the values already computed internally in the diversity-selection block.
- `test-harness/words.ts` adds four new preview words: banana (A), bunny (A), tree (A), love (E).
- `test-harness/run.ts` threads the new `MatchResult` score fields through to the `WordDiagnostic` record.
- New `test-harness/post-preview-comment.ts` script: uploads PNGs to the `ci-previews` branch and upserts a PR comment with a metadata table and embedded images.
- New `constellation-previews` job in `.github/workflows/ci.yml` that runs after `test` passes, starts the local service, runs the harness for five preview words, and posts the comment.

## Capabilities

### New Capabilities

- `ci-preview-pipeline`: CI job that spins up the local service, runs the harness for five fixed preview words, and posts a visual + metadata PR comment. Includes the `post-preview-comment.ts` script and the `constellation-previews` workflow job.
- `skeleton-api-endpoint`: `POST /api/skeleton` route on the local dev server that returns the raw pipeline result (skeletons + match provenance) without matching; 422 on empty skeletons.

### Modified Capabilities

- `match-diagnostics`: `MatchResult` gains five new optional diversity-selection fields; `WordDiagnostic` in the harness is updated to carry them.
- `github-actions-cicd`: CI workflow gains the new `constellation-previews` job with least-privilege per-job permissions.

## Impact

- `lambda/src/types.ts` — `MatchResult` interface gains 5 optional fields
- `lambda/src/matcher.ts` — `match()` return statement populated with new fields
- `lambda/src/local.ts` — new POST route; no changes to existing constellation route
- `test-harness/words.ts` — 4 new word entries
- `test-harness/run.ts` — `WordDiagnostic` updated; no logic changes
- `test-harness/post-preview-comment.ts` — new file
- `.github/workflows/ci.yml` — new job; existing jobs unchanged
- Secrets / vars required in the new job: `OPENROUTER_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ICONS_BUCKET_NAME`, `AWS_READONLY_ROLE_ARN`, `AWS_REGION` (all already present in the repo for `cdk-diff`)
