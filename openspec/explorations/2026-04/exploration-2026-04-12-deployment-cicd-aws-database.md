# Exploration: Deployment — CI/CD, AWS, and Database Migration

**Date:** 2026-04-12
**Linked change:** none

## Context

The project has AWS CDK infrastructure defined but no automated CI/CD pipeline — deployments are manual. The L1 vector search layer uses SQLite + sqlite-vec (native modules) which cannot be bundled by the CDK esbuild bundler, meaning L1 is effectively broken in production today. The goal is to set up GitHub Actions CI/CD, fix L1 in production by migrating to a managed vector database, and confirm the infrastructure-as-code is production-ready — all on a true pay-as-you-go basis.

## Observations

### Current Architecture

```
astra.plusx.black (Route53)
    ↓
CloudFront (CDN + SSL + caching)
    ├── S3 (frontend static assets — private, OAC)
    └── /api/* → API Gateway HTTP API
                    └── Lambda (astra-skeleton)
                            ├── DynamoDB (word-level skeleton cache, on-demand)
                            ├── SSM Parameter Store (OpenRouter API key)
                            ├── OpenRouter API (LLM calls + embeddings)
                            └── [BROKEN] SQLite icon-index.sqlite (L1 vector search)
```

CDK stack is complete at `infra/lib/infra-stack.ts`. Billing is on-demand everywhere
(DynamoDB PAY_PER_REQUEST, Lambda per-invocation, API Gateway per-request).

### The L1 Problem in Production

`lambda/src/retrieval.ts` L1 layer opens SQLite via `better-sqlite3` + loads the
`sqlite-vec` extension. Both are **native Node.js modules** compiled with C++ bindings.

The CDK stack uses `lambdaNodejs.NodejsFunction` which bundles via **esbuild** — esbuild
cannot bundle native `.node` binaries. The `INDEX_PATH` environment variable is also not
set in the Lambda definition in the CDK stack (`infra/lib/infra-stack.ts:46-50`).

**Result: L1 silently fails in production.** The pipeline falls through to L3/L4. This
means every cache miss incurs an LLM call that could have been served from the index.

Local SQLite index is 14MB (Phosphor ~7k icons + custom entries only — Phylopic excluded
by default via `L1_SOURCES`).

### What Migrating to a Managed Vector DB Fixes

1. Removes `better-sqlite3` and `sqlite-vec` native module deps → Lambda bundles cleanly
2. Makes L1 operational in production for the first time
3. Eliminates the need to ship a binary file with the Lambda
4. The index can be rebuilt and re-populated independently of Lambda deploys

### CI/CD Gap

No `.github/` directory exists. Current deploy workflow is manual:
```
cd frontend && npm run build
cd infra && npx cdk deploy
```

### Vector Index Entry Shape

Each entry requires:

| Field       | Type           | Example                                  |
|-------------|----------------|------------------------------------------|
| `id`        | string         | `phosphor:smiley`                        |
| `source`    | string         | `phosphor` \| `custom`                    |
| `label`     | string         | `smiley face`                            |
| `tags`      | string         | `emotion,happy,face`                     |
| `svgPath`   | string         | `M 10,20 L 30,40 ...` (200–2000 chars)   |
| `embedding` | float32[1536]  | OpenAI text-embedding-3-small            |

Total vectors in default config: **~7k** (Phosphor + custom). Small dataset.

### Pay-as-You-Go Vector DB Landscape

| Option                        | True PAYG? | Min monthly | Metadata/vector | Notes                               |
|-------------------------------|------------|-------------|-----------------|-------------------------------------|
| **Upstash Vector**            | Yes        | $0          | Arbitrary JSON  | $1/100k requests; simplest REST API |
| **Pinecone Serverless**       | Yes        | $0          | Up to 40KB      | Mature SDK, proven at scale         |
| **Turbopuffer**               | Yes        | $0          | Rich metadata   | Newest; purpose-built for serverless|
| OpenSearch Serverless (AWS)   | No         | ~$172       | Full document   | Min 2 OCUs — far too expensive      |
| Aurora Serverless v2+pgvector | No         | ~$43        | Full row        | Minimum ACU billing even when idle  |

For 7k vectors + low traffic, **Upstash Vector** and **Pinecone Serverless** are the
strongest fit. Both have zero minimum cost, REST APIs that work well from Lambda, and
can store the `svgPath` metadata per vector (eliminating a separate join).

