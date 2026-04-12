## 1. Project scaffolding

- [x] 1.1 Create `scripts/custom-pipeline/` directory with a `package.json` (or extend `scripts/package.json`) adding `express`, `@types/express`, and `node-fetch` (if not already available via Node 18+ built-in fetch)
- [x] 1.2 Add `scripts/custom-pipeline/bin/` to `.gitignore`
- [x] 1.3 Create `words-pilot.txt` with the ~50 pilot words: eagle, owl, shark, octopus, butterfly, bee, whale, fox, bear, rabbit, guitar, anchor, telescope, bicycle, key, lock, clock, compass, shield, mountain, volcano, wave, snowflake, leaf, cloud, flower, tree, mushroom, crab, crown, heart, star, lightning, flame, arrow, moon, sun, raindrop, fish, rocket, planet, comet, apple, banana, longing, serendipity, Beethoven

## 2. Setup script

- [x] 2.1 Implement `setup.ts`: check if `bin/vtracer.exe` exists; if not, download the pinned vtracer Windows x64 binary from GitHub releases (visioncortex/vtracer) and save to `bin/vtracer.exe`
- [x] 2.2 Add a `--version` sanity-check exec after download to confirm the binary runs

## 3. CSV state management

- [x] 3.1 Implement a shared `csv.ts` utility: `readCsv()`, `writeCsv()`, `initCsvFromWordList(path)` — reads/writes `words.csv` atomically; `initCsvFromWordList` creates the CSV from a plain text word list with all rows set to `status=new`
- [x] 3.2 Add the `--init <wordlist>` flag handling to `01-generate-pngs.ts` that calls `initCsvFromWordList`

## 4. PNG generation (01-generate-pngs.ts)

- [x] 4.1 Implement `01-generate-pngs.ts`: reads CSV, filters `status=new|retry` rows, calls OpenRouter image generation API for each word with the line-drawing prompt, saves PNG to `data/custom/{word}-linedrawing.png`
- [x] 4.2 Record `png_ms` and update `status=proposed`, `png_path` in CSV after each successful generation
- [x] 4.3 On API error: increment `retry_count`, keep `status` unchanged, log warning with Pino and continue
- [x] 4.4 Verify the correct OpenRouter model ID for Gemini image generation (check OpenRouter model list) and hardcode the verified ID with a comment

## 5. SVG tracing (02-trace-svgs.ts)

- [x] 5.1 Implement `02-trace-svgs.ts`: reads CSV, filters `proposed` rows without `svg_path`, execs `bin/vtracer.exe` with flags `--colormode bw --mode polygon --filter_speckle 2 --corner_threshold 45 --segment_length 3.5`
- [x] 5.2 Record `trace_ms` and update `svg_path` in CSV after each successful trace
- [x] 5.3 Count subpaths in the resulting SVG; if > 500, set `status=retry`, increment `retry_count`, log warning

## 6. Vetting UI (03-vet-server.ts)

- [x] 6.1 Implement `GET /api/words` endpoint returning all `proposed` rows with their `png_path`, `svg_path`, and pre-computed skeleton (points + edges JSON from `svgToSkeleton`)
- [x] 6.2 Implement `POST /api/decide` endpoint accepting `{ word, decision: 'accepted' | 'retry' }`, updating CSV accordingly (increment `retry_count` on retry)
- [x] 6.3 Implement the single-page HTML UI: card layout showing PNG (`<img>`), SVG (`<img src="data:image/svg+xml,...">` or inline), and skeleton canvas (dots + edges)
- [x] 6.4 Add keyboard shortcuts: `A` accept, `R` retry, `←`/`→` navigate; display current word index and total count
- [x] 6.5 Show a completion screen when no `proposed` rows remain
- [x] 6.6 Import `svgToSkeleton` from `../../lambda/src/svg-to-skeleton.js` (relative path); pre-compute all skeleton previews at server startup and cache in memory

## 7. Ingest script (04-ingest.ts)

- [x] 7.1 Implement backup step: copy `data/icon-index.sqlite` to `data/icon-index.sqlite.bak` before any writes
- [x] 7.2 Implement Phylopic deletion: `DELETE FROM vectors WHERE id IN (SELECT id FROM entries WHERE source='phylopic')` then `DELETE FROM entries WHERE source='phylopic'`; log count of deleted rows
- [x] 7.3 Implement embedding + insert for each `accepted` row: call OpenRouter `text-embedding-3-small` with the word, insert into `entries` and `vectors`, record `skeleton_ms`, update `status=ingested` in CSV
- [x] 7.4 Skip rows already with `status=ingested`
- [x] 7.5 Log summary: words ingested, words skipped, Phylopic rows deleted, total DB entry count after run

## 8. Retrieval pipeline update

- [x] 8.1 Add `THRESHOLD_CUSTOM` constant (default `0.85`) to `lambda/src/retrieval.ts`
- [x] 8.2 Read `L1_SOURCES` env var at module load (default `'phosphor,custom'`); parse into an array of source strings
- [x] 8.3 Update `getSearchStmt` to generate `WHERE e.source IN (...)` dynamically from the parsed source list (use parameterised SQL or safely interpolate the validated source names)
- [x] 8.4 Update `thresholdFor()` to return `THRESHOLD_CUSTOM` for `'custom'` source
- [x] 8.5 Update `MatchProvenance` type: `source` union to include `'custom'`

## 9. Pilot run and evaluation

- [x] 9.1 Run `setup.ts` to download vtracer binary
- [x] 9.2 Run `01-generate-pngs.ts --init words-pilot.txt` to generate all pilot PNGs
- [x] 9.3 Run `02-trace-svgs.ts` to trace all pilot SVGs
- [ ] 9.4 Run `03-vet-server.ts` and vet all ~50 words; note accept rate and any surprising results
- [ ] 9.5 Run `04-ingest.ts` to ingest accepted words and remove Phylopic entries
- [ ] 9.6 Review timing stats in `words.csv`: compute mean `png_ms`, `trace_ms`, `skeleton_ms`; note whether live-loop integration is feasible

## 10. Test harness

- [x] 10.1 Add unit tests for `csv.ts` utility (read/write/init round-trip)
- [x] 10.2 Add integration test for `04-ingest.ts`: run against a test DB copy, verify custom entries present and Phylopic entries absent
- [x] 10.3 Update retrieval unit tests: add test cases for `L1_SOURCES=custom`, `L1_SOURCES=phosphor`, and mixed; mock index with custom + phosphor entries
- [ ] 10.4 Run the full test harness (`docker compose up --build`) and confirm all existing tests pass
- [ ] 10.5 Visual check with Playwright: open `localhost:4242` with the vet server running against a fixture set of 3 proposed words; confirm PNG, SVG, and skeleton all render; screenshot for regression baseline
