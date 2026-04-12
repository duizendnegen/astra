## Context

The L1 vector search layer is completely inoperative in production: `better-sqlite3` and `sqlite-vec` are native C++ modules that esbuild (used by CDK `NodejsFunction`) cannot bundle, and `INDEX_PATH` is not set in the Lambda environment. Every cache miss incurs an LLM call (L3/L4) that the local SQLite index could have served. The fix requires replacing the native-module stack with a managed vector database reachable over HTTPS.

Simultaneously, there is no automated deployment pipeline — `cdk deploy` is run manually from a developer machine. This change introduces GitHub Actions CI/CD alongside the database migration.

## Goals / Non-Goals

**Goals:**
- Make L1 operational in production for the first time
- Automate test + deploy on merge to `main` via GitHub Actions
- Eliminate native module dependencies from the Lambda bundle
- Use only truly pay-as-you-go services (zero minimum monthly cost)

**Non-Goals:**
- Staging / preview environments per PR
- Migrating Phylopic silhouettes (default `L1_SOURCES` excludes `phylopic`; the new build script will still support it, but populating it is deferred)
- Query performance optimisation beyond what Pinecone Serverless provides by default
- Modifying the L3/L4 fallback layers

## Decisions

### Pinecone Serverless for vector search

**Decision**: Use Pinecone Serverless as the L1 vector index.

**Rationale**: No AWS-native vector database offers true pay-as-you-go pricing — OpenSearch Serverless has a ~$172/month floor (minimum 2 OCUs); Aurora Serverless v2 + pgvector has a ~$43/month floor. Pinecone Serverless bills per read/write unit with no minimum, has a mature TypeScript SDK, and does not require native module compilation. Upstash Vector was a close alternative at lower cost, but Pinecone is more established and better documented.

**Alternatives considered**:
- OpenSearch Serverless — rejected: minimum cost too high
- Upstash Vector — viable but less mature; Pinecone chosen for stability
- Aurora Serverless v2 + pgvector — rejected: minimum cost and relational overhead

### SVG paths in S3, not in Pinecone metadata

**Decision**: Store SVG path strings as S3 objects (`astra-icons-{account}` bucket, keyed `{source}/{name}`), fetched via `GetObject` after a Pinecone match.

**Rationale**: Keeps vector metadata lightweight (only `id`, `source`, `label`, `tags`). SVG paths can be updated independently of the vector index. The extra S3 round-trip is negligible at same-region Lambda latency (~1–5ms).

**Alternatives considered**:
- Inline in Pinecone metadata — rejected by design: user preference; also better separation of concerns

### S3 key structure: `{source}/{name}`

**Decision**: Derive S3 key directly from the Pinecone result `id` by splitting on `:` → e.g. `phosphor:smiley` → key `phosphor/smiley`.

**Rationale**: Deterministic, no extra lookup needed. Groups by source for easy listing. Avoids colons in S3 keys (unusual and occasionally problematic in tools).

### GitHub OIDC for AWS credentials

**Decision**: Provision a GitHub OIDC Identity Provider in AWS (via CDK) and two IAM roles — a deploy role (trusted only for `refs/heads/main`) and a read-only role (trusted for any ref, used for `cdk diff` on PRs).

**Rationale**: Short-lived tokens, zero rotation burden. No AWS credentials stored as GitHub Secrets. The trust policy scope prevents any non-main branch from triggering production deploys.

**Alternatives considered**:
- Static `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` in GitHub Secrets — rejected: long-lived credentials, rotation risk

### Pinecone client initialised at module level

**Decision**: Initialise the Pinecone client and index reference outside the Lambda handler function (module scope).

**Rationale**: Standard Lambda best practice. The client is reused across warm invocations, avoiding repeated initialisation overhead on every request.

### Index rebuild is not a CI/CD step

**Decision**: `scripts/build-index.ts` is run manually (or on a separate schedule) and is not triggered by the deploy workflow.

**Rationale**: Embedding generation costs money (OpenRouter API calls) and can take minutes. The vector store and S3 bucket are persistent state — like DynamoDB — and do not need to be rebuilt on every deploy. The Lambda is independent of the index contents; L1 simply degrades gracefully if the index is empty.

## Risks / Trade-offs

**Pinecone cold query latency** → The first query to a Pinecone Serverless index after an idle period may have higher latency than steady-state. Mitigation: acceptable given low-traffic profile; L1 already has a DynamoDB cache layer above it at the word level.

**Two-service L1 lookup (Pinecone + S3)** → L1 now makes two network calls instead of one local SQLite query. Mitigation: both services are in-region and fast; the DynamoDB word-level cache absorbs repeat queries.

**Index populate-before-deploy ordering** → The new Lambda code expects Pinecone + S3 to be populated. If deployed before the index is built, L1 will return no results and the pipeline will fall through to L3/L4 — same behaviour as today. No hard failure. Mitigation: document the correct migration order.

**Pinecone vendor dependency** → Unlike SQLite, the index is hosted externally. Mitigation: the L3/L4 fallback pipeline remains intact; an outage degrades quality but does not break the application.

## Migration Plan

1. Add Pinecone SSM parameter manually: `aws ssm put-parameter --name /astra/pinecone-api-key --type SecureString --value <key>`
2. Run `cdk deploy` to provision the icons S3 bucket, OIDC provider, and IAM roles (Lambda code still uses SQLite at this point — no L1 regression)
3. Run the updated `scripts/build-index.ts` to populate Pinecone and upload SVGs to S3
4. Deploy the updated Lambda code (removes SQLite deps, adds Pinecone + S3 client)
5. Smoke-test L1 in production
6. Remove `data/icon-index.sqlite` from the repository

**Rollback**: Revert to the previous Lambda version via the AWS Console or `aws lambda update-function-code`. The SQLite file remains on disk during the migration window.
