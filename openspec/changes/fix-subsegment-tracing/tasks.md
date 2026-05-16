## 1. Fix handler export syntax

- [x] 1.1 In `lambda/src/skeleton.ts`, remove `export` keyword from `handler` function declaration
- [x] 1.2 Add `module.exports = { handler };` at the end of `skeleton.ts`

## 2. Fix CDK bundling and environment config

- [x] 2.1 In `infra/lib/infra-stack.ts`, move `@opentelemetry/api` from `nodeModules` to `externalModules`
- [x] 2.2 Add `AWS_LAMBDA_EXEC_WRAPPER: '/opt/otel-handler'` to the Lambda `environment` block
- [x] 2.3 Add `OTEL_SERVICE_NAME: 'astra-skeleton'` to the Lambda `environment` block
- [x] 2.4 Add `OTEL_NODE_ENABLED_INSTRUMENTATIONS: 'aws-lambda,aws-sdk'` to the Lambda `environment` block

## 3. Fix package.json

- [x] 3.1 In `lambda/package.json`, move `@opentelemetry/api` from `dependencies` to `devDependencies`
- [x] 3.2 Run `npm install` in `lambda/` to update `package-lock.json`

## 4. Deploy and verify

- [ ] 4.1 Commit changes and push to trigger CI deploy
- [ ] 4.2 After deploy, invoke the Lambda with a known word (e.g. "pheromone") via the browser or curl
- [ ] 4.3 In AWS X-Ray console, find the trace and verify custom subsegments appear: `embed`, `matcher`, and at least one of `l3-candidates` / `l4-image-gen` / `svg-to-skeleton`
- [ ] 4.4 Verify DynamoDB and S3 subsegments appear automatically from `aws-sdk` instrumentation
- [ ] 4.5 Verify CloudWatch Logs contain no `TypeError: Cannot redefine property: handler` errors
- [ ] 4.6 Verify the Lambda returns 200 responses (no regression)
