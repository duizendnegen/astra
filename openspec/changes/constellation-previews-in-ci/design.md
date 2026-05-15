## Context

The test harness exists and runs locally against pre-committed fixture files. It has no CI integration — the full retrieval pipeline (Pinecone → S3 → SVG → skeleton → matcher) is only exercised in production. The existing CI workflow covers unit tests and a CDK diff only. The local dev server (`local.ts`) already serves `/api/constellation` but lacks the `/api/skeleton` route that the harness's `loadOrFetchFixture()` already calls at `run.ts:209`.

## Goals / Non-Goals

**Goals:**
- Exercise the full retrieval pipeline on every PR through five fixed preview words
- Post a visual PR comment (3-panel PNG per word + metadata table) on every PR
- Expose five diversity-selection fields from `match()` to enable the metadata table
- Add the missing `/api/skeleton` endpoint so the harness can fetch live skeletons in CI

**Non-Goals:**
- No blocking quality gate — the preview comment is informational only
- No historical diff between runs — images show current branch only
- No fixture pre-seeding — CI always fetches live from the running local service
- No fix for the pre-existing `match()` 4-arg call in `run.ts` (overrides silently ignored)

## Decisions

### D1 — Image hosting: ci-previews branch

PNG images are pushed to an orphan `ci-previews` branch as `<commit-sha>/<word>.png` and referenced via GitHub's raw content URL (`https://raw.githubusercontent.com/…/ci-previews/<sha>/<word>.png`). This is the only option that produces publicly embeddable URLs in GitHub Markdown with no external infrastructure.

_Alternatives considered:_
- **GitHub Actions Artifacts** — require auth for download; URLs cannot be embedded directly in Markdown.
- **S3 + CloudFront** — no extra infra acceptable for a preview/diagnostic feature.
- **Base64 inline in comment** — GitHub strips `data:` URIs from comment Markdown; unusable.

Branch cleanup: a monthly cron resets the branch to a single commit (orphan) to prevent unbounded growth from binary blobs.

### D2 — Per-job permissions, not top-level

The `constellation-previews` job declares its own `permissions:` block with `contents: write`, `pull-requests: write`, and `id-token: write`. The top-level workflow block retains `id-token: write` and `contents: read` (needed by `test` and `cdk-diff`). GitHub Actions allows per-job permission blocks that override the top-level for that job.

_Alternative_: widen the top-level block — simpler YAML but unnecessarily grants write access to the `test` and `cdk-diff` jobs.

### D3 — Gate on `needs: test`, not parallel

The previews job runs after `test` passes. This avoids burning LLM + Pinecone API quota on branches with broken unit tests. The wall-clock penalty is ~1 minute (time for the test job to report).

### D4 — Non-fatal retrieval failures per word

`post-preview-comment.ts` catches per-word errors. A failing word gets a ⚠ row in the metadata table; the job exits 0 as long as at least one word succeeds. If all five fail, the job exits 1. This prevents a single flaky LLM call from blocking PR review.

### D5 — `MatchResult` new fields are optional

`selectedScore`, `topScore`, `nextBestScore`, `acceptableCount`, `distantCount` are added as optional (`?`) fields to `MatchResult`. The values are always populated by `match()` when a result is returned (the data is already computed at `matcher.ts:1229–1238`). They are optional in the type to maintain backwards compatibility with any code that constructs `MatchResult` objects directly (primarily tests).

### D6 — post-preview-comment.ts uses `gh` CLI

The script uses the `gh` CLI (already available on `ubuntu-latest` GitHub Actions runners) to upsert the PR comment. It searches for an existing comment with the marker `<!-- constellation-previews-bot -->` and patches it if found, otherwise creates a new one. No additional npm dependency needed.

## Risks / Trade-offs

- **ci-previews branch growth** → Mitigation: monthly cron orphan-reset; each PR pushes ~5 × 20–50 KB PNGs.
- **LLM non-determinism** → Images may differ on re-runs for L3/L4 words; acceptable since the feature is a diagnostic preview, not a pixel-diff gate.
- **Rate limiting on burst** → Five words with concurrency 2 in the harness; the local service processes them serially for retrieval. Unlikely to hit rate limits.
- **Local service startup race** → The workflow must poll port 3001 before starting the harness. A `wait-on` or `curl` retry loop is needed in the CI job YAML.
- **`contents: write` on `pull_request` trigger** → An attacker's PR cannot exfiltrate secrets (CI only reads public env vars/vars from GitHub Actions), but it can push to `ci-previews`. Images from untrusted PRs land on the branch. Mitigation: the branch is clearly named as a CI artefact; raw URLs from it are not trusted content.

## Migration Plan

Additive change — no migration required. Existing jobs are unmodified. The new job is deployed the first time a PR is opened after the workflow change merges.

The `ci-previews` branch must be created (as an orphan) before the first CI run; `post-preview-comment.ts` can create it if absent.
