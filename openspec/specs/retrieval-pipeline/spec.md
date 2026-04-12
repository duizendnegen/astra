## Purpose

Defines the word → skeleton retrieval pipeline (L0–L5).
## Requirements
### Requirement: L0 normalisation
Before querying the index the system SHALL normalise the input word: convert to lowercase, strip punctuation, and lemmatise using `compromise.js` ("running" → "run", "towers" → "tower"). The normalised form is used for all subsequent layers.

#### Scenario: Lemmatisation applied
- **WHEN** the input word is "running"
- **THEN** the normalised form used for embedding is "run"

#### Scenario: Punctuation stripped
- **WHEN** the input word contains punctuation (e.g. "cat!")
- **THEN** the normalised form has punctuation removed ("cat")

### Requirement: L1 direct embedding match
The system SHALL embed the normalised word via OpenRouter `text-embedding-3-small` and query the SQLite `vec0` index for the nearest entries by cosine distance. The sources queried by L1 SHALL be controlled by the `L1_SOURCES` environment variable (comma-separated list; default: `phosphor,custom`). The system SHALL apply a per-source similarity threshold: `phosphor` uses `THRESHOLD_PHOSPHOR` (default 0.80), `custom` uses `THRESHOLD_CUSTOM` (default 0.85). If the top result across all configured sources exceeds its source threshold, the match SHALL be accepted and L3/L4 SHALL be skipped.

#### Scenario: High-confidence phosphor match accepted
- **WHEN** the top result is a `phosphor` entry with similarity above `THRESHOLD_PHOSPHOR`
- **THEN** the pipeline uses that entry's svg_path and does not call the LLM

#### Scenario: High-confidence custom match accepted
- **WHEN** the top result is a `custom` entry with similarity above `THRESHOLD_CUSTOM`
- **THEN** the pipeline uses that entry's svg_path and does not call the LLM

#### Scenario: Low-confidence result falls through
- **WHEN** all results are below their respective source thresholds
- **THEN** the pipeline proceeds to L3 and L4 in parallel

#### Scenario: L1_SOURCES restricts to phosphor only
- **WHEN** `L1_SOURCES=phosphor` is set
- **THEN** `custom` entries are not queried and the behaviour is identical to the pre-change pipeline

#### Scenario: L1_SOURCES restricts to custom only
- **WHEN** `L1_SOURCES=custom` is set
- **THEN** only `custom` entries are searched in L1

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
If L1 fails, the system SHALL run L4 in parallel with L3. L4 SHALL call a Gemini image generation model to produce a PNG of the word as a simple line drawing, trace the PNG to SVG using Potrace, and pass the resulting SVG to L5 (svg-to-skeleton).

The image generation prompt SHALL be:
```
Simple black line drawing of "<word>" as an icon on white background. Single element, minimum amount of strokes. Clean outlines only, no fill, no shading, no text.
```

The L4 image model SHALL be configurable via the `L4_IMAGE_MODEL` environment variable (default: `google/gemini-2.5-flash-image`).

#### Scenario: Image-traced SVG generated for abstract word
- **WHEN** neither L1 nor L3 produces a match (e.g. "banana")
- **THEN** L4 generates a PNG via image gen, traces it to SVG with Potrace, and L5 converts it to a skeleton

#### Scenario: Invalid or empty trace returns no result
- **WHEN** L4 image generation fails or Potrace produces no paths
- **THEN** the pipeline returns `{ match: null, skeletons: [] }` and the caller returns HTTP 422

### Requirement: Match provenance recorded
The system SHALL record which layer produced the match (`1`, `3`, or `4`), the matched entry id and source (`phosphor`, `custom`, or `generated`), the cosine similarity score, and the svg_path used. This provenance SHALL be stored in the DynamoDB cache entry and returned as part of the internal pipeline result for logging.

#### Scenario: Provenance available after L1 match
- **WHEN** L1 produces an accepted match
- **THEN** the cache entry contains `match.layer = 1`, `match.source`, `match.id`, `match.similarity`, and `match.svgPath`

#### Scenario: Provenance available after L3 match
- **WHEN** L3 produces an accepted match
- **THEN** the cache entry contains `match.layer = 3` and the corresponding fields

