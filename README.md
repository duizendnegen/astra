# Astra

Enter any word — a person, animal, feeling, place — and Astra finds a real pattern in the night sky that matches its shape, drawing a novel constellation anchored to real star data. The result is shareable as a link and exportable as a PNG.

**Live:** [astra.plusx.black](https://astra.plusx.black)

## How it works

1. Your word is sent to a Lambda-backed LLM endpoint, which returns a JSON skeleton (keypoints + edges)
2. The skeleton is matched to real stars from the HYG catalogue using the Hungarian algorithm
3. The constellation is rendered on a D3-projected star field, lines drawn between matched stars
4. The result is encoded into a share URL entirely client-side — no backend needed to replay it

---

## Prerequisites

- Node.js 18+
- Docker (for local development)

---

## Local development

Copy `.env.local.example` to `.env.local` and fill in your `OPENROUTER_API_KEY`, then:

```bash
docker compose up
```

The app runs at `http://localhost:5173`. The API runs on port 3001. Local Pinecone and MinIO services start automatically alongside the API.

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

---

## Test harness

The test harness runs the full shape pipeline over a fixed word list and produces an HTML report of constellation thumbnails for visual evaluation.

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

## Feature flags

Controlled via URL query params — useful for development and debugging:

| Param           | Effect                                         |
|-----------------|------------------------------------------------|
| `?show_lines=1` | Show IAU constellation stick figures           |
| `?show_stars=1` | Show named star labels (20 brightest stars)    |

Flags can be combined: `?show_lines=1&show_stars=1`

---

## Deployment

Infrastructure is defined in CDK (`infra/`). After the initial setup, all deploys run automatically via GitHub Actions on push to `main` — tests, icon index build, frontend build, and `cdk deploy` in sequence.

See [DEPLOYMENT.md](./DEPLOYMENT.md) for first-time setup instructions.
