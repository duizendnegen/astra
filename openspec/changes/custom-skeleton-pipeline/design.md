## Context

The live retrieval pipeline falls back to L4 (LLM SVG generation) for words not covered by the ~1512 Phosphor icons. L4 quality is inconsistent because LLMs lack spatial/geometric reasoning — the SVG text is syntactically valid but visually unrecognisable. Image generation (Gemini) produces a PNG that a deterministic tracer (vtracer) converts to an SVG path; this pipeline is fundamentally more reliable for the "what does X look like" problem.

The new pipeline is **offline** — it runs before the live loop and populates a `custom` source in `icon-index.sqlite`. The live `retrieval.ts` pipeline is minimally changed: L1 is extended to query `custom` alongside `phosphor`. L3 and L4 remain as fallbacks for words not yet in the custom index.

Timing data collected during the pilot will determine whether the pipeline can eventually run in the live loop (as an alternative to L4 for cold-cache misses).

## Goals / Non-Goals

**Goals:**
- Pilot batch of ~50 words: validate that word → PNG → SVG → skeleton produces recognisable constellations
- CSV-driven state machine allowing incremental runs and manual vetting
- Local vetting UI showing PNG, rendered SVG, and skeleton side-by-side; approved words ingested into the DB
- L1 retrieval extended to search the `custom` source
- Phylopic entries removed from the index
- Per-word timing stats captured for future live-loop evaluation

**Non-Goals:**
- Live-loop integration of the image-generation step (deferred; evaluate from timing data)
- Automated quality scoring (vetting is manual)
- Multi-user or hosted vetting UI
- Supporting non-Windows platforms in this iteration (scripts target Windows x64 vtracer binary)

## Decisions

### D1: State machine in a CSV file

**Decision**: Use a CSV at `scripts/custom-pipeline/words.csv` as the single source of truth for word state.

**Rationale**: Simple, human-readable, diffable in git, easily edited by hand. No database overhead for what is essentially a batch job with ~50–5000 rows. Scripts read/write the CSV atomically (read all → modify → write all).

**Alternative considered**: SQLite state table — adds query power but unnecessary for this scale and introduces a second DB file.

**CSV schema**:
```
word,style,status,png_path,svg_path,png_ms,trace_ms,skeleton_ms,retry_count
guitar,linedrawing,new,,,,,,0
```

States: `new` → `proposed` → `accepted | retry` → `ingested`

One row per word (single style: `linedrawing` — see D3).

### D2: Gemini image generation via OpenRouter

**Decision**: Use `POST https://openrouter.ai/api/v1/images/generations` with model `google/gemini-2.0-flash-exp:image` (or equivalent Gemini image model available on OpenRouter) and the same API key already used by the live pipeline.

**Rationale**: Keeps credential management in one place (SSM / local env var). No additional SDK or auth flow.

**Prompt template** (same for all words, including abstract ones):
```
Simple black line drawing of {word} on white background. Clean outlines only, no fill, no shading, no text.
```

Abstract words ("longing", "serendipity", "Beethoven") are deliberately included in the pilot to surface how Gemini interprets them — the vetting step will catch failures.

**Response handling**: The API returns a base64-encoded PNG. The script saves it to `data/custom/{word}-linedrawing.png` and records `png_ms`.

### D3: Single style per word (line drawing)

**Decision**: Generate one PNG per word with a line-drawing prompt. Drop the silhouette variant.

**Rationale**: The current L5 pipeline (polygon boolean union → outer contour) works equally well on traced line drawings as on silhouettes. Reducing to one style per word halves the generation cost and simplifies vetting. If silhouettes prove superior after the pilot, the style column in the CSV allows adding them later without schema changes.

### D4: vtracer via prebuilt Windows x64 binary

