## 1. Dependencies and project scaffolding

- [x] 1.1 Add `compromise`, `better-sqlite3`, and `sqlite-vec` to `lambda/package.json` (and dev deps to `scripts/`)
- [x] 1.2 Add `@phosphor-icons/core` to scripts dev dependencies
- [x] 1.3 Create `scripts/` directory with its own `tsconfig.json` targeting Node, and add a `build-index` npm script
- [x] 1.4 Create `data/` directory (gitignored except for `.gitkeep`); add `data/icon-index.sqlite` to `.gitignore`

## 2. Index build script — Phosphor

- [x] 2.1 Create `scripts/build-index.ts` with SQLite schema setup: `entries`, `vectors` (sqlite-vec float32 table), and `metadata` tables
- [x] 2.2 Implement Phosphor ingestion: iterate all icons from `@phosphor-icons/core`, extract label from kebab-case name, tags, and regular-weight SVG path data; insert into `entries`
- [x] 2.3 Implement batch embedding helper: POST to `https://openrouter.ai/api/v1/embeddings` with `model: "openai/text-embedding-3-small"`, batches of 100, retry up to 3× on failure
- [x] 2.4 Wire Phosphor entries through embedding helper; store float32 blobs in `vectors` table
- [x] 2.5 Add incremental mode: skip entries already present in `entries` by source id

## 3. Index build script — Phylopic

- [x] 3.1 Implement Phylopic API pagination: `GET /api/v2/images?page=0&page_size=100`, follow until exhausted; handle HTTP 429 with exponential backoff
- [x] 3.2 For each Phylopic entry: fetch primary common name (fallback to genus + species), all common names + taxonomic names as tags, and primary vector SVG path
- [x] 3.3 Insert Phylopic entries into `entries` table (source = "phylopic"); embed and store in `vectors` table
- [x] 3.4 Write `metadata` table on completion: schema version, build date, entry counts per source

## 4. SVG → skeleton extractor (L5)

- [x] 4.1 Create `lambda/src/svg-to-skeleton.ts`; implement SVG `<path>` parser that handles M/L/C/S/Q/A/Z commands and resolves `transform` attributes
- [x] 4.2 Implement viewBox normalisation: map all coordinates to [0,1] using viewBox dimensions (fallback to bounding box)
- [x] 4.3 Implement curvature-weighted point sampling: subdivide Bezier curves proportionally to curvature, straight segments sparsely; target 100–500 dense points
- [x] 4.4 Implement Ramer-Douglas-Peucker simplification with auto-epsilon: iterate epsilon until output has 15–40 points
- [x] 4.5 Expose strategy parameter: `simplify` function signature `(points: Point[]) => Point[]`; RDP is default; add Visvalingam-Whyatt as an alternative
- [x] 4.6 Implement edge derivation: connect consecutive points along the same sub-path; close loops where the sub-path closes; do not bridge disconnected sub-paths
- [x] 4.7 Implement sub-step caching: in-memory Map keyed by `(svgHash)` for parse/sample results, `(svgHash, algorithmName, epsilon)` for simplified skeleton
- [x] 4.8 Add local disk cache for development: read/write JSON files under `data/l5-cache/` keyed by cache key hash

## 5. Retrieval pipeline (L0–L4)

- [x] 5.1 Create `lambda/src/retrieval.ts`; implement L0: lowercase, strip punctuation, lemmatise via `compromise`
- [x] 5.2 Implement embedding query helper: embed a string via OpenRouter, return float32 array
- [x] 5.3 Implement L1: embed normalised word, run cosine search against SQLite index via sqlite-vec, apply per-source thresholds (`THRESHOLD_PHOSPHOR`, `THRESHOLD_PHYLOPIC` as env-overridable constants)
- [x] 5.4 Implement L3: call LLM with concept-mapping prompt (synonyms + visual representations + translate), embed each candidate, re-query index, accept best hit above threshold
- [x] 5.5 Implement L4: call LLM with stroke-only SVG generation prompt (include 2–3 Phosphor few-shot examples); parse the returned SVG string
- [x] 5.6 Wire L0→L1→L3→L4→L5 into `retrieveSkeleton(word, db, apiKey): Promise<PipelineResult>` where `PipelineResult` includes `match` provenance and `skeletons`
- [x] 5.7 Add TRIANGLE_FALLBACK path: if L5 fails or L4 returns invalid SVG, return `{ match: null, skeletons: [TRIANGLE_FALLBACK] }`

## 6. Lambda integration

- [x] 6.1 Update `lambda/src/core.ts`: export `retrieveSkeleton` as the primary path; keep `generateSkeleton` for reference but do not call it
- [x] 6.2 Update `lambda/src/skeleton.ts` (handler): open SQLite connection at module load; pass `db` into `retrieveSkeleton`
- [x] 6.3 Update DynamoDB read path: treat cache entries missing `match` field as cache misses
- [x] 6.4 Update DynamoDB write path: store full extended cache schema `{ word, match, skeletons }`
- [x] 6.5 Update `lambda/src/local.ts`: ensure local dev server loads the SQLite index from `data/icon-index.sqlite`

## 7. Test harness updates

- [x] 7.1 Replace `test-harness/words.ts` with the A–E categorised word list (34 words across 5 categories)
- [x] 7.2 Update `test-harness/run.ts`: read `match.layer` and word category from results/fixtures and include both in `results.json` per-word entries
- [x] 7.3 Clear existing fixture directories that will conflict with the new word list; document which fixture dirs remain valid

## 8. Threshold calibration

- [x] 8.1 Run harness against category A words; inspect which words hit L1 vs fall through — adjust `THRESHOLD_PHOSPHOR` and `THRESHOLD_PHYLOPIC` until all category A words resolve at L1
- [x] 8.2 Run harness against full A–E word set; verify category C words reach L3 and D words reach L4
- [x] 8.3 Record final threshold values in `design.md` under a new "Calibrated Constants" section
<!-- 8.x requires data/icon-index.sqlite to exist: run `cd scripts && npm install && OPENROUTER_API_KEY=<key> npx tsx build-index.ts` first -->
