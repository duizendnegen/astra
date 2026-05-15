## MODIFIED Requirements

### Requirement: L3 LLM concept mapping
If L1 does not produce a confident match, the system SHALL call the LLM with the normalised word to obtain up to 5 single nouns that visually represent it (synonyms, categories, or iconic objects). The system SHALL embed all candidates in a single batch call, then query Pinecone for all candidate vectors concurrently using `Promise.all`. For all candidates that exceed `THRESHOLD_PHOSPHOR_L3`, the system SHALL fetch their SVGs from S3 concurrently using `Promise.all`. The system SHALL attempt `svgToSkeletonWithOpts` on each SVG in candidate-index order and accept the first valid skeleton. The L3 call SHALL be made with an `AbortSignal` so it can be cancelled when L4 wins the parallel race.

During iteration, the system SHALL accumulate a `TrailEntry[]` array recording each candidate attempted:
- `candidate: string` — the synonym noun tried
- `hitId: string | null` — the Pinecone icon ID if this candidate exceeded the threshold, otherwise `null`
- `sim: number | null` — the similarity score if a hit occurred, otherwise `null`

Trail entries SHALL be written after all concurrent operations complete: misses recorded for all non-winning candidates, one hit recorded for the winning candidate (the one whose skeleton was accepted). The array SHALL be attached to the returned `MatchProvenance` as `trail: TrailEntry[]` when L3 wins the pipeline. Candidates that are skipped due to missing embedding vectors SHALL still be recorded with `hitId: null` and `sim: null`.

The L3 prompt SHALL be:
```
List 5 single nouns that visually represent "<word>" — synonyms, categories, or iconic objects.
Return ONLY a JSON array of strings, e.g. ["cat","tiger","paw","whisker","feline"]. No explanation.
```

The system SHALL NOT use `response_format: json_object`. It SHALL parse the JSON array directly from the response text.

#### Scenario: Parallel Pinecone queries all resolve before skeleton selection
- **WHEN** the LLM returns 5 candidates and the system runs L3
- **THEN** all 5 Pinecone queries are issued concurrently and the system waits for all to resolve before selecting the first hit above threshold

#### Scenario: Multiple hits resolved in candidate-index order
- **WHEN** candidates 2 and 4 both exceed `THRESHOLD_PHOSPHOR_L3`
- **THEN** the system fetches both SVGs concurrently and returns the skeleton for candidate 2 (lower index wins)

#### Scenario: Synonym produces a match with trail
- **WHEN** the LLM returns `["hawk", "feather", "beak"]` and "feather" exceeds the threshold at similarity 0.83
- **THEN** the returned `MatchProvenance` has `layer: 3`, `id` matching the feather icon, and `trail: [{candidate:"hawk", hitId:null, sim:null}, {candidate:"feather", hitId:"phosphor:feather", sim:0.83}]`

#### Scenario: All candidates miss
- **WHEN** none of the LLM-generated candidates exceed `THRESHOLD_PHOSPHOR_L3`
- **THEN** L3 returns null and the pipeline proceeds to L4; no trail is attached

#### Scenario: Empty candidate list skips L3
- **WHEN** the LLM returns an empty array or unparseable JSON
- **THEN** L3 is skipped without querying the index

#### Scenario: Abort signal cancels L3
- **WHEN** L4 wins the race and the abort signal fires
- **THEN** the L3 task stops at its next async boundary without returning a result
