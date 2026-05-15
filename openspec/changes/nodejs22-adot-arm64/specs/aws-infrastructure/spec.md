## MODIFIED Requirements

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

## ADDED Requirements

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
