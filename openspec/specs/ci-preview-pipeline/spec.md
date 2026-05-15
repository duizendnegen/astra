## Requirements

### Requirement: constellation-previews CI job
The CI workflow SHALL include a `constellation-previews` job that runs after the `test` job passes (`needs: test`). The job SHALL use `ubuntu-latest`, configure AWS credentials using the read-only OIDC role, start the local dev server (`npm run dev:local` in `lambda/`), wait for port 3001 to be reachable, run the test harness for the five preview words (banana, anchor, love, bunny, tree), and then run `post-preview-comment.ts`. The job's `permissions:` block SHALL declare `contents: write`, `pull-requests: write`, and `id-token: write`.

#### Scenario: Preview job runs after tests pass
- **WHEN** the `test` job succeeds on a pull request
- **THEN** the `constellation-previews` job is triggered and starts the local service

#### Scenario: Preview job does not run when tests fail
- **WHEN** the `test` job fails
- **THEN** the `constellation-previews` job is skipped (GitHub Actions `needs` dependency)

#### Scenario: Required secrets and vars are available
- **WHEN** the constellation-previews job runs
- **THEN** `OPENROUTER_API_KEY`, `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `ICONS_BUCKET_NAME`, `AWS_READONLY_ROLE_ARN`, and `AWS_REGION` are all available in the job environment

### Requirement: post-preview-comment script
The `test-harness/post-preview-comment.ts` script SHALL read PNG files from the harness output directory, commit them to the `ci-previews` orphan branch under the path `<head-commit-sha>/<word>.png`, and upsert a single PR comment containing a metadata table and one embedded image per word. The script SHALL use the `gh` CLI to find and update an existing comment marked with `<!-- constellation-previews-bot -->`, or create a new one if none exists.

#### Scenario: Comment is created on first run
- **WHEN** no comment marked `<!-- constellation-previews-bot -->` exists on the PR
- **THEN** a new comment is posted with the metadata table and embedded images

#### Scenario: Comment is updated on re-run
- **WHEN** a `<!-- constellation-previews-bot -->` comment already exists on the PR
- **THEN** the existing comment body is replaced (upserted) rather than a new comment being created

#### Scenario: Images are addressable via raw GitHub URL
- **WHEN** the script pushes PNGs to the `ci-previews` branch at path `<sha>/<word>.png`
- **THEN** the embedded image URLs in the comment use `https://raw.githubusercontent.com/<owner>/<repo>/ci-previews/<sha>/<word>.png`

### Requirement: Metadata table in PR comment
The PR comment SHALL include a Markdown table with one row per preview word showing: word, phase1, phase2, phase3, score, Δ top, Δ 2nd, acceptable, distant. Words that failed retrieval SHALL appear as a ⚠ row with "retrieval failed" in the score column and empty numeric cells.

#### Scenario: Successful word row
- **WHEN** a word matches successfully
- **THEN** the table row contains all eight numeric/score fields populated from `MatchResult`

#### Scenario: Failed word row
- **WHEN** the local service returns a non-200 for a word during CI
- **THEN** the word appears in the table with a ⚠ marker and empty metric cells; the job does not exit with an error for that word alone

#### Scenario: All-failure exits non-zero
- **WHEN** all five words fail retrieval
- **THEN** `post-preview-comment.ts` exits with a non-zero code so the CI job is marked failed

### Requirement: Preview words registered in test-harness word list
The four preview words SHALL be present in `test-harness/words.ts`: banana (Category A), bunny (Category A), tree (Category A), love (Category E). These words SHALL be valid entries so the `--words` filter in `run.ts` accepts them.

#### Scenario: --words filter accepts preview words
- **WHEN** the harness is invoked with `--words banana,anchor,love,bunny,tree`
- **THEN** the harness processes exactly those five words without an "unknown words" error
