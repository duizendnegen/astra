## Context

The Astra skeleton pipeline has one job: given a word, produce a `Skeleton[]` (points + edges in 0–1 coordinate space) that the frontend matcher can fit to a patch of real stars. Currently `lambda/src/core.ts` does this by asking an LLM to (1) describe the shape in prose, then (2) emit [x,y] coordinate pairs. ~15 prompt variants across multiple models have been tried; none produce reliably correct skeletons. The failure mode is consistent: LLMs understand shapes conceptually but produce coordinates that are spatially incoherent — vertices cluster, proportions collapse, interior edges appear.

The fix is architectural: two high-quality SVG databases already contain exactly the shapes we need. Phosphor Icons (~7k, MIT) covers objects, symbols, and actions. Phylopic (~15k, CC) covers organisms. Together they give ~22k pre-drawn silhouettes. The word-to-shape problem becomes retrieval, not generation. LLMs are only used when retrieval fails, and even then to name candidate shapes rather than to draw coordinates.

The skeleton interface, DynamoDB table, Lambda handler signature, and all frontend code are unchanged.

## Goals / Non-Goals

**Goals:**
- Replace LLM coordinate generation with index-based SVG retrieval for the common case
- Establish a deterministic, swappable SVG → skeleton extractor (L5) with per-step caching
- Build a local-first pipeline that can be validated with the test harness before any production wiring
- Extend the DynamoDB cache to record match provenance so L5 can be re-run independently
- Refresh the test harness word set to exercise each pipeline layer explicitly

**Non-Goals:**
- Changing the `Skeleton` type, the matcher, the renderer, share links, or PNG export
- Production S3 index storage (Phase 2, deferred until local pipeline is validated)
- Lambda cold-start warmup optimisation
- Supporting non-text input (images, sketches)
- Real-time index updates (the index is built offline)

## Decisions

### D1 — SQLite + sqlite-vec for the index

**Decision**: The index is a single SQLite file with the sqlite-vec extension. Two tables: `entries` (id, source, label, tags, svg_path) and `vectors` (id, embedding BLOB of 1536 float32s). Cosine search via sqlite-vec's `vec_cosine_distance`.

**Rationale**: Self-contained, no external service dependency, file can be shipped locally or uploaded to S3 for Lambda. sqlite-vec handles ANN at ~22k entries with sub-millisecond query times. No infra to provision, no API key to manage.

**Alternative considered**: Pinecone or Turbopuffer (Option C). Adds HTTP latency, external service dependency, and cost for a dataset this small. Rejected for now.

---

### D2 — OpenRouter for embeddings (text-embedding-3-small)

**Decision**: Embed via `POST https://openrouter.ai/api/v1/embeddings` with `model: "openai/text-embedding-3-small"`. One API key (already used for LLM calls), 1536-dimensional vectors.

**Rationale**: Consolidates to one external dependency. text-embedding-3-small has strong performance on common nouns at low cost (~$0.0001/1k tokens). If OpenRouter's embeddings endpoint is unavailable, falling back to direct OpenAI is a one-line config change.

**Alternative considered**: Bundled ONNX model (all-MiniLM-L6-v2). Avoids the API call at query time but adds ~80MB to the deployment package and a cold-start cost. Rejected — the API call is fast (~80ms) and avoids bundling a model runtime.

---

### D3 — L0: local normalisation only, no translation

**Decision**: L0 does three things, all local: lowercase + strip punctuation, lemmatise via `compromise.js` ("running" → "run", "towers" → "tower"). Language detection and translation are not performed at L0.

**Rationale**: The embedding model handles cognates and common loanwords. Genuinely foreign words that miss L1 are caught at L3, whose prompt instructs: "translate to English first if the word is not already English."

**Alternative considered**: Dedicated detect → translate step at L0. Adds latency, a service dependency, and complexity for a failure mode that L3 already handles.

---

### D4 — L2 folded into L3

**Decision**: There is no separate Layer 2 synonym expansion step. L3's LLM prompt asks for both synonyms and visual representations in one call: "Give 5 synonyms and visual representations of '[word]'. Translate to English first if not English. Return single nouns only."

**Rationale**: L1's embedding already handles close synonyms well. When L1 fails, it usually means the index lacks a strong representation for the concept — in which case WordNet synonyms are unlikely to save it. L3 handles both the synonym case and the conceptual leap case in one call.

**Alternative considered**: WordNet lookup before L3. Saves one LLM call for simple synonyms, but adds a WordNet dependency and code complexity for marginal gain.

---

### D5 — Per-source confidence thresholds

**Decision**: Two thresholds: `THRESHOLD_PHOSPHOR` and `THRESHOLD_PHYLOPIC`, both tuned empirically against the test harness. A match is accepted if `similarity > threshold[entry.source]`.

**Rationale**: Phosphor labels are short and precise; Phylopic labels include taxonomy plus common names. Their cosine similarity distributions differ. A single threshold would either over-accept from one source or under-accept from the other.

**Implementation**: Both thresholds are constants in the retrieval module, overridable via environment variables for threshold sweep experiments.

---

### D6 — Extended DynamoDB cache schema

**Decision**: Cache entries store match provenance alongside skeletons:
```
{
  word: string,
  match: {
    source: "phosphor" | "phylopic" | "llm",
    id: string,
    similarity: number,
    layer: 1 | 3 | 4,
    svgPath: string
  },
  skeletons: Skeleton[]
}
```