**Decision**: `setup.ts` downloads the vtracer binary from the [GitHub releases page](https://github.com/visioncortex/vtracer/releases) into `scripts/custom-pipeline/bin/vtracer.exe`. The binary is `.gitignore`d. Scripts `execFile` it.

**vtracer settings**:
```
--colormode bw --mode polygon --filter_speckle 2 --corner_threshold 45 --segment_length 3.5
```
`polygon` mode (straight segments) is preferred over `spline` because L5 already re-simplifies the path; cubic Bezier curves from vtracer would be re-sampled to points anyway, adding noise.

**Alternative considered**: Docker (`ghcr.io/visioncortex/vtracer` or a custom image). Cleaner cross-platform story but adds per-trace container overhead and requires Docker daemon for a dev-only script. Noted as fallback.

### D5: Vetting UI as a local Express server

**Decision**: `03-vet-server.ts` starts an Express HTTP server on `localhost:4242`. The UI is a single self-contained HTML page served from a template string in the script (no build step). It fetches `/api/words` (all `proposed` rows), displays cards with PNG / SVG / skeleton, and POSTs decisions to `/api/decide`.

**Skeleton preview**: The server runs `svgToSkeleton` (imported from `lambda/src/svg-to-skeleton.ts` via relative path) on each SVG at startup and caches the result. The browser renders points and edges on a `<canvas>`.

**Keyboard shortcuts**: `A` accept, `R` retry, `←`/`→` navigate, `G` jump-to-word.

**Alternative considered**: Static HTML file with all decisions embedded — simpler but requires regenerating the file on each run and can't update CSV in real time.

### D6: L1 source filtering via L1_SOURCES env var

**Decision**: `retrieval.ts` reads `process.env.L1_SOURCES ?? 'phosphor,custom'` at startup and builds the SQL `WHERE e.source IN (...)` clause dynamically. Each source has a hard-coded threshold:

```ts
const THRESHOLDS: Record<string, number> = {
  phosphor: THRESHOLD_PHOSPHOR,  // 0.80
  custom:   0.85,
};
```

`L1_SOURCES=phosphor` restores the pre-change behaviour exactly.

**Rationale**: Custom SVGs have exact label matches, so a higher threshold (0.85) reduces false positives from near-synonym collisions.

### D7: Drop Phylopic entries

**Decision**: The `04-ingest.ts` script (or a standalone migration script) executes:
```sql
DELETE FROM vectors WHERE id IN (SELECT id FROM entries WHERE source = 'phylopic');
DELETE FROM entries WHERE source = 'phylopic';
```

**Rationale**: Phylopic is already excluded from L1 search (`WHERE e.source = 'phosphor'` hardcoded since the vector-outline-tracing change). The ~12,197 rows consume space in the vec0 virtual table and slow down full-index reads. Removing them is a one-way migration; the build-index script can re-ingest Phylopic if needed.

## Risks / Trade-offs

- **OpenRouter image generation API format**: The exact endpoint and response shape for Gemini image generation on OpenRouter needs to be verified during implementation. If unavailable, the Google AI SDK (`@google/generative-ai`) is a drop-in alternative using the same Gemini model.
- **vtracer binary availability**: If the GitHub release asset URL changes, `setup.ts` will fail. Mitigation: pin to a specific release tag and version-check the binary.
- **L5 compatibility with traced SVGs**: Gemini line drawings may produce multi-path SVGs with many subpaths. L5's polygon union step handles this, but very complex paths (>500 subpaths) may be slow. Mitigation: add a subpath count guard in `02-trace-svgs.ts` and flag words exceeding the threshold for manual review.
- **Abstract words**: "Longing", "serendipity" etc. will produce metaphorical images (figure reaching, lucky charm, etc.). These are valid constellations but may feel arbitrary. The vetting step is the quality gate.
- **Phylopic deletion is irreversible** on the live DB. Mitigation: take a DB backup before running the migration.

## Migration Plan

1. Run `setup.ts` to download vtracer binary.
2. Run `01-generate-pngs.ts` on the pilot word list.
3. Run `02-trace-svgs.ts` to produce SVGs.
4. Run `03-vet-server.ts`; vet all `proposed` words.
5. Run `04-ingest.ts`:
   a. Backs up `data/icon-index.sqlite` → `data/icon-index.sqlite.bak`.
   b. Deletes Phylopic entries.
   c. Embeds and inserts accepted custom SVGs.
6. Deploy updated `retrieval.ts` (with `L1_SOURCES` support) to Lambda.
7. Verify with test harness that L1 hits for custom words and phosphor words remain correct.

Rollback: restore from `.bak` file; revert `retrieval.ts` to previous deploy.

## Open Questions

- Which exact OpenRouter model ID corresponds to `google/gemini-2.5-flash-image`? Needs a quick API check during implementation.
- Should `04-ingest.ts` embed labels as just the word, or include any generated metadata (style, source prompt)? Current plan: embed the word only, matching how Phosphor labels are embedded.
