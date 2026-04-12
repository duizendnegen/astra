## MODIFIED Requirements

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

## MODIFIED Requirements

### Requirement: Match provenance recorded
The system SHALL record which layer produced the match (`1`, `3`, or `4`), the matched entry id and source (`phosphor`, `custom`, or `generated`), the cosine similarity score, and the svg_path used. This provenance SHALL be stored in the DynamoDB cache entry and returned as part of the internal pipeline result for logging.

#### Scenario: Provenance available after L1 match
- **WHEN** L1 produces an accepted match
- **THEN** the cache entry contains `match.layer = 1`, `match.source`, `match.id`, `match.similarity`, and `match.svgPath`

#### Scenario: Provenance available after L3 match
- **WHEN** L3 produces an accepted match
- **THEN** the cache entry contains `match.layer = 3` and the corresponding fields
