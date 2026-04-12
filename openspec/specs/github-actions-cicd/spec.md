## Requirements

### Requirement: PR CI workflow
The repository SHALL include a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on all pull requests targeting `main`. The workflow SHALL install dependencies and run `npm test` in the `lambda/` and `frontend/` packages, then run `cdk diff` in `infra/` using the read-only AWS OIDC role.

#### Scenario: Tests pass on PR
- **WHEN** a pull request is opened or updated
- **THEN** the CI workflow runs and reports test results for both lambda and frontend packages

#### Scenario: CDK diff runs on PR
- **WHEN** a pull request is opened or updated
- **THEN** `cdk diff` runs against the live AWS environment and its output is visible in the workflow logs

#### Scenario: CI fails on test failure
- **WHEN** any test in the lambda or frontend package fails
- **THEN** the CI workflow fails and the pull request is blocked

### Requirement: Deploy workflow on main
The repository SHALL include a GitHub Actions workflow at `.github/workflows/deploy.yml` that triggers on push to `main`. The workflow SHALL, in order: run tests (same as the CI workflow); run `scripts/build-index.ts` incrementally (skipping entries already in the Pinecone index, using `PINECONE_API_KEY` from a GitHub Secret); build the frontend with `npm run build`; and deploy with `cdk deploy --require-approval never` using the deploy AWS OIDC role.

#### Scenario: Successful merge deploys to production
- **WHEN** a commit is merged to `main`
- **THEN** the deploy workflow runs tests, runs build-index (incrementally), builds the frontend, and executes `cdk deploy`

#### Scenario: Deploy is blocked on test failure
- **WHEN** any test fails during the deploy workflow
- **THEN** `scripts/build-index.ts` and `cdk deploy` are NOT executed and the workflow fails

#### Scenario: Build-index is idempotent in CI/CD
- **WHEN** the deploy workflow runs and all icons already exist in the Pinecone index
- **THEN** `scripts/build-index.ts` exits successfully without making any embeddings API calls or S3 writes

#### Scenario: New icons are indexed before deploy
- **WHEN** new icon source entries are present that do not yet exist in the Pinecone index
- **THEN** `scripts/build-index.ts` embeds and uploads them before `cdk deploy` runs

### Requirement: GitHub OIDC authentication — no stored AWS credentials
Both workflows SHALL authenticate to AWS using GitHub's OIDC provider via `aws-actions/configure-aws-credentials`. No AWS access keys or secrets SHALL be stored in GitHub Secrets. The deploy workflow SHALL assume a deploy IAM role; the CI workflow SHALL assume a read-only IAM role. Both roles are provisioned by the CDK stack. The `PINECONE_API_KEY` GitHub Secret is a third-party service key (not an AWS credential) and is required for the build-index step in the deploy workflow.

#### Scenario: No static credentials in repository
- **WHEN** the repository secrets are inspected
- **THEN** no `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` values are present

#### Scenario: OIDC token used for authentication
- **WHEN** either workflow runs
- **THEN** `aws-actions/configure-aws-credentials` exchanges a GitHub OIDC token for temporary AWS credentials

### Requirement: Deploy role scoped to main branch only
The IAM deploy role assumed by the deploy workflow SHALL have a trust policy condition that restricts assumption to GitHub Actions tokens issued for the `refs/heads/main` ref of this repository.

#### Scenario: Main branch can deploy
- **WHEN** the deploy workflow runs on a push to `main`
- **THEN** the OIDC token successfully assumes the deploy role

#### Scenario: Non-main branches cannot assume deploy role
- **WHEN** a workflow on a feature branch attempts to assume the deploy role
- **THEN** AWS STS rejects the AssumeRoleWithWebIdentity call
