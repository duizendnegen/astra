## 1. Infrastructure — CDK Changes

- [ ] 1.1 Add GitHub OIDC Identity Provider to CDK stack (`infra/lib/infra-stack.ts`)
- [ ] 1.2 Add GitHub Actions deploy IAM role with trust policy scoped to `refs/heads/main` of this repo
- [ ] 1.3 Add GitHub Actions read-only IAM role with trust policy scoped to any ref in this repo (for `cdk diff` on PRs)
- [ ] 1.4 Add icons S3 bucket (`astra-icons-{account}`) with all public access blocked
- [ ] 1.5 Reference `/astra/pinecone-api-key` SSM SecureString parameter; set `PINECONE_API_KEY_PARAM` and `ICONS_BUCKET_NAME` env vars on the Lambda
- [ ] 1.6 Grant Lambda `s3:GetObject` on the icons bucket and `ssm:GetParameter` for the Pinecone key parameter
- [ ] 1.7 Provision Pinecone API key in SSM manually: `aws ssm put-parameter --name /astra/pinecone-api-key --type SecureString --value <key>`
- [ ] 1.8 Run `cdk deploy` to provision all new resources; confirm stack output includes icons bucket name and role ARNs

## 2. Index Build Script

- [ ] 2.1 Add `@pinecone-database/client` and `@aws-sdk/client-s3` to the `scripts/` package dependencies
- [ ] 2.2 Rewrite `scripts/build-index.ts`: replace SQLite inserts with Pinecone `upsert()` (embedding + metadata: `source`, `label`, `tags`)
- [ ] 2.3 Add S3 `PutObject` step: upload each entry's SVG path string to key `{source}/{name}` (derived by replacing `:` in id with `/`)
- [ ] 2.4 Implement incremental-run guard: check if a vector id already exists in Pinecone before embedding and uploading
- [ ] 2.5 Run `scripts/build-index.ts` to populate Pinecone index and icons S3 bucket; verify vector count and sample S3 keys

## 3. Lambda — Replace SQLite with Pinecone + S3

- [ ] 3.1 Remove `better-sqlite3` and `sqlite-vec` from `lambda/package.json`; add `@pinecone-database/client` and `@aws-sdk/client-s3`
- [ ] 3.2 Initialise Pinecone client, Pinecone index reference, and S3 client at module level in `lambda/src/retrieval.ts`
- [ ] 3.3 Read Pinecone API key from SSM at cold start using `GetParameterCommand` (same pattern as the existing OpenRouter key)
- [ ] 3.4 Rewrite L1 query: call Pinecone `index.query()` with the 1536-dim embedding, top-K results, filtered to `L1_SOURCES`
- [ ] 3.5 After a Pinecone match above threshold: fetch SVG path via S3 `GetObjectCommand` at key `{source}/{name}`
- [ ] 3.6 Add unit tests for the new L1 path (Pinecone query + S3 fetch); run `npm test` in `lambda/`
- [ ] 3.7 Restart Docker Compose (`docker compose up`) and run the test harness to verify L1 works end-to-end locally
- [ ] 3.8 Run Playwright visual test via the Playwright MCP server to confirm constellation rendering is unaffected

## 4. GitHub Actions Workflows

- [ ] 4.1 Create `.github/workflows/ci.yml`: triggers on PR to `main`; installs deps, runs `npm test` in `lambda/` and `frontend/`, runs `cdk diff` using the read-only OIDC role
- [ ] 4.2 Create `.github/workflows/deploy.yml`: triggers on push to `main`; runs tests, builds frontend (`npm run build`), runs `cdk deploy --require-approval never` using the deploy OIDC role
- [ ] 4.3 Set required workflow env vars: AWS region, deploy role ARN, read-only role ARN (from CDK stack outputs)

## 5. Verification and Cleanup

- [ ] 5.1 Smoke-test L1 in production: submit a word known to match a Phosphor icon (e.g. "star"); confirm response includes `"layer": 1` and a valid `svgPath`
- [ ] 5.2 Run Playwright visual test against the production URL to confirm end-to-end constellation rendering
- [ ] 5.3 Remove `data/icon-index.sqlite` from the repository