### SVG Path Storage

SVG paths will be stored in **S3** (not in vector metadata). The lookup becomes two steps:

```
1. Embed word → vector DB query → [{id: "phosphor:smiley", score: 0.87}]
2. Match above threshold → S3.getObject("icons/phosphor/smiley") → svgPath string
```

The extra S3 round-trip is negligible at same-region Lambda latency (~1–5ms).

This also simplifies vector DB requirements: metadata per vector is just `id`, `source`,
`label`, `tags` — a few dozen bytes. All PAYG vector DB options fit comfortably.

The `scripts/build-index.ts` will need to upload SVG files to S3 in addition to
writing vectors, as part of the index-population step.

### GitHub OIDC vs Static Credentials

| Method            | Security            | Maintenance     | Recommended? |
|-------------------|---------------------|-----------------|--------------|
| OIDC              | Short-lived tokens  | None (no keys)  | Yes          |
| Static access key | Long-lived secret   | Must rotate     | No           |

OIDC requires a one-time CDK addition: an `aws-cdk-lib/aws-iam` OIDC provider pointing
at `token.actions.githubusercontent.com`, plus a role with a trust policy scoped to this
repo. The `aws-actions/configure-aws-credentials` action handles the rest.

### Index Rebuild Should Not Be in CI

`scripts/build-index.ts` calls OpenRouter embeddings API per icon — costs real money and
takes minutes. This should be a **separate manual or scheduled operation**, not a CI step.
The vector store is persistent state (like DynamoDB) — not rebuilt on every deploy.

---

## Rounds

## Round 1 — CI/CD Pipeline Design

### Q1.1 — Deployment trigger

When should a production deployment run automatically?

- [x] On merge to `main` ← recommended: simplest; main is always deployable
- [ ] Manual trigger only (`workflow_dispatch`)
- [ ] On tagged release (e.g. `v1.2.3`)

> **Your answer / freetext:**
>

### Q1.2 — AWS credentials method

How should GitHub Actions authenticate to AWS?

- [x] OIDC (no stored secrets, short-lived tokens) ← recommended: current best practice, CDK can provision the trust role
- [ ] Static access key + secret stored in GitHub Secrets

> **Your answer / freetext:**
>

### Q1.3 — PR workflow scope

On pull requests (not yet merged), what should CI do?

- [x] Run tests + `cdk diff` (shows infra changes, no deploy) ← recommended: safe preview without touching production
- [ ] Run tests only (skip CDK diff — it needs AWS access)
- [ ] Full deploy to a separate staging environment

> **Your answer / freetext:**
>

## Round 2 — Vector Database and S3 Icon Store

### Q2.1 — Vector database choice

With SVG paths moved to S3, metadata per vector is ~50 bytes. All PAYG options fit.
Updated comparison for ~7k vectors at low traffic:

| Option              | Free tier              | Pay tier         | SDK quality  | Notes                              |
|---------------------|------------------------|------------------|--------------|------------------------------------|
| **Upstash Vector**  | 10k queries/day, 200MB | $1/100k requests | REST + TS    | Simplest; likely free forever here |
| **Pinecone Serverless** | 2GB storage, 1M reads | Usage-based  | Official TS  | More mature; slightly more setup   |
| **Turbopuffer**     | None (pay from first query) | Per query | REST only | Purpose-built serverless; newest   |

At this scale, **Upstash Vector** is effectively free and has the simplest integration.
Pinecone is the safe choice if growth is expected.

- [ ] Upstash Vector ← recommended: effectively free at this scale, minimal setup, good TS SDK
- [x] Pinecone Serverless ← good if you want a more established vendor
- [ ] Turbopuffer

> **Your answer / freetext:**
>

### Q2.2 — S3 bucket for icon SVGs

Where should the SVG files live in S3?

- [x] New dedicated private bucket (`astra-icons-{account}`) ← recommended: clean separation; Lambda reads directly, never exposed via CloudFront
- [ ] Subfolder in the existing site bucket (`astra-site-{account}/icons/`) — simpler CDK, but mixes static assets with runtime data
- [ ] Objects stored publicly — not needed since only Lambda reads them

> **Your answer / freetext:**
>

### Q2.3 — S3 key structure for icon SVGs

How should SVG objects be keyed in S3? The key needs to be derivable from the vector DB
result `id` field (e.g. `phosphor:smiley`) without an extra lookup.

