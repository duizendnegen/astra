# Exploration: constellation-previews-in-ci

**Date:** 2026-05-15
**Linked change:** none

## Context

Add a `constellation-previews` CI job that spins up the local service, runs the test harness against five fixed words, and posts a PR comment with a metadata table and one embedded 3-panel image per word. The goal is to keep the full retrieval pipeline exercised on every PR and establish a visual baseline for regression analysis.

## Observations

### What already exists

**Harness `/api/skeleton` call is already wired up** — `run.ts:209` already calls `http://localhost:3001/api/skeleton` in `loadOrFetchFixture()`. The endpoint does not yet exist in `local.ts` (only `/api/constellation` is there). This is the most urgent gap: the harness silently crashes on new words without fixtures.

**`MatchResult` diagnostic fields already partially present** — `types.ts` already has `phase1Candidates`, `phase2Candidates`, `phase3Candidates` on `MatchResult`. The five new diversity-selection fields (`selectedScore`, `topScore`, `nextBestScore`, `acceptableCount`, `distantCount`) are computed inside `match()` at `matcher.ts:1229–1238` but are never returned. The data is there; it just needs to surface.

**`match()` already runs `selectDiverse()` and tracks the full pool** — Lines 1229-1238 compute `topScore`, `acceptable`, `distant`, `selected`, and `diversified`. These map directly to the proposed fields:
```
topScore          → pool[0].score           ✓ computed
selectedScore     → selected.score          ✓ computed
nextBestScore     → pool[1]?.score          needs adding
acceptableCount   → acceptable.length       ✓ computed
distantCount      → distant.length          ✓ computed
```

**Preview words not yet in `words.ts`** — The five words are banana, anchor, love, bunny, tree. Of these, `anchor` is already in Category A (`words.ts:25`). The other four (banana, bunny, tree, love) are not. The harness enforces that all words passed to `--words` are in the words list (`run.ts:249-252`), so they must be added before the CI command works.

**`post-preview-comment.ts` does not exist** — Only `words.ts`, `render-patch.ts`, `run.ts` exist in the test-harness root.

**CI workflow has `contents: read`** — `.github/workflows/ci.yml:9`. Writing to a `ci-previews` branch requires `contents: write`. This permission must be scoped carefully — either to the new job only or granted globally.

### Pipeline flow in CI

```
[CI job: constellation-previews]
  │
  ├─ checkout
  ├─ npm ci (lambda + test-harness)
  ├─ start:  cd lambda && npm run dev:local &
  ├─ wait-for: port 3001 up (curl retry loop)
  │
  ├─ run.ts --words banana,anchor,love,bunny,tree
  │    ├─ loadOrFetchFixture("banana") → POST /api/skeleton → {skeletons, match}
  │    ├─ match(catalogue, skeletons) → MatchResult (with new score fields)
  │    └─ renderComposite(svg, skeleton, constellation) → word.png
  │
  └─ post-preview-comment.ts
       ├─ git push PNGs to ci-previews branch  ← design question
       └─ gh api upsert PR comment
```

### What `POST /api/skeleton` needs to return

The endpoint is a thin wrapper around `retrieveSkeleton()`:
- Input: `{word: string, promptVariant?: string, model?: string}`  
- Output: `PipelineResult` = `{match: MatchProvenance|null, skeletons: Skeleton[]}`  
- 422 if `skeletons.length === 0` (no skeleton derived from the match)  
- 400 if word is missing/blank  

The run.ts fixture loader saves the raw JSON to `fixtures/<word>.json` and re-reads it on the next run — so CI doesn't refetch for repeated runs, but there are no pre-committed fixtures.

### Image hosting options

Three viable strategies for serving images that can be embedded in GitHub Markdown:

| Option | Pros | Cons |
|--------|------|------|
| **`ci-previews` git branch** | Public raw URL, no extra infra, used by many tools | Binary blobs in git history; needs `contents: write`; stale images accumulate |
| **GitHub Actions artifacts** | Built-in, no git pollution | URLs require auth; can't embed directly in markdown |
| **Base64 inline in comment** | Zero hosting overhead | Comments become enormous (5 × 300×900px PNGs ≈ 1–2 MB encoded); GitHub strips data URIs |

The `ci-previews` branch is the standard pattern for GitHub-hosted CI image diffing (used by Percy, Chromatic-lite alternatives, etc.). The cleanup issue is manageable with a shallow orphan branch or a cron job that resets it.

### Permissions / secrets audit

