# Custom Skeleton Pipeline

Generates constellation skeletons for words not covered by the ~1512 built-in Phosphor icons.
The pipeline is CSV-driven: `words.csv` acts as a state machine tracking each word through the stages.

## Prerequisites

```bash
cd scripts/custom-pipeline
npm install
npm run setup   # downloads vtracer binary (one-time)
```

Requires:
- `OPENROUTER_API_KEY` — used for Gemini image generation and OpenAI embeddings
- `icon-index.sqlite` in `lambda/` — the icon database (for the ingest step)

## Pipeline Stages

### 1. Generate PNGs

```bash
npm run generate
# or: npx tsx 01-generate-pngs.ts
```

Uses Gemini (`google/gemini-2.5-flash-image` via OpenRouter) to produce a black line-drawing PNG
for each word with status `new`. Saves to `data/custom/{word}-linedrawing.png` and advances status
to `proposed`.

To initialise a fresh word list:

```bash
npx tsx 01-generate-pngs.ts --init words-pilot.txt
```

### 2. Trace SVGs

```bash
npm run trace
# or: npx tsx 02-trace-svgs.ts
```

Runs `vtracer` on every `proposed` PNG to produce a clean polygon SVG at
`data/custom/{word}-linedrawing.svg`.

### 3. Vet (manual review)

```bash
npm run vet
# or: npx tsx 03-vet-server.ts
```

Opens a local review UI at **http://localhost:4242**.

Each word is shown as five panels — PNG, SVG render, and three skeleton previews (one per strategy).
Pick the skeleton that best represents the word, then accept or retry:

| Key | Action |
|-----|--------|
| `1` | Select concave-hull skeleton |
| `2` | Select polygon-union skeleton |
| `3` | Select subpath-components skeleton |
| `A` | Accept (requires a strategy to be selected) |
| `R` | Retry (opens reason picker) |
| `←` / `→` | Navigate |
| `G` | Jump to word |
| `Esc` | Close picker |

Accepted words advance to `accepted` with the chosen `skeleton_strategy` recorded.
Retried words go back to `new` with feedback attached to the next generation prompt.

### 4. Ingest

```bash
npm run ingest
# or: npx tsx 04-ingest.ts
```

For each `accepted` word:
1. Computes the skeleton from its SVG.
2. Generates a text embedding via OpenAI.
3. Inserts into `icon-index.sqlite` with `source='custom'`.

Advances status to `ingested`. Backs up the database to `icon-index.sqlite.bak` before writing.

## State Machine

```
new → proposed → accepted → ingested
                ↘ retry → new
```

## CSV Schema (`words.csv`)

| Column | Description |
|--------|-------------|
| `word` | The icon label |
| `status` | `new` / `proposed` / `accepted` / `retry` / `ingested` |
| `retry_reason` | Free-text feedback for the next generation attempt |
| `skeleton_strategy` | Chosen strategy: `concave-hull` / `polygon-union` / `subpath-components` / `` |
| `png_ms` | Time to generate PNG (ms) |
| `trace_ms` | Time to trace SVG (ms) |
| `skeleton_ms` | Time to compute skeleton (ms) |

## Live Integration

Custom icons are queried alongside Phosphor icons during L1 retrieval. The set of active sources
is controlled by the `L1_SOURCES` environment variable (default: `phosphor,custom`). Custom words
use a slightly higher confidence threshold (0.85 vs 0.80) for exact label matches.
