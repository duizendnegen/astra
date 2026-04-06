## ADDED Requirements

### Requirement: L0 normalisation
Before querying the index the system SHALL normalise the input word: convert to lowercase, strip punctuation, and lemmatise using `compromise.js` ("running" → "run", "towers" → "tower"). The normalised form is used for all subsequent layers.

#### Scenario: Lemmatisation applied
- **WHEN** the input word is "running"
- **THEN** the normalised form used for embedding is "run"

#### Scenario: Punctuation stripped
- **WHEN** the input word contains punctuation (e.g. "cat!")
- **THEN** the normalised form has punctuation removed ("cat")

### Requirement: L1 direct embedding match
The system SHALL embed the normalised word via OpenRouter `text-embedding-3-small` and query the SQLite `vec0` index using a KNN `MATCH` query for the nearest entries by cosine distance. The system SHALL post-filter results to `source = 'phosphor'` entries in application code. If the top Phosphor result's similarity exceeds `THRESHOLD_PHOSPHOR`, the match SHALL be accepted and L3/L4 SHALL be skipped.

#### Scenario: High-confidence match accepted
- **WHEN** the top Phosphor result has similarity above `THRESHOLD_PHOSPHOR`
- **THEN** the pipeline uses that entry's svg_path and does not call the LLM

#### Scenario: Low-confidence result falls through
- **WHEN** the top result has similarity below `THRESHOLD_PHOSPHOR`
- **THEN** the pipeline proceeds to L3 and L4 in parallel

#### Scenario: ANN query used
- **WHEN** the L1 index search runs
- **THEN** the query uses `WHERE embedding MATCH ?` with `ORDER BY distance LIMIT 20` (ANN path), not a full table scan

### Requirement: L3 LLM concept mapping
If L1 does not produce a confident match, the system SHALL call the LLM with the normalised word to obtain up to 5 single nouns that visually represent it (synonyms, categories, or iconic objects). The system SHALL embed each candidate noun and query the index; the best match across all candidates that exceeds `THRESHOLD_PHOSPHOR` SHALL be accepted. The L3 call SHALL be made with an `AbortSignal` so it can be cancelled when L4 wins the parallel race.

The L3 prompt SHALL be:
```
List 5 single nouns that visually represent "<word>" — synonyms, categories, or iconic objects.
Return ONLY a JSON array of strings, e.g. ["cat","tiger","paw","whisker","feline"]. No explanation.
```

The system SHALL NOT use `response_format: json_object`. It SHALL parse the JSON array directly from the response text.

#### Scenario: Synonym produces a match
- **WHEN** L1 fails but a synonym candidate matches above threshold
- **THEN** the pipeline uses the matched entry's svg_path

#### Scenario: Non-English word translated
- **WHEN** the input word is not English (e.g. "Faultier")
- **THEN** the LLM returns English candidates (e.g. "sloth") and the index is queried with those

#### Scenario: All candidates below threshold
- **WHEN** no L3 candidate exceeds the per-source threshold
- **THEN** L4 result is used (if available from the parallel race)

#### Scenario: L3 aborted mid-call
- **WHEN** the AbortSignal fires while the L3 LLM fetch is in progress
- **THEN** the fetch is cancelled and L3 returns an empty candidate list

### Requirement: L4 LLM SVG generation
If L1 fails, the system SHALL run L4 in parallel with L3. L4 SHALL prompt the LLM to generate a simple SVG silhouette for the word. The generated SVG SHALL be passed to L5 (svg-to-skeleton).

The L4 prompt SHALL be:
```
Draw a simple SVG silhouette of "<word>".
Rules: viewBox="0 0 256 256", no colours.
Return ONLY the complete <svg>...</svg> element. No explanation, no markdown.
```

The L4 model SHALL be configurable via the `L4_MODEL` environment variable (default: `google/gemini-2.5-flash`).

#### Scenario: LLM SVG generated for abstract word
- **WHEN** neither L1 nor L3 produces a match (e.g. "banana")
- **THEN** the LLM generates an SVG and L5 converts it to a skeleton

#### Scenario: Invalid SVG returns TRIANGLE_FALLBACK, caller returns 422
- **WHEN** L4 LLM returns an unparseable or empty SVG
- **THEN** the pipeline returns `{ match: null, skeletons: [] }` and the caller returns HTTP 422

### Requirement: Match provenance recorded
The system SHALL record which layer produced the match (`1`, `3`, or `4`), the matched entry id and source, the cosine similarity score, and the svg_path used. This provenance SHALL be stored in the DynamoDB cache entry and returned as part of the internal pipeline result for logging.

#### Scenario: Provenance available after L1 match
- **WHEN** L1 produces an accepted match
- **THEN** the cache entry contains `match.layer = 1`, `match.source`, `match.id`, `match.similarity`, and `match.svgPath`

#### Scenario: Provenance available after L3 match
- **WHEN** L3 produces an accepted match
- **THEN** the cache entry contains `match.layer = 3` and the corresponding fields
