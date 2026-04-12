## ADDED Requirements

### Requirement: Index build script
The repository SHALL include a script at `scripts/build-index.ts` that downloads all Phosphor icons (and optionally Phylopic silhouettes), generates embeddings for their labels, upserts vectors into the Pinecone index, and uploads SVG path strings as objects to the icons S3 bucket. The script SHALL read `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, and `ICONS_BUCKET_NAME` from environment variables. When `PINECONE_HOST` is set, the Pinecone client SHALL use it as a custom host (enabling local emulator). When `AWS_ENDPOINT_URL` is set, the S3 client SHALL use it as the endpoint (enabling MinIO locally). This makes the script usable in both local development and CI/CD without code changes.

#### Scenario: Script runs to completion
- **WHEN** `npx tsx scripts/build-index.ts` is run with valid API keys and AWS credentials
- **THEN** vectors are upserted into the Pinecone index and SVG objects are written to S3 for all processed icons

#### Scenario: Incremental run skips existing entries
- **WHEN** the script is run and a vector with the given id already exists in the Pinecone index
- **THEN** that entry is skipped and not re-fetched or re-embedded

#### Scenario: Local mode uses Pinecone emulator and MinIO
- **WHEN** `PINECONE_HOST=http://pinecone-local:5081` and `AWS_ENDPOINT_URL=http://minio:9000` are set
- **THEN** the script writes vectors to the local Pinecone emulator and SVG objects to MinIO without contacting production services

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
The build script SHALL generate a 1536-dimensional float32 embedding for each entry by sending its label (and up to 5 tags) to `POST https://openrouter.ai/api/v1/embeddings` with `model: "openai/text-embedding-3-small"`. Embeddings SHALL be batched (up to 100 per request) to minimise API calls. Each embedding SHALL be upserted into the Pinecone index with metadata fields: `source`, `label`, `tags`.

#### Scenario: Embedding stored correctly
- **WHEN** an entry is embedded
- **THEN** the Pinecone index contains a vector for that entry id with `source`, `label`, and `tags` metadata

#### Scenario: Embedding failure is retried
- **WHEN** an embeddings API call fails
- **THEN** the script retries up to 3 times before skipping that batch and logging a warning

### Requirement: S3 icon storage
The build script SHALL upload each entry's SVG path string as an S3 object to the icons bucket, keyed as `{source}/{name}` (e.g. `phosphor/smiley`). The key SHALL be derived from the entry `id` by replacing the `:` separator with `/`.

#### Scenario: SVG object written to S3
- **WHEN** the build script processes an icon
- **THEN** an S3 object exists at key `{source}/{name}` containing the raw SVG path string

#### Scenario: Key derivation is deterministic
- **WHEN** an entry has id `phosphor:smiley`
- **THEN** the S3 key is `phosphor/smiley` with no additional prefix or extension
