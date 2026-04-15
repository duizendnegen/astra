## MODIFIED Requirements

### Requirement: L3 LLM concept mapping
If L1 does not produce a confident match, the system SHALL call the LLM with the normalised word to obtain up to 5 single nouns that visually represent it (synonyms, categories, or iconic objects). The system SHALL embed each candidate noun and query the index; the best match across all candidates that exceeds `THRESHOLD_PHOSPHOR_L3` SHALL be accepted. The L3 call SHALL be made with an `AbortSignal` so it can be cancelled when L4 wins the parallel race.

During iteration, the system SHALL accumulate a `TrailEntry[]` array recording each candidate attempted:
- `candidate: string` — the synonym noun tried
- `hitId: string | null` — the Pinecone icon ID if this candidate exceeded the threshold, otherwise `null`
- `sim: number | null` — the similarity score if a hit occurred, otherwise `null`

The array SHALL be attached to the returned `MatchProvenance` as `trail: TrailEntry[]` when L3 wins the pipeline. Candidates that are skipped due to missing embedding vectors SHALL still be recorded with `hitId: null` and `sim: null`.

The L3 prompt SHALL be:
```
List 5 single nouns that visually represent "<word>" — synonyms, categories, or iconic objects.
Return ONLY a JSON array of strings, e.g. ["cat","tiger","paw","whisker","feline"]. No explanation.
```

The system SHALL NOT use `response_format: json_object`. It SHALL parse the JSON array directly from the response text.

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
