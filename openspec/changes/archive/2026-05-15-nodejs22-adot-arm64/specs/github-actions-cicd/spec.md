## MODIFIED Requirements

### Requirement: PR CI workflow
The repository SHALL include a GitHub Actions workflow at `.github/workflows/ci.yml` that runs on all pull requests targeting `main`. All `actions/setup-node` steps in this workflow SHALL specify `node-version: '22'`. The workflow SHALL install dependencies and run `npm test` in the `lambda/` and `frontend/` packages, then run `cdk diff` in `infra/` using the read-only AWS OIDC role.

#### Scenario: Tests pass on PR
- **WHEN** a pull request is opened or updated
- **THEN** the CI workflow runs and reports test results for both lambda and frontend packages

#### Scenario: CDK diff runs on PR
- **WHEN** a pull request is opened or updated
- **THEN** `cdk diff` runs against the live AWS environment and its output is visible in the workflow logs

#### Scenario: CI fails on test failure
- **WHEN** any test in the lambda or frontend package fails
- **THEN** the CI workflow fails and the pull request is blocked

#### Scenario: CI uses Node.js 22
- **WHEN** the CI workflow runs
- **THEN** `node --version` in any step reports `v22.x`

### Requirement: Deploy workflow on main
The repository SHALL include a GitHub Actions workflow at `.github/workflows/deploy.yml` that triggers on push to `main`. All `actions/setup-node` steps in this workflow SHALL specify `node-version: '22'`. The CDK deploy job SHALL include a `docker/setup-qemu-action@v3` step before the `cdk deploy` step to enable arm64 Docker image execution on x86_64 runners. The workflow SHALL, in order: run tests; run `scripts/build-index.ts` incrementally; build the frontend; and deploy with `cdk deploy --require-approval never` using the deploy AWS OIDC role.

#### Scenario: Successful merge deploys to production
- **WHEN** a commit is merged to `main`
- **THEN** the deploy workflow runs tests, runs build-index (incrementally), builds the frontend, and executes `cdk deploy`

#### Scenario: Deploy is blocked on test failure
- **WHEN** any test fails during the deploy workflow
- **THEN** `scripts/build-index.ts` and `cdk deploy` are NOT executed and the workflow fails

#### Scenario: Deploy uses Node.js 22
- **WHEN** the deploy workflow runs
- **THEN** `node --version` in any step reports `v22.x`

#### Scenario: QEMU step present before CDK deploy
- **WHEN** the deploy workflow runs the CDK deploy job
- **THEN** the `docker/setup-qemu-action@v3` step executes before `cdk deploy` to support arm64 Docker bundling
