# Constellation Previews in CI

A `constellation-previews` job runs on every pull request alongside the existing
`test` and `cdk-diff` jobs. It spins up the live skeleton service, runs the test
harness against five fixed words, and posts a PR comment containing a metadata
table and one embedded constellation image per word.

## Goals

* Keep the full retrieval pipeline (Pinecone → S3 → SVG → skeleton) exercised on
  every PR, not just in production.
* Provide a visual and numerical baseline for comparing matching quality across
  branches — the foundation for regression analysis.

## How it works

```
CI job
  └─ npm run dev:local  (lambda/src/local.ts, port 3001)
        ├─ POST /api/skeleton   → runs retrieval pipeline, returns raw skeletons
        └─ POST /api/constellation → retrieval + matching (existing route)
  └─ npx tsx run.ts --words banana,anchor,love,bunny,tree
        ├─ fetches skeletons from live service (no pre-committed fixtures)
        ├─ runs matcher locally with configurable overrides
        └─ renders 3-panel PNG per word (SVG | skeleton | constellation)
  └─ npx tsx post-preview-comment.ts
        ├─ uploads PNGs to ci-previews branch
        └─ upserts PR comment with metadata table + embedded images
```

## Preview words

| Word   | Category | Notes                          |
|--------|----------|--------------------------------|
| banana | A        | direct Phosphor icon           |
| anchor | A        | direct Phosphor icon           |
| love   | E        | edge case — heart / multiple   |
| bunny  | A        | rabbit icon                    |
| tree   | A        | direct Phosphor icon           |

## Metadata exposed per word

The PR comment table shows, per word:

| Field            | Source                       | Meaning |
|------------------|------------------------------|---------|
| `phase1`         | `MatchResult.phase1Candidates` | placements that survived the coverage prescreen |
| `phase2`         | `MatchResult.phase2Candidates` | placements after greedy edge-ratio filter |
| `phase3`         | `MatchResult.phase3Candidates` | placements scored by full Hungarian assignment |
| `score`          | `MatchResult.selectedScore`    | composite score of the chosen result |
| `Δ top`          | `topScore − selectedScore`     | quality sacrificed by diversity selection (0 if not diversified) |
| `Δ 2nd`          | `selectedScore − nextBestScore` | margin over the runner-up; lower = less confident |
| `acceptable`     | `MatchResult.acceptableCount`  | candidates within 10 % of top score |
| `distant`        | `MatchResult.distantCount`     | acceptable candidates ≥ 30° from top placement |

A high `distant` count means the sky has genuinely spread-out good placements.
A low `distant` count alongside a high `acceptable` count is the Sirius-clustering
signal — many good-looking placements clumped in one bright-star region.

## Diversity selection

After Phase 3 the full pool of scored candidates is sorted descending.
`selectDiverse()` picks as follows:

1. **Acceptable band** — candidates with `score ≥ pool[0].score × 0.90`
2. **Distant filter** — from those, sky centre ≥ 30° from the champion
3. **Selected** — random from distant-acceptable; falls back to champion

`Δ top = 0` means the champion was selected (no diversity applied).
`Δ top > 0` means a slightly lower-scoring but sky-distant placement was preferred.

## Required secrets / vars

| Name                  | Kind   | Used for                          |
|-----------------------|--------|-----------------------------------|
| `OPENROUTER_API_KEY`  | secret | embedding (L1) and LLM calls (L3/L4) |
| `PINECONE_API_KEY`    | secret | Pinecone vector index             |
| `PINECONE_INDEX_NAME` | var    | index name                        |
| `ICONS_BUCKET_NAME`   | var    | S3 bucket for SVG assets          |
| `AWS_READONLY_ROLE_ARN` | var  | OIDC role for S3 access           |
| `AWS_REGION`          | var    | AWS region                        |

## Files changed

| File | Change |
|------|--------|
| `lambda/src/types.ts` | `MatchResult` gains `selectedScore?`, `topScore?`, `nextBestScore?`, `acceptableCount?`, `distantCount?` |
| `lambda/src/matcher.ts` | `match()` populates those fields from the live pool/acceptable/distant arrays |
| `lambda/src/local.ts` | Added `POST /api/skeleton` route; startup env-var check; 422 on empty skeletons |
| `lambda/src/retrieval.ts` | `embed()` warns immediately when called without API key; `searchPinecone()` warns when index is null |
| `test-harness/words.ts` | Added banana (A), bunny (A), tree (A), love (E) |
| `test-harness/render-patch.ts` | Unchanged — clean 3-panel image, no metadata text on image |
| `test-harness/run.ts` | Passes new score fields through to diagnostics |
| `test-harness/post-preview-comment.ts` | New — uploads PNGs to `ci-previews` branch, upserts PR comment |
| `.github/workflows/ci.yml` | New `constellation-previews` job |