- [x] `{source}/{name}` → e.g. `phosphor/smiley` ← recommended: clean, avoids colon in key, groups by source prefix for easy listing
- [ ] `{id}` verbatim → e.g. `phosphor:smiley` — works but colons in S3 keys are unusual
- [ ] `{id}.svg` → e.g. `phosphor:smiley.svg` — adds extension but colons still awkward

> **Your answer / freetext:**
>

## Round 3 — Infrastructure and Architecture Changes

### Q3.1 — Where to store the Pinecone API key

The Lambda will need a Pinecone API key at runtime. The project already uses SSM Parameter
Store for the OpenRouter key — the same pattern applies here.

- [x] SSM Parameter Store (`/astra/pinecone-api-key`, SecureString) ← recommended: consistent with existing pattern; provisioned manually once, read by Lambda at cold start
- [ ] Secrets Manager — stronger rotation support but adds cost (~$0.40/secret/month) and complexity; overkill for a single static key

> **Your answer / freetext:**
>

### Q3.2 — OIDC trust role scope in CDK

The GitHub Actions OIDC role needs deploy permissions. Two scoping approaches:

- [x] Scoped to this repo + main branch only (`repo:owner/astra:ref:refs/heads/main`) ← recommended: minimal blast radius; PRs get a read-only role for `cdk diff`, main gets the deploy role
- [ ] Scoped to repo only (any branch can assume the deploy role) — simpler but a compromised branch could trigger a deploy

> **Your answer / freetext:**
>

### Q3.3 — Lambda cold-start strategy for Pinecone client

The Pinecone client needs to be initialised at cold start. Two patterns:

- [x] Initialise at module level (outside handler) and re-use across invocations ← recommended: standard Lambda best practice; client is reused on warm invocations
- [ ] Initialise inside handler on every invocation — simpler but wastes time on warm calls

> **Your answer / freetext:**
>

## Insights & Decisions

_Decision:_ Deploy to production automatically on every merge to `main`.
— _Reason:_ Main is always deployable; no need for manual gates at this scale.

_Decision:_ Use GitHub OIDC (not static access keys) for AWS authentication in CI.
— _Reason:_ Short-lived tokens, zero key rotation burden. CDK provisions the trust role.

_Decision:_ OIDC role scoped to `repo:owner/astra:ref:refs/heads/main`; a separate read-only role for PRs runs `cdk diff` only.
— _Reason:_ Minimises blast radius — no branch other than main can trigger a deploy.

_Decision:_ PRs run tests + `cdk diff`; merges to main run tests + `cdk deploy`.
— _Reason:_ Safe preview of infra changes without risking production on unreviewed code.

_Decision:_ Replace SQLite + sqlite-vec + better-sqlite3 with Pinecone Serverless for L1 vector search.
— _Reason:_ Native modules cannot be bundled by CDK's esbuild, making L1 broken in production today. Pinecone Serverless is truly PAYG (zero minimum cost), has a mature TS SDK, and is the best-fit managed option. No AWS-native PAYG vector DB exists (OpenSearch Serverless minimum ~$172/month).

_Decision:_ SVG path strings stored in a dedicated private S3 bucket (`astra-icons-{account}`), not in Pinecone metadata.
— _Reason:_ Keeps vector metadata lightweight; SVG data can be updated independently of the index; Lambda reads via S3 GetObject at same-region latency (~1–5ms).

_Decision:_ S3 key structure for icon SVGs: `{source}/{name}` (e.g. `phosphor/smiley`).
— _Reason:_ Directly derivable from the Pinecone result `id` field by splitting on `:`. Groups by source for easy listing. Avoids colons in S3 keys.

_Decision:_ Pinecone API key stored in SSM Parameter Store as `/astra/pinecone-api-key` (SecureString).
— _Reason:_ Consistent with the existing OpenRouter key pattern. Lambda reads at cold start.

_Decision:_ Pinecone client initialised at module level (outside the Lambda handler).
— _Reason:_ Standard Lambda best practice — client is reused across warm invocations, avoiding repeated initialisation overhead.

_Decision:_ Index rebuild (`scripts/build-index.ts`) is not part of CI/CD.
— _Reason:_ Embedding generation costs money and runs once per icon set update. The vector store and S3 icon bucket are persistent state, managed independently of application deploys.
