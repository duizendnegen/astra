## ADDED Requirements

### Requirement: Index build script
The repository SHALL include a script at `scripts/build-index.ts` that downloads all Phosphor icons and Phylopic silhouettes, generates embeddings for their labels, and writes a SQLite database at `data/icon-index.sqlite`.

#### Scenario: Script runs to completion
- **WHEN** `npx ts-node scripts/build-index.ts` is run with a valid OpenRouter API key
- **THEN** `data/icon-index.sqlite` is created (or overwritten) containing entries from both Phosphor and Phylopic

#### Scenario: Incremental run skips existing entries
- **WHEN** the script is run and `data/icon-index.sqlite` already contains an entry for a given source id
- **THEN** that entry is skipped and not re-fetched or re-embedded

### Requirement: SQLite schema
The index SHALL use two tables. `entries(id TEXT PRIMARY KEY, source TEXT, label TEXT, tags TEXT, svg_path TEXT)` stores one row per icon/silhouette. `vectors` stores one embedding per entry as a float32 blob compatible with sqlite-vec. A `metadata(key TEXT, value TEXT)` table SHALL record schema version, build date, and entry counts per source.

#### Scenario: Schema is present after build
- **WHEN** the build script completes
- **THEN** `data/icon-index.sqlite` contains `entries`, `vectors`, and `metadata` tables with correct column types

#### Scenario: Source tag is set correctly
- **WHEN** a Phosphor icon is inserted
- **THEN** its `source` column value is `"phosphor"`
- **WHEN** a Phylopic silhouette is inserted
- **THEN** its `source` column value is `"phylopic"`

### Requirement: Phosphor ingestion
The build script SHALL import all icons from the `@phosphor-icons/core` npm package. For each icon it SHALL store: id (icon name), source ("phosphor"), label (human-readable name derived from kebab-case), tags (comma-separated from Phosphor's tag list), svg_path (the regular weight SVG path data).

#### Scenario: All Phosphor icons ingested
- **WHEN** the build script runs
- **THEN** the entries table contains at least 7000 rows with source = "phosphor"

### Requirement: Phylopic ingestion
The build script SHALL paginate the Phylopic REST API to fetch all available silhouettes. For each silhouette it SHALL store: id (Phylopic UUID), source ("phylopic"), label (primary common name if available, else genus + species), tags (all common names + taxonomic names, comma-separated), svg_path (SVG path data from the primary vector image).

#### Scenario: Phylopic entries ingested
- **WHEN** the build script runs
- **THEN** the entries table contains at least 10000 rows with source = "phylopic"

#### Scenario: Phylopic API rate limit handled
- **WHEN** the Phylopic API returns HTTP 429
- **THEN** the script waits and retries with exponential backoff, then continues

### Requirement: Embeddings
The build script SHALL generate a 1536-dimensional float32 embedding for each entry by sending its label (and up to 5 tags) to `POST https://openrouter.ai/api/v1/embeddings` with `model: "openai/text-embedding-3-small"`. Embeddings SHALL be batched (up to 100 per request) to minimise API calls.

#### Scenario: Embedding stored correctly
- **WHEN** an entry is embedded
- **THEN** the vectors table contains a row for that entry id with a 1536-float32 blob

#### Scenario: Embedding failure is retried
- **WHEN** an embeddings API call fails
- **THEN** the script retries up to 3 times before skipping that batch and logging a warning
