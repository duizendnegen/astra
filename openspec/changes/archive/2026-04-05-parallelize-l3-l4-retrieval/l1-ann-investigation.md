# L1 ANN Query — Investigation Notes

Attempted to replace the full-table-scan L1 query with a `vec0` KNN (`MATCH`) query.
Reverted after three rounds of fixes still produced incorrect results. This document
records what went wrong so future attempts start with the right picture.

## What was tried

1. `WHERE v.embedding MATCH ? AND k = 20` joined directly to `entries` — **SQL error**: "A LIMIT or 'k = ?' constraint is required on vec0 knn queries"
2. Added `AND k = 20` (inline with JOIN) — query ran but returned 0 phosphor rows out of 20.
3. Increased to `AND k = 200` — still 0 phosphor rows out of 200.
4. Moved KNN into a subquery, added `vec_f32(?)` wrapping — phosphor rows appeared, but "bird" (a direct phosphor label match) showed `topSim: 0.618`, far below the 0.80 threshold.

Reverted to the original `vec_distance_cosine` full-scan query after step 4.

## Problems identified

### P1: Raw bytes passed to MATCH produce garbage rankings
The `MATCH` operator expects the query vector in sqlite-vec's internal typed binary
format. The raw `Buffer` (flat float32 bytes) was passed without `vec_f32()` wrapping.
This caused the KNN to rank entries by meaningless distances; results were essentially
arbitrary rather than ordered by similarity. All 200 results happened to be phylopic.
**Fix needed:** `MATCH vec_f32(?)`.

### P2: Post-filtering breaks KNN correctness for the phosphor subset
The full-scan query filtered to `source = 'phosphor'` in SQL, guaranteeing the best
phosphor match was always returned. The KNN query searches the full mixed index (phosphor
~1512 + phylopic ~5000+). For semantic words, phylopic entries dominate the top-k because
there are far more of them and many have taxonomic names that embed close to common nouns.
Even with `k = 200`, the top 200 closest vectors are often all phylopic, meaning the best
phosphor result (e.g. `phosphor:bird`) is never seen.
**Root cause:** single shared vec0 index for two corpora with very different densities.

### P3: KNN distance metric differs from `vec_distance_cosine()`
After fixing P1 (adding `vec_f32()`), phosphor rows appeared but with wrong similarities.
"bird" scored 0.618 instead of the expected 0.85+. The similarity formula
`1 - dist² / 2` is correct for converting **L2 distance** (Euclidean) to cosine
similarity on unit-norm vectors. `vec_distance_cosine()` in sqlite-vec apparently returns
L2 distance (despite its name), which is why the formula worked for the old query.
The KNN `v.distance` column may return a different metric (cosine distance, i.e.
`1 − cos θ`), in which case the correct conversion is just `1 − dist`, not
`1 − dist² / 2`. Using the wrong formula inflates the computed distance and makes
everything appear less similar than it is.
**Fix needed:** verify what metric `v.distance` returns and use the right conversion.

### P4: ANN cold-start latency (~2–3 s) not the sub-50 ms expected
The design doc targeted < 50 ms for L1 after switching to KNN. In practice, the first
query after a Docker restart took 2–3 seconds. The vec0 ANN graph (HNSW) must be loaded
from disk into memory on first access. For 1536-dim embeddings over ~6 500 entries, that
is roughly 40 MB of index data. Subsequent queries were not measured so it is unknown
whether they would hit the expected speed.

## What a correct fix would need

1. Solve the corpus-mixing problem — either a **separate `phosphor_vectors` vec0 table**
   (requires schema migration and re-indexing), or a much larger k (≥ 1 500) which
   essentially defeats the purpose of ANN.
2. Verify the distance metric returned by `v.distance` in a KNN context and update the
   similarity conversion accordingly.
3. Accept that the first query after a cold start will be slow (~2 s) and either
   pre-warm the index on startup or document this behaviour.
4. Consider whether the full-scan approach (~1 940 ms per query) is actually acceptable
   given that L3/L4 now run in parallel — the overall miss-path latency is dominated by
   L3/L4 (5–30 s), so saving 1.9 s on L1 search has diminishing returns.
