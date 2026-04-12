## 1. Infrastructure — CDK Changes

- [ ] 1.1 Add GitHub OIDC Identity Provider to CDK stack (`infra/lib/infra-stack.ts`)
- [ ] 1.2 Add GitHub Actions deploy IAM role with trust policy scoped to `refs/heads/main` of this repo; permissions must include `s3:PutObject` on the icons bucket and `ssm:GetParameter` for the Pinecone key parameter (needed for the build-index step in the deploy workflow)
- [ ] 1.3 Add GitHub Actions read-only IAM role with trust policy scoped to any ref in this repo (for `cdk diff` on PRs)
- [ ] 1.4 Add icons S3 bucket (`astra-icons-{account}`) with all public access blocked
- [ ] 1.5 Reference `/astra/pinecone-api-key` SSM SecureString parameter; set `PINECONE_API_KEY_PARAM` and `ICONS_BUCKET_NAME` env vars on the Lambda
- [ ] 1.6 Grant Lambda `s3:GetObject` on the icons bucket and `ssm:GetParameter` for the Pinecone key parameter
- [ ] 1.7 Provision Pinecone API key in SSM manually: `aws ssm put-parameter --name /astra/pinecone-api-key --type SecureString --value <key>`
- [ ] 1.8 Run `cdk deploy` to provision all new resources; confirm stack output includes icons bucket name and role ARNs

## 2. Local Development Environment

- [ ] 2.1 Add `pinecone-local` service to `docker-compose.yml` (`ghcr.io/pinecone-io/pinecone-local:latest`, port `5081`)
- [ ] 2.2 Add `minio` service to `docker-compose.yml` (`minio/minio:latest`, ports `9000`/`9001`); configure `api` service to depend on both new services
- [ ] 2.3 Add a MinIO init step (e.g. `mc mb` via a one-shot container or entrypoint) to create the `astra-icons-local` bucket on first start
- [ ] 2.4 Create `.env.local.example` at the repo root documenting all environment variables required for local development, with local service values pre-filled and placeholders for secrets that must be supplied (e.g. `OPENROUTER_API_KEY`)

## 3. Index Build Script

- [ ] 3.1 Add `@pinecone-database/client` and `@aws-sdk/client-s3` to the `scripts/` package dependencies
- [ ] 3.2 Rewrite `scripts/build-index.ts`: replace SQLite inserts with Pinecone `upsert()` (embedding + metadata: `source`, `label`, `tags`)
- [ ] 3.3 Add S3 `PutObject` step: upload each entry's SVG path string to key `{source}/{name}` (derived by replacing `:` in id with `/`)
- [ ] 3.4 Implement incremental-run guard: check if a vector id already exists in Pinecone before embedding and uploading
- [ ] 3.5 Support local mode: when `PINECONE_HOST` is set, pass it as the custom host to the Pinecone client; when `AWS_ENDPOINT_URL` is set, pass it as the S3 client endpoint (enabling MinIO); `PINECONE_API_KEY` is always read directly from the environment (no SSM in the build script)
- [ ] 3.6 Run `scripts/build-index.ts` locally (with `.env.local`) to populate local Pinecone and MinIO; verify vector count and sample S3 keys

## 4. Lambda — Replace SQLite with Pinecone + S3

- [ ] 4.1 Remove `better-sqlite3` and `sqlite-vec` from `lambda/package.json`; add `@pinecone-database/client` and `@aws-sdk/client-s3`
- [ ] 4.2 Initialise Pinecone client, Pinecone index reference, and S3 client at module level in `lambda/src/retrieval.ts`; pass `PINECONE_HOST` as custom host if set
- [ ] 4.3 Read Pinecone API key: if `PINECONE_API_KEY` env var is set, use it directly; otherwise read from SSM using `PINECONE_API_KEY_PARAM` (preserves local dev workflow without AWS credentials)
- [ ] 4.4 Rewrite L1 query: call Pinecone `index.query()` with the 1536-dim embedding, top-K results, filtered to `L1_SOURCES`
- [ ] 4.5 After a Pinecone match above threshold: fetch SVG path via S3 `GetObjectCommand` at key `{source}/{name}`; S3 client uses `AWS_ENDPOINT_URL` if set (MinIO locally)
- [ ] 4.6 Add unit tests for the new L1 path (Pinecone query + S3 fetch); run `npm test` in `lambda/`
- [ ] 4.7 Restart Docker Compose (`docker compose up` with `.env.local`) and run the test harness to verify L1 works end-to-end against local Pinecone + MinIO
- [ ] 4.8 Run Playwright visual test via the Playwright MCP server to confirm constellation rendering is unaffected

## 5. GitHub Actions Workflows

- [ ] 5.1 Create `.github/workflows/ci.yml`: triggers on PR to `main`; installs deps, runs `npm test` in `lambda/` and `frontend/`, runs `cdk diff` using the read-only OIDC role
- [ ] 5.2 Create `.github/workflows/deploy.yml`: triggers on push to `main`; runs tests, then runs `scripts/build-index.ts` (incremental — skips existing entries), then builds frontend (`npm run build`), then runs `cdk deploy --require-approval never` using the deploy OIDC role
- [ ] 5.3 Set required workflow env vars: AWS region, deploy role ARN, read-only role ARN (from CDK stack outputs); add `PINECONE_API_KEY` as a GitHub Secret for use by the build-index step
- [ ] 5.4 Set required workflow env vars for build-index: `PINECONE_INDEX_NAME`, `ICONS_BUCKET_NAME` (from CDK stack outputs or hardcoded)

## 6. Verification and Cleanup

- [ ] 6.1 Smoke-test L1 in production: submit a word known to match a Phosphor icon (e.g. "star"); confirm response includes `"layer": 1` and a valid `svgPath`
- [ ] 6.2 Run Playwright visual test against the production URL to confirm end-to-end constellation rendering
- [ ] 6.3 Remove `data/icon-index.sqlite` from the repository