**Rationale**: L5 parameters (point count, simplification algorithm) will be iterated on. Storing `svgPath` allows skeleton regeneration without re-running L0–L4. `layer` and `similarity` give production visibility into which pipeline path is firing.

**Migration**: New cache entries use the extended schema. Old entries (without `match`) are treated as cache misses and regenerated on next request.

---

### D7 — L5: Ramer-Douglas-Peucker as default, swappable

**Decision**: L5 uses Ramer-Douglas-Peucker (RDP) as the default simplification algorithm. The algorithm is passed as a strategy parameter so alternatives (Visvalingam-Whyatt, curvature-proportional sampling) can be swapped for harness experiments.

**Rationale**: RDP is well-understood, produces clean results on both geometric (Phosphor) and organic (Phylopic) contours, and its epsilon parameter gives a direct control over point density. The target is 15–40 points per skeleton.

**L5 sub-step caching**: The pipeline caches intermediate results by `(svgPath, algorithm, epsilon)` key:
- Step 1: SVG parse + path normalisation to 0–1 space (cached by svgPath hash)
- Step 2: Curvature-weighted sample → dense point cloud (cached by svgPath hash)
- Step 3: Simplification → 15–40 points (cached by svgPath + algorithm + epsilon)
- Step 4: Edge derivation from path continuity (derived from step 3 output)

This allows L5 re-runs to skip the expensive parse/sample steps when only the simplification algorithm or epsilon changes.

---

### D8 — Two-phase rollout

**Decision**: Phase 1 is local-only. The index lives on disk, the pipeline runs via the existing local Docker Compose stack, and the test harness validates quality before any production change. Phase 2 (S3 index, Lambda cold-start download, cache migration) is deferred until Phase 1 results are satisfactory.

**Rationale**: The current production system works (returns skeletons, even if low quality). Phase 1 lets us validate the new pipeline against the test harness without any production risk.

## Risks / Trade-offs

- **Phylopic SVG complexity** → silhouettes are dense Bezier paths; L5 parse + sample may be slow for complex entries. Mitigation: cache parse results; if >200ms, precompute dense point clouds during index build.
- **OpenRouter embeddings availability** → if the `/embeddings` endpoint is unavailable, L1 fails silently and falls through to L3. Mitigation: L3 still produces usable results; log L1 failure for monitoring.
- **Per-source threshold calibration** → initial thresholds are guesses; wrong values cause over-rejection (too many L3 fallbacks) or over-acceptance (wrong icons). Mitigation: harness category A/B words give ground truth for threshold sweep.
- **Index staleness** → Phosphor and Phylopic release new content; the index is a point-in-time snapshot. Mitigation: the build script is re-runnable; add a version field to the index metadata.
- **Old cache entries** → entries without `match` field will be regenerated on next request. Mitigation: this is acceptable; old skeletons were low quality anyway.

## Migration Plan

**Phase 1 (local validation)**
1. Implement index build script, run locally, verify ~22k entries
2. Implement L0–L5 pipeline, wire into `local.ts` alongside existing pipeline
3. Update test harness word list to A–E categories
4. Run harness against new pipeline; tune thresholds; compare to best existing run
5. Accept Phase 1 when category A words consistently produce recognisable skeletons

**Phase 2 (production, deferred)**
1. Upload SQLite index to S3
2. Add cold-start download logic to Lambda (`/tmp` cache with ETag check)
3. Deploy; clear DynamoDB cache for affected words
4. Smoke test with production word set
5. Rollback plan: revert Lambda to previous deployment (old `core.ts` still in git)

## Calibrated Constants

Thresholds were calibrated empirically against the `fixtures-retrieval-r2` fixture set (29 words, Phosphor-only search scope).

```
THRESHOLD_PHOSPHOR = 0.87
THRESHOLD_PHYLOPIC = 0.55  (unchanged; Phylopic not yet searched)
```

### Calibration findings

The initial default of `THRESHOLD_PHOSPHOR=0.60` was too permissive: all category C and D words resolved at L1 instead of L3/L4 as intended.

At **0.87**, the threshold cleanly separates correct L1 hits from words that should fall through:

| Similarity range | Behaviour |
|---|---|
| ≥ 0.87 | Accepts as L1 hit — all confirmed-correct Phosphor matches land here |
| 0.74 – 0.86 | Rejects at L1 — includes all C+D words and category A words that lack a Phosphor icon |

**Category A words with correct Phosphor icons all pass L1** (guitar 0.977, butterfly 0.961, crown 0.949, bicycle 0.927, telescope→binoculars 0.904).

**Category A words without a Phosphor icon** (wolf, eagle, mushroom, shark, sloth) were matching wrong icons at L1 (rabbit, feather, shrimp, couch) with similarities 0.75–0.82 — below the new threshold. They correctly fall through to L3, which produces better semantic candidates. Full coverage for these words requires enabling Phylopic search (Phase 2).

**Category C and D words all fail L1** (highest observed: melancholy→mask-sad 0.858, eternity→infinity 0.814) and proceed to L3/L4 as designed.

Both constants are overridable via environment variable for future sweep experiments:
```
THRESHOLD_PHOSPHOR=0.90 npx tsx run.ts  # stricter sweep
```