| Need | Current state | Gap |
|------|--------------|-----|
| AWS OIDC (S3 read) | `cdk-diff` job already does this | New job must replicate the `aws-actions/configure-aws-credentials@v4` step |
| `OPENROUTER_API_KEY` | Secret, already used in `cdk-diff` env | Must be passed to the new job |
| `PINECONE_API_KEY` | Secret | Must be passed |
| `PINECONE_INDEX_NAME` | Repo var | Must be passed |
| `ICONS_BUCKET_NAME` | Repo var | Must be passed |
| `contents: write` (branch push) | Not granted | Needed for ci-previews branch approach; must be scoped |
| `pull-requests: write` (comment) | Not granted | Needed to post/upsert the PR comment |

### Fault-tolerance gap

`loadOrFetchFixture` calls `process.exit(1)` if the API returns a non-200 (`run.ts:228`). A single flaky LLM call (L3/L4 words) kills the entire CI job. For CI robustness, `post-preview-comment.ts` or the job itself should tolerate partial results — if 4/5 words succeed, post what we have with a note rather than failing silently.

---

## Rounds

## Round 1 — Image hosting & permissions model

### Q1.1 — How should CI-generated PNGs be hosted/served?

GitHub Markdown requires public HTTP URLs for embedded images; artifacts need auth.

- [x] Push to `ci-previews` branch ← recommended: standard pattern, public raw URLs, no extra infra; cleanup manageable with a cron that resets the branch monthly
- [ ] Upload to S3 and serve via CloudFront
- [ ] Store as GitHub Artifacts and render comment text without images (fall back to table only)

> **Your answer / freetext:**
>

### Q1.2 — Where should `contents: write` permission live?

Pushing to the ci-previews branch from a PR job is a sensitive permission for a `pull_request` trigger.

- [ ] Grant `contents: write` + `pull-requests: write` to the top-level workflow ← simple but broad
- [x] Add a separate `permissions` block to the `constellation-previews` job only ← recommended: least-privilege; each job can have its own block in GHA
- [ ] Use a separate `workflow_run` event (run only after `ci` passes; can write to repo)

> **Your answer / freetext:**
>

### Q1.3 — Should the previews job run in parallel with `test`, or only after `test` passes?

Running in parallel saves wall-clock time; running after `test` avoids spending API quota when code is broken.

- [ ] Parallel (no `needs: test`) — fastest feedback
- [x] After `test` passes (`needs: test`) ← recommended: avoids burning LLM/Pinecone quota on broken branches; only ~1 min slower
- [ ] After both `test` and `cdk-diff`

> **Your answer / freetext:**
>

---

## Round 2 — Word list & fault tolerance

### Q2.1 — How should banana, bunny, tree, love be added to words.ts?

They must be in the word list for `--words` filtering to work. They could also become permanent additions to the full 42-word suite.

- [x] Add all four to `words.ts` (banana, bunny, tree → Category A; love → Category E) ← recommended: they're valid test words and enrich the suite; no downside
- [ ] Keep them out of words.ts and bypass the word-validation check in run.ts

> **Your answer / freetext:**
>

### Q2.2 — How should the CI job handle a partial failure (one word fails retrieval)?

Currently `process.exit(1)` on a non-200 from `/api/skeleton` aborts everything.

- [x] Continue on failure: skip the word, note it in the comment table as "⚠ retrieval failed", post results for the rest ← recommended: a single flaky LLM call shouldn't block PR review
- [ ] Fail fast: exit 1 as today; mark the CI job as failed but not blocking merge
- [ ] Retry each word up to 3 times before skipping

> **Your answer / freetext:**
>

---

## Insights & Decisions

_Decision:_ Push CI preview PNGs to a `ci-previews` orphan/shallow branch and reference via raw GitHub URLs — _Reason:_ Only viable option for images embeddable directly in GitHub Markdown without external infra; standard pattern used by visual regression tooling.

_Decision:_ Scope `contents: write` and `pull-requests: write` to the `constellation-previews` job via its own `permissions:` block, not the top-level workflow — _Reason:_ Least-privilege; the `test` and `cdk-diff` jobs need only `contents: read` and `id-token: write`; widening the top-level scope for all jobs is unnecessary.

_Decision:_ Gate the previews job on `needs: test` — _Reason:_ Avoids spending LLM and Pinecone quota on branches with broken unit tests; the ~1 min wall-clock penalty is acceptable.

_Decision:_ Add banana, bunny, tree (Category A) and love (Category E) to `words.ts` as permanent suite members — _Reason:_ They are valid test words that enrich coverage; the `--words` filter in run.ts requires all words to exist in the list, so they must be registered.

_Decision:_ Make retrieval failures non-fatal in `post-preview-comment.ts`: skip the failing word, emit a ⚠ row in the metadata table, and post results for the rest — _Reason:_ A single flaky LLM call (especially L4) should not block PR review; the comment is informational, not a quality gate.
