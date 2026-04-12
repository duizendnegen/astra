# Deployment

This covers everything needed to go from a fresh checkout to a running production environment. Complete the steps in order. After this, all subsequent deploys are automatic via GitHub Actions on push to `main`.

## Prerequisites

- AWS CLI configured with admin credentials (`aws sts get-caller-identity` should work)
- Node.js 18+
- A [Pinecone](https://www.pinecone.io) Serverless index:
  - Dimensions: `1536`, Metric: `cosine`
  - Note: use `us-east-1` on the free plan — not all regions are available
- An [OpenRouter](https://openrouter.ai) API key
- A GitHub repository with Actions enabled

---

## Step 1 — Bootstrap CDK ✓

If this AWS account has never used CDK before:

```bash
cd infra && npm install
npx cdk bootstrap
```

**Done** — account `556992229058`, region `eu-central-1`.

## Step 2 — Provision secrets in SSM Parameter Store ✓

```bash
aws ssm put-parameter \
  --name /astra/openrouter-api-key \
  --type SecureString \
  --value <your-openrouter-api-key>

aws ssm put-parameter \
  --name /astra/pinecone-api-key \
  --type SecureString \
  --value <your-pinecone-api-key>
```

**Done** — both parameters provisioned.

## Step 3 — Deploy the CDK stack ✓

```bash
cd infra
npx cdk deploy
```

Note the stack outputs — you'll need them in Steps 4 and 5:

| Output | Value |
|--------|-------|
| `IconsBucketName` | `astra-icons-556992229058` |
| `DeployRoleArn` | `arn:aws:iam::556992229058:role/astra-github-actions-deploy` |
| `ReadOnlyRoleArn` | `arn:aws:iam::556992229058:role/astra-github-actions-readonly` |

**Done** — stack deployed.

## Step 4 — Build the icon index ✓

Embeds all Phosphor icons and uploads their SVGs to S3. Safe to re-run — existing entries are skipped.

```bash
cd scripts && npm install

OPENROUTER_API_KEY=<key> \
PINECONE_API_KEY=<key> \
PINECONE_INDEX_NAME=astra-prod-icons \
PINECONE_HOST=https://astra-prod-icons-ylyik2p.svc.aped-4627-b74a.pinecone.io \
ICONS_BUCKET_NAME=astra-icons-556992229058 \
npx tsx build-index.ts --phosphor-only
```

Takes a few minutes on first run (~1512 Phosphor icons to embed).

**Implementation notes:**
- Embeddings use `openai/text-embedding-3-small` via OpenRouter with **label-only** embed text (icon name, no tags). Tag-enriched text dilutes similarity scores significantly.
- Pinecone fetch batches are capped at 200 IDs to avoid HTTP 414 errors.
- `PINECONE_UPSERT_BATCH` is configurable (default `100`); reduce to `10` for local emulator.

**Done** — 1512 icons indexed, SVGs in S3.

## Step 5 — Configure GitHub Actions

In `duizendnegen/astra`: **Settings → Secrets and variables → Actions**

**Secrets:**

| Name | Value |
|------|-------|
| `PINECONE_API_KEY` | Your Pinecone API key |
| `OPENROUTER_API_KEY` | Your OpenRouter API key |

**Variables:**

| Name | Value |
|------|-------|
| `AWS_REGION` | `eu-central-1` |
| `AWS_DEPLOY_ROLE_ARN` | `arn:aws:iam::556992229058:role/astra-github-actions-deploy` |
| `AWS_READONLY_ROLE_ARN` | `arn:aws:iam::556992229058:role/astra-github-actions-readonly` |
| `PINECONE_INDEX_NAME` | `astra-prod-icons` |
| `ICONS_BUCKET_NAME` | `astra-icons-556992229058` |

## Step 6 — Verify

Push any commit to `main`. The deploy workflow runs tests → build-index (incremental) → frontend build → `cdk deploy`. Check the Actions tab to confirm it passes, then open the app and enter a word like `crown` — it should resolve at layer 1 (direct Pinecone hit) without an LLM call.

---

## Local development

The local stack uses [Pinecone Local](https://github.com/pinecone-io/pinecone-local) and [MinIO](https://min.io), both started by Docker Compose. The `index-init` service automatically populates the local Pinecone index on startup — no manual indexing step needed.

### Setup

1. Create `.env.local` in the repo root:

   ```
   OPENROUTER_API_KEY=<your-openrouter-api-key>
   PINECONE_API_KEY=<your-pinecone-api-key>
   ```

   The `PINECONE_API_KEY` is only needed if you want to connect locally to a real Pinecone index. For the local emulator it is unused (the compose file passes `local` as a placeholder).

2. Start all services:

   ```bash
   docker compose up --build
   ```

   On first run, `index-init` will embed and upload all ~1512 Phosphor icons into the local Pinecone emulator and MinIO bucket. Subsequent runs skip already-indexed entries.

3. The API is available at `http://localhost:3001`. Test with:

   ```bash
   curl -X POST http://localhost:3001/api/constellation \
     -H "Content-Type: application/json" \
     -d '{"word": "crown"}'
   ```

   A healthy response resolves at `"layer": 1`.

### Architecture notes

Pinecone Local exposes two ports:

| Port | Plane | Purpose |
|------|-------|---------|
| `5080` | Control | Index CRUD (`PINECONE_CONTROLLER_HOST`) |
| `5081` | Data | Vector upsert/query (`PINECONE_HOST`) |

Both env vars must be set. Using only `PINECONE_HOST` causes the SDK to inherit a loopback hostname from `describeIndex`, which is unreachable between containers.

### Similarity threshold

The retrieval pipeline uses `THRESHOLD_PHOSPHOR` (default `0.60`) to decide whether a Pinecone result is a good enough match for a direct L1 hit. This is calibrated for `text-embedding-3-small` with label-only embed text:

- Exact name queries score `1.000`
- Semantic near-matches (e.g. `rubbish` → `trash`) score `0.60–0.92`
- Unrelated words score below `0.45`

Override via env var if needed: `THRESHOLD_PHOSPHOR=0.55`.
