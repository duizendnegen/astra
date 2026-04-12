## ADDED Requirements

### Requirement: L4 generates image then traces to SVG
If L1 and L3 both miss, the system SHALL call the Gemini image generation model via OpenRouter to produce a PNG of the word as a simple line drawing, trace the PNG to SVG using Potrace, and pass the resulting SVG to L5 (svg-to-skeleton). The image generation model SHALL be configurable via the `L4_IMAGE_MODEL` environment variable (default: `google/gemini-2.5-flash-image`).

The image generation prompt SHALL be:
```
Simple black line drawing of "<word>" as an icon on white background. Single element, minimum amount of strokes. Clean outlines only, no fill, no shading, no text.
```

#### Scenario: Image gen + trace produces valid skeleton
- **WHEN** neither L1 nor L3 produces a match for a word
- **THEN** L4 calls the image model, traces the PNG to SVG with Potrace, and L5 converts it to a skeleton

#### Scenario: Image generation fails
- **WHEN** the OpenRouter image gen call returns a non-200 status or no image
- **THEN** L4 returns null and the pipeline returns `{ match: null, skeletons: [] }`

#### Scenario: Potrace returns empty SVG
- **WHEN** Potrace produces no paths from the generated PNG
- **THEN** L4 returns null and the pipeline returns `{ match: null, skeletons: [] }`

### Requirement: PNG handled in memory
The generated PNG SHALL be processed as a Buffer in memory. No PNG file SHALL be written to disk during live L4 execution.

#### Scenario: No disk artefacts
- **WHEN** L4 runs in the Lambda environment
- **THEN** only the SVG string is produced; no temporary files are created

### Requirement: L4 match source is `generated`
A successful L4 result SHALL set `match.source = 'generated'` in the pipeline result and DynamoDB cache entry.

#### Scenario: Provenance after L4 image-traced match
- **WHEN** L4 produces a valid skeleton
- **THEN** the pipeline result has `match.layer = 4` and `match.source = 'generated'`
