# Astra

Enter any word — a person, animal, feeling, place — and Astra finds a real pattern in the night sky that matches its shape, drawing a novel constellation anchored to real star data. The result is shareable as a link and exportable as a PNG.

**Live:** [astra.plusx.black](https://astra.plusx.black)

## How it works

1. Your word is embedded and searched against ~1,500 Phosphor icon shapes in Pinecone — most concrete words match instantly at this layer
2. If no confident match, an LLM maps the word to related nouns (synonyms, categories) and re-queries the icon index
3. In parallel, Gemini generates a black-and-white line drawing of the word, which is traced to a shape outline via Potrace
4. The matched shape is fitted to real stars from the HYG catalogue using a three-phase algorithm (prescreen → greedy → Hungarian)
5. The constellation is rendered on a D3-projected star field, lines drawn between matched stars
6. The result is encoded into a share URL entirely client-side — no backend needed to replay it

---

## Prerequisites

- Node.js 22+
- Docker (for local development)

---

## Local development

Copy `.env.local.example` to `.env.local` and fill in your `OPENROUTER_API_KEY`, then:

```bash
docker compose up
```

The app runs at `http://localhost:5173`. The API runs on port 3001. Local Pinecone and MinIO services start automatically alongside the API. On first run, the `index-init` service embeds all ~1,500 icon shapes into the local index — this takes a few minutes.

### Running services individually

```bash
# Frontend dev server
cd frontend && npm install && npm run dev

# Lambda API (local, without Docker)
cd lambda && npm install && npm run dev:local
```

---

## Tests

```bash
# Frontend unit tests (matcher, projection, etc.)
cd frontend && npm test

# Lambda unit tests
cd lambda && npm test
```

### Test harness

The test harness runs the full pipeline over a fixed word list and produces an HTML report of constellation thumbnails for visual evaluation.

```bash
cd test-harness && npm install

# Run the suite (generates reports/v1/report.html)
npm run run

# Compare two runs side by side
npx tsx run.ts --compare v1 v2
```

Skeleton fixtures are stored in `test-harness/fixtures/` and committed to git for reproducibility. Missing fixtures are fetched from the local API (`localhost:3001`) on first run.

Use the `/test-constellations` skill in Claude Code to run the harness and get a visual review inline.

---

## Data scripts

Pre-built assets are committed. Re-run these only if the source data changes.

```bash
# HYG star catalogue → frontend/public/data/stars.json
node scripts/filter-hyg.mjs

# IAU constellation stick figures → frontend/public/data/constellation-lines.json
node scripts/build-constellation-lines.mjs
```

---

## Deployment

Infrastructure is defined in CDK (`infra/`). First-time setup requires:

- AWS account with CDK bootstrapped (`cd infra && npx cdk bootstrap`)
- SSM SecureString parameters: `/astra/openrouter-api-key` and `/astra/pinecone-api-key`
- A Pinecone Serverless index (1536 dimensions, cosine metric, `us-east-1`)
- Run `scripts/build-index.ts` once to embed all icon shapes and upload SVGs to S3
- GitHub Actions secrets: `OPENROUTER_API_KEY`, `PINECONE_API_KEY`
- GitHub Actions variables: `AWS_REGION`, `AWS_DEPLOY_ROLE_ARN`, `AWS_READONLY_ROLE_ARN`, `PINECONE_INDEX_NAME`, `ICONS_BUCKET_NAME`

After that, all deploys run automatically via GitHub Actions on push to `main` — tests, icon index build (incremental), frontend build, and `cdk deploy` in sequence.
