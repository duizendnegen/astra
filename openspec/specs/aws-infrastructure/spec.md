## ADDED Requirements

### Requirement: All infrastructure defined in AWS CDK
The system SHALL define all AWS resources in a single CDK stack using TypeScript. No resources SHALL be created manually outside of CDK. The stack SHALL be deployable with a single `cdk deploy` command.

#### Scenario: Stack deploys cleanly
- **WHEN** `cdk deploy` is run against a fresh AWS account/region
- **THEN** all required resources are provisioned without manual intervention

### Requirement: Static frontend on private S3 + CloudFront
The system SHALL serve the static frontend (HTML, JS, CSS, HYG star data) from a private S3 bucket accessed exclusively through a CloudFront distribution using Origin Access Control (OAC). The S3 bucket SHALL NOT be publicly accessible.

#### Scenario: Direct S3 access denied
- **WHEN** a request is made directly to the S3 bucket URL
- **THEN** the request is denied (403)

#### Scenario: CloudFront serves assets
- **WHEN** a request is made to astra.plusx.black
- **THEN** CloudFront serves the correct asset from S3

### Requirement: HTTPS via ACM certificate in us-east-1
The system SHALL provision an ACM certificate for `astra.plusx.black` in the `us-east-1` region (required for CloudFront). Certificate validation SHALL use DNS validation against the existing Route53 hosted zone for `plusx.black`.

#### Scenario: HTTPS enforced
- **WHEN** a request is made to http://astra.plusx.black
- **THEN** the request is redirected to HTTPS

#### Scenario: Certificate valid
- **WHEN** the site is accessed via HTTPS
- **THEN** no certificate warning is shown and the cert covers astra.plusx.black

### Requirement: Route53 A alias record
The system SHALL create a Route53 A alias record for `astra.plusx.black` pointing to the CloudFront distribution within the existing `plusx.black` hosted zone.

#### Scenario: Domain resolves to CloudFront
- **WHEN** astra.plusx.black is resolved via DNS
- **THEN** the request is routed to the CloudFront distribution

### Requirement: Lambda skeleton endpoint via API Gateway
The system SHALL expose the skeleton Lambda via an HTTP API Gateway at path `POST /api/constellation`. The Lambda SHALL use the `NODEJS_22_X` runtime and the `ARM_64` architecture (Graviton3). The Lambda SHALL be instrumented via the AWS-managed ADOT Lambda layer with `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` set as an environment variable. The Lambda SHALL receive the OpenRouter API key as an environment variable injected by CDK from an SSM Parameter.

#### Scenario: Endpoint reachable
- **WHEN** a POST request is made to the /api/constellation path via CloudFront
- **THEN** the Lambda is invoked and returns a skeleton response

#### Scenario: Lambda runs on Node.js 22
- **WHEN** the Lambda function is inspected in the AWS console
- **THEN** the runtime is shown as `nodejs22.x`

#### Scenario: Lambda runs on arm64
- **WHEN** the Lambda function is inspected in the AWS console
- **THEN** the architecture is shown as `arm64`

#### Scenario: ADOT layer present on Lambda
- **WHEN** the Lambda function configuration is inspected
- **THEN** the ADOT arm64 layer (`aws-otel-nodejs-arm64-ver-*`) is listed in the function's layers

### Requirement: aws-xray-sdk removed from Lambda bundle
The `aws-xray-sdk` package SHALL NOT appear in `lambda/package.json` dependencies or in the CDK `nodeModules` bundling list. The Lambda deployment package SHALL NOT include `aws-xray-sdk`.

#### Scenario: aws-xray-sdk absent from deployment asset
- **WHEN** the CDK deployment asset for the Lambda is inspected
- **THEN** `aws-xray-sdk` is not present in `node_modules`

### Requirement: @opentelemetry/api marked external in CDK bundling
`@opentelemetry/api` SHALL be listed in the CDK `externalModules` array alongside `@aws-sdk/*`. It SHALL NOT be listed in `nodeModules`. The ADOT layer provides this package at runtime.

#### Scenario: @opentelemetry/api resolved from ADOT layer
- **WHEN** the Lambda handler imports from `@opentelemetry/api`
- **THEN** the import resolves to the copy shipped in the ADOT layer without bundling error

### Requirement: DynamoDB skeleton cache table
The system SHALL provision a DynamoDB table in on-demand billing mode with `word` (string) as the partition key. No TTL is configured. The Lambda SHALL have IAM permissions to read and write this table.

#### Scenario: Lambda reads and writes cache
- **WHEN** the Lambda handles a skeleton request
- **THEN** it can read from and write to the DynamoDB table without permission errors

### Requirement: CloudFront invalidation on deploy
The CDK stack SHALL trigger a CloudFront invalidation for `/*` after each S3 asset deployment to ensure users receive updated frontend assets immediately.

#### Scenario: New deploy invalidates cache
- **WHEN** a new version of the frontend is deployed
- **THEN** a CloudFront invalidation is triggered and updated assets are served within the invalidation TTL

### Requirement: GitHub OIDC Identity Provider
The CDK stack SHALL provision an IAM OIDC Identity Provider for `token.actions.githubusercontent.com` with audience `sts.amazonaws.com`. This is a one-time account-level resource that enables GitHub Actions to obtain temporary AWS credentials via STS.

#### Scenario: OIDC provider exists after deploy
- **WHEN** `cdk deploy` completes
- **THEN** an IAM OIDC provider for `token.actions.githubusercontent.com` exists in the AWS account

### Requirement: GitHub Actions deploy IAM role
The CDK stack SHALL provision an IAM role that GitHub Actions deploy workflows can assume via OIDC. The role's trust policy SHALL be scoped to tokens issued for the `refs/heads/main` ref of the `pepijn/astra` repository. The role SHALL have permissions sufficient to: execute `cdk deploy` (CloudFormation stack operations, S3 bucket and object management, Lambda function updates, API Gateway changes, CloudFront invalidation, reading SSM parameters); and run `scripts/build-index.ts` (`s3:PutObject` on the icons bucket, `ssm:GetParameter` for the Pinecone key parameter).

#### Scenario: Deploy role assumable from main branch only
- **WHEN** the GitHub Actions deploy workflow on `main` calls `AssumeRoleWithWebIdentity`
- **THEN** the role is assumed successfully

#### Scenario: Deploy role denied on non-main branches
- **WHEN** a workflow on a non-main branch attempts to assume the deploy role
- **THEN** the `AssumeRoleWithWebIdentity` call is rejected by STS

#### Scenario: Deploy role can write to icons bucket
- **WHEN** the deploy workflow runs `scripts/build-index.ts` and uploads a new SVG to S3
- **THEN** the `PutObject` call on the icons bucket succeeds

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
