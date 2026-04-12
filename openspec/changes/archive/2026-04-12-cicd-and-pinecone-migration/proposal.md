## Why

The L1 vector search layer is silently broken in production: `better-sqlite3` and `sqlite-vec` are native modules that cannot be bundled by CDK's esbuild, and `INDEX_PATH` is never set in the Lambda environment — so every cache miss falls through to expensive LLM calls (L3/L4) that the index could have served. At the same time, there is no CI/CD pipeline; all deployments are manual.

## What Changes

- **New**: GitHub Actions workflows — test + `cdk diff` on PRs, test + `cdk deploy` on merge to `main` using GitHub OIDC (no stored AWS credentials)
- **New**: CDK provisions a GitHub OIDC identity provider and scoped deploy role (main-branch only) + a read-only role for PR `cdk diff`
- **New**: Dedicated private S3 bucket (`astra-icons-{account}`) stores SVG path strings, keyed as `{source}/{name}` (e.g. `phosphor/smiley`)
- **Replaced**: SQLite + sqlite-vec + better-sqlite3 removed from Lambda; L1 now queries **Pinecone Serverless** for nearest-neighbour vector search, then fetches the matched SVG from S3
- **Changed**: `scripts/build-index.ts` writes vectors to Pinecone and SVG files to S3 instead of a local SQLite database
- **Changed**: CDK stack adds Pinecone API key SSM parameter (`/astra/pinecone-api-key`), icons S3 bucket, and Lambda IAM permissions for both
- **Removed**: `data/icon-index.sqlite` and native module dependencies (`better-sqlite3`, `sqlite-vec`) from the Lambda package

## Capabilities

### New Capabilities

- `github-actions-cicd`: GitHub Actions workflows and AWS OIDC trust infrastructure for automated testing and deployment

### Modified Capabilities

- `retrieval-pipeline`: L1 query backend changes from SQLite `vec0` KNN to Pinecone Serverless API query + S3 `GetObject` for SVG retrieval
- `svg-icon-index`: Storage backend changes from SQLite to Pinecone (vectors + metadata) and S3 (SVG paths); build script targets these instead of a local file
- `aws-infrastructure`: New CDK resources — GitHub OIDC provider, deploy role, read-only PR role, icons S3 bucket, Pinecone SSM parameter, Lambda S3 read permission

## Impact

- **`lambda/`**: Remove `better-sqlite3`, `sqlite-vec` deps; add `@pinecone-database/client` and `@aws-sdk/client-s3`; update `retrieval.ts` L1 implementation; add Pinecone + S3 client init at module level
- **`scripts/`**: Rewrite `build-index.ts` output targets (Pinecone upsert + S3 PutObject) in place of SQLite writes
- **`infra/`**: Add OIDC provider, two IAM roles, icons S3 bucket, SSM parameter reference, Lambda IAM grants
- **`.github/workflows/`**: New directory; two workflow files (`ci.yml` for PRs, `deploy.yml` for main)
- **`data/icon-index.sqlite`**: No longer used; can be removed from the repo
