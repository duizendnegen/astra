# Astra

Turn any word into a constellation. Astra generates a skeleton from your word, matches it to real stars, and renders your custom constellation on a live star map.

## Prerequisites

- Node.js 18+
- Docker (for local API)

## Setup

```bash
# Install frontend dependencies
cd frontend && npm install

# Install lambda dependencies
cd ../lambda && npm install
```

## Development

```bash
# Start the API (Docker required)
docker compose up

# In a separate terminal, start the frontend dev server
cd frontend && npm run dev
```

The app is available at `http://localhost:5173`.

## Data Scripts

Static data assets are pre-built and committed. Run these scripts to regenerate them.

### Star catalogue (`frontend/public/data/stars.json`)

Fetches the HYG v3.0 dataset from GitHub (requires internet).

```bash
node scripts/filter-hyg.mjs
# → frontend/public/data/stars.json
```

### Constellation lines (`frontend/public/data/constellation-lines.json`)

Fetches IAU stick-figure data from the d3-celestial project (requires internet).

```bash
node scripts/build-constellation-lines.mjs
# → frontend/public/data/constellation-lines.json
```

## Feature Flags

Runtime feature flags are controlled via URL params:

| Param          | Effect                                      |
|----------------|---------------------------------------------|
| `?show_lines=1`| Show IAU constellation stick figures        |
| `?show_stars=1`| Show named star labels (20 brightest stars) |

Flags are independent and can be combined: `?show_lines=1&show_stars=1`

## Tests

```bash
cd frontend && npm test
```
