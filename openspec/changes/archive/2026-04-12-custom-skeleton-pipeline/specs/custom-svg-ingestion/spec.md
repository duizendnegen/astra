## ADDED Requirements

### Requirement: Word state tracked in CSV
The pipeline SHALL use a CSV file at `scripts/custom-pipeline/words.csv` as the state machine for all words. Each row SHALL have columns: `word, style, status, png_path, svg_path, png_ms, trace_ms, skeleton_ms, retry_count`. The `style` column SHALL always be `linedrawing` in this iteration. Valid `status` values are: `new`, `proposed`, `accepted`, `retry`, `ingested`.

#### Scenario: Initial word list loaded
- **WHEN** `words.csv` does not exist and `01-generate-pngs.ts` runs with `--init words-pilot.txt`
- **THEN** a `words.csv` is created with one row per word from the pilot file, all with `status=new` and `retry_count=0`

#### Scenario: Status transitions preserved across runs
- **WHEN** a script run completes partially (e.g. after network error)
- **THEN** already-processed rows retain their current status and the next run resumes from `new` or `retry` rows only

### Requirement: PNG generation via Gemini on OpenRouter
The `01-generate-pngs.ts` script SHALL process all rows with `status=new` or `status=retry`. For each word it SHALL call the OpenRouter image generation API with model `google/gemini-2.0-flash-exp:image` (or the current Gemini image model available on OpenRouter) and the prompt `"Simple black line drawing of {word} on white background. Clean outlines only, no fill, no shading, no text."` The resulting PNG SHALL be saved to `data/custom/{word}-linedrawing.png`. The script SHALL record `png_ms` (elapsed API call time in ms) and update `status` to `proposed` and `png_path` in the CSV.

#### Scenario: PNG generated and saved
- **WHEN** `01-generate-pngs.ts` runs for a word with `status=new`
- **THEN** a PNG file is written to `data/custom/{word}-linedrawing.png`, `png_ms` is recorded, and `status` becomes `proposed`

#### Scenario: API failure does not corrupt CSV
- **WHEN** the OpenRouter image API returns an error for a word
- **THEN** that word's row retains `status=new` (or `retry`) and `retry_count` is incremented; the script continues to the next word

#### Scenario: Abstract word generates a PNG
- **WHEN** the word is abstract (e.g. "longing" or "serendipity")
- **THEN** the Gemini API returns a PNG (a visual metaphor); the script saves it without evaluating content

### Requirement: SVG tracing via Potrace
The `02-trace-svgs.ts` script SHALL process all rows with `status=proposed` that have a `png_path` but no `svg_path`. For each PNG it SHALL invoke Potrace, writing the resulting SVG to `data/custom/{word}-linedrawing.svg`. The script SHALL record `trace_ms` and update `svg_path` in the CSV.

#### Scenario: SVG produced from PNG
- **WHEN** `02-trace-svgs.ts` runs for a word with a valid PNG
- **THEN** an SVG file is written to `data/custom/{word}-linedrawing.svg`, `trace_ms` is recorded, and `svg_path` is set in the CSV

#### Scenario: Trace failure leaves word untraced
- **WHEN** Potrace fails for a word
- **THEN** `svg_path` remains empty, a warning is logged, and the word remains at `status=proposed`

### Requirement: Local vetting UI
The `03-vet-server.ts` script SHALL start an Express HTTP server on `localhost:4242` that serves a single-page vetting UI. The UI SHALL display one card per `proposed` word showing: the PNG image, the rendered SVG, and the skeleton rendered as dots and edges on a canvas. The server SHALL expose `GET /api/words` returning all `proposed` rows and `POST /api/decide` accepting `{ word, decision: 'accepted' | 'retry' }` to update the CSV. The UI SHALL support keyboard shortcuts: `A` (accept), `R` (retry), `←`/`→` (navigate between words). The server SHALL import `svgToSkeleton` from `lambda/src/svg-to-skeleton.ts` to pre-compute skeleton previews at startup.

#### Scenario: Words displayed in vetting UI
- **WHEN** the vet server is running and a browser opens `localhost:4242`
- **THEN** all `proposed` words are shown with PNG, SVG, and skeleton side-by-side

#### Scenario: Accept decision updates CSV
- **WHEN** the user presses `A` on a word card
- **THEN** a POST to `/api/decide` is made, the CSV `status` for that word changes to `accepted`, and the card is visually marked

#### Scenario: Retry decision updates CSV
- **WHEN** the user presses `R` on a word card
- **THEN** a POST to `/api/decide` is made, the CSV `status` for that word changes to `retry` and `retry_count` is incremented

#### Scenario: No proposed words remaining
- **WHEN** all words have been vetted (no `proposed` rows)
- **THEN** the UI shows a completion message and the server can be stopped

### Requirement: Ingest accepted SVGs into icon-index.sqlite
The `04-ingest.ts` script SHALL process all rows with `status=accepted`. Before any writes it SHALL create a backup at `data/icon-index.sqlite.bak`. It SHALL then delete all entries with `source='phylopic'` from both `entries` and `vectors` tables. For each accepted word it SHALL call the OpenRouter embeddings API (`openai/text-embedding-3-small`) with the word as input, then insert a row into `entries` (`id=custom:{word}`, `source=custom`, `label={word}`, `tags=''`, `svg_path=<svg content>`) and a corresponding row into `vectors`. The script SHALL record `skeleton_ms` (time to run `svgToSkeleton` on the SVG) and update `status` to `ingested` in the CSV.

#### Scenario: Phylopic entries removed
- **WHEN** `04-ingest.ts` runs for the first time
- **THEN** all rows with `source='phylopic'` are deleted from `entries` and `vectors` before any inserts

#### Scenario: Custom entry inserted
- **WHEN** an accepted word is ingested
- **THEN** `entries` contains a row `id=custom:{word}`, `source=custom`, and `vectors` contains the corresponding 1536-dim embedding

#### Scenario: Backup created before writes
- **WHEN** `04-ingest.ts` runs
- **THEN** `data/icon-index.sqlite.bak` is created (or overwritten) before any DELETE or INSERT executes

#### Scenario: Already-ingested word skipped
- **WHEN** `04-ingest.ts` runs and a word already has `status=ingested`
- **THEN** that row is skipped without re-embedding or re-inserting
