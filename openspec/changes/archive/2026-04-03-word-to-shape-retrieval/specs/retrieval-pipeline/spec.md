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
The system SHALL embed the normalised word via OpenRouter `text-embedding-3-small` and query the SQLite index for the nearest entry by cosine similarity. If the top result's similarity exceeds the per-source threshold (`THRESHOLD_PHOSPHOR` for Phosphor entries, `THRESHOLD_PHYLOPIC` for Phylopic entries), the match SHALL be accepted and L3/L4 SHALL be skipped.

#### Scenario: High-confidence match accepted
- **WHEN** the top result has similarity above the source threshold
- **THEN** the pipeline uses that entry's svg_path and does not call the LLM

#### Scenario: Low-confidence result falls through
- **WHEN** the top result has similarity below the source threshold
- **THEN** the pipeline proceeds to L3

#### Scenario: Per-source thresholds applied
- **WHEN** the top result is a Phosphor entry
- **THEN** it is compared against `THRESHOLD_PHOSPHOR`
- **WHEN** the top result is a Phylopic entry
- **THEN** it is compared against `THRESHOLD_PHYLOPIC`

### Requirement: L3 LLM concept mapping
If L1 does not produce a confident match, the system SHALL call the LLM with the prompt: "Give 5 synonyms and visual representations of '[word]'. Translate to English first if the word is not English. Return single nouns only as a JSON array." The system SHALL embed each candidate noun and query the index; the best match across all candidates that exceeds the per-source threshold SHALL be accepted.

#### Scenario: Synonym produces a match
- **WHEN** L1 fails but a synonym candidate matches above threshold
- **THEN** the pipeline uses the matched entry's svg_path

#### Scenario: Non-English word translated
- **WHEN** the input word is not English (e.g. "Faultier")
- **THEN** the LLM returns English candidates (e.g. "sloth") and the index is queried with those

#### Scenario: All candidates below threshold
- **WHEN** no L3 candidate exceeds the per-source threshold
- **THEN** the pipeline proceeds to L4

### Requirement: L4 LLM SVG generation
If L1 and L3 both fail, the system SHALL prompt the LLM to generate a simple stroke-only SVG for the word. The prompt SHALL include few-shot examples from Phosphor icons to set the abstraction level. The generated SVG SHALL be passed to L5.

#### Scenario: LLM SVG generated for abstract word
- **WHEN** neither L1 nor L3 produces a match (e.g. "eternity")
- **THEN** the LLM generates an SVG and L5 converts it to a skeleton

#### Scenario: Invalid SVG falls back to triangle
- **WHEN** L4 LLM returns an unparseable or empty SVG
- **THEN** the pipeline returns TRIANGLE_FALLBACK

### Requirement: Match provenance recorded
The system SHALL record which layer produced the match (`1`, `3`, or `4`), the matched entry id and source, the cosine similarity score, and the svg_path used. This provenance SHALL be stored in the DynamoDB cache entry and returned as part of the internal pipeline result for logging.

#### Scenario: Provenance available after L1 match
- **WHEN** L1 produces an accepted match
- **THEN** the cache entry contains `match.layer = 1`, `match.source`, `match.id`, `match.similarity`, and `match.svgPath`

#### Scenario: Provenance available after L3 match
- **WHEN** L3 produces an accepted match
- **THEN** the cache entry contains `match.layer = 3` and the corresponding fields
