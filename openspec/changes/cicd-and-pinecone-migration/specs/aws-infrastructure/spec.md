## ADDED Requirements

### Requirement: GitHub OIDC Identity Provider
The CDK stack SHALL provision an IAM OIDC Identity Provider for `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. This is a one-time account-level resource that enables GitHub Actions to obtain temporary AWS credentials via STS.

#### Scenario: OIDC provider exists after deploy
- **WHEN** `cdk deploy` completes
- **THEN** an IAM OIDC provider for `token.actions.githubusercontent.com` exists in the AWS account

### Requirement: GitHub Actions deploy IAM role
The CDK stack SHALL provision an IAM role that GitHub Actions deploy workflows can assume via OIDC. The role's trust policy SHALL be scoped to tokens issued for the `refs/heads/main` ref of the `pepijn/astra` repository. The role SHALL have permissions sufficient to execute `cdk deploy`: CloudFormation stack operations, S3 bucket and object management, Lambda function updates, API Gateway changes, CloudFront invalidation, and reading SSM parameters.

#### Scenario: Deploy role assumable from main branch only
- **WHEN** the GitHub Actions deploy workflow on `main` calls `AssumeRoleWithWebIdentity`
- **THEN** the role is assumed successfully

#### Scenario: Deploy role denied on non-main branches
- **WHEN** a workflow on a non-main branch attempts to assume the deploy role
- **THEN** the `AssumeRoleWithWebIdentity` call is rejected by STS

### Requirement: GitHub Actions read-only IAM role
The CDK stack SHALL provision a second IAM role for PR CI workflows. This role SHALL be assumable by any ref in the `pepijn/astra` repository and SHALL have read-only permissions sufficient to run `cdk diff`: `cloudformation:DescribeStacks`, `cloudformation:GetTemplate`, SSM `GetParameter`, and related read operations.

#### Scenario: Read-only role allows cdk diff
- **WHEN** the PR CI workflow assumes the read-only role
- **THEN** `cdk diff` runs without permission errors

### Requirement: Icons S3 bucket
The CDK stack SHALL provision a private S3 bucket (`astra-icons-{account}`) for storing SVG path strings. The bucket SHALL block all public access. The Lambda function SHALL have `s3:GetObject` permission on this bucket. The `ICONS_BUCKET_NAME` environment variable SHALL be set on the Lambda to the bucket name.

#### Scenario: Lambda reads icon SVG from bucket
- **WHEN** the Lambda executes an L1 match and fetches the icon from S3
- **THEN** the `GetObject` call succeeds without permission errors

#### Scenario: Public access to icons bucket denied
- **WHEN** a request is made directly to the S3 bucket URL
- **THEN** the request is denied (403)

### Requirement: Pinecone API key in SSM Parameter Store
The CDK stack SHALL reference (but not create) an SSM SecureString parameter at `/astra/pinecone-api-key`. The Lambda function SHALL have `ssm:GetParameter` permission for this parameter. The `PINECONE_API_KEY_PARAM` environment variable SHALL be set on the Lambda to this parameter path.

#### Scenario: Lambda reads Pinecone API key at cold start
- **WHEN** the Lambda initialises its Pinecone client at module load
- **THEN** the SSM `GetParameter` call for `/astra/pinecone-api-key` succeeds
