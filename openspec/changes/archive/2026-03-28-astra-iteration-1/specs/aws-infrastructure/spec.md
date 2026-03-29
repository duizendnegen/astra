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
The system SHALL expose the skeleton Lambda via an HTTP API Gateway at path `POST /api/skeleton`. The Lambda SHALL be written in Node.js and receive the OpenRouter API key as an environment variable injected by CDK from an AWS Secrets Manager secret or SSM Parameter.

#### Scenario: Endpoint reachable
- **WHEN** a POST request is made to the /api/skeleton path via CloudFront
- **THEN** the Lambda is invoked and returns a skeleton response

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
