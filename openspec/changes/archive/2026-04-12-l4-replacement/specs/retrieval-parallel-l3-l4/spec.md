## MODIFIED Requirements

### Requirement: L4 model configurable via env var
The system SHALL use the image generation model specified by the `L4_IMAGE_MODEL` environment variable for L4 image generation. If `L4_IMAGE_MODEL` is not set, the system SHALL default to `google/gemini-2.5-flash-image`.

#### Scenario: Custom L4 image model used
- **WHEN** `L4_IMAGE_MODEL=google/gemini-2.0-flash-exp` is set in the environment
- **THEN** L4 image generation calls use that model via OpenRouter

#### Scenario: Default model used
- **WHEN** `L4_IMAGE_MODEL` is not set
- **THEN** L4 image generation uses `google/gemini-2.5-flash-image`
