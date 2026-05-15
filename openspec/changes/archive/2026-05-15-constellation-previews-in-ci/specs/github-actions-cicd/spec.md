## ADDED Requirements

### Requirement: constellation-previews job in PR CI workflow
The `.github/workflows/ci.yml` workflow SHALL include a `constellation-previews` job that runs on pull requests targeting `main`. The job SHALL declare its own `permissions:` block with `contents: write`, `pull-requests: write`, and `id-token: write`. It SHALL list `test` in its `needs:` array so it only runs after unit tests pass. It SHALL configure AWS credentials using the read-only OIDC role (same role used by `cdk-diff`).

#### Scenario: constellation-previews job permissions are per-job scoped
- **WHEN** the workflow YAML is inspected
- **THEN** the `constellation-previews` job has its own `permissions:` block and the top-level block remains `id-token: write` / `contents: read`

#### Scenario: constellation-previews job depends on test job
- **WHEN** the workflow is triggered by a pull request
- **THEN** the `constellation-previews` job does not start until the `test` job has completed successfully

#### Scenario: existing test and cdk-diff jobs are unchanged
- **WHEN** the constellation-previews job is added
- **THEN** the `test` and `cdk-diff` job definitions are unmodified
