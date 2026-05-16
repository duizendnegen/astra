## ADDED Requirements

### Requirement: Lambda handler exported via module.exports for ADOT compat
The `handler` function in `skeleton.ts` SHALL be declared without the `export` keyword and exported using `module.exports = { handler }` at the end of the file. ES module `export` syntax SHALL NOT be used for the handler entry point. This ensures the ADOT wrapper can redefine the handler property at runtime without a `TypeError: Cannot redefine property: handler` crash.

#### Scenario: Lambda handler is a configurable property
- **WHEN** the Lambda bundle is inspected in the deployed deployment package
- **THEN** the handler is exported via a plain `module.exports` assignment, not an `Object.defineProperty` non-configurable accessor

#### Scenario: ADOT wrapper activates without crash
- **WHEN** `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-handler` is set and the Lambda is invoked
- **THEN** the invocation returns a 2xx response and no `TypeError: Cannot redefine property: handler` appears in CloudWatch Logs
