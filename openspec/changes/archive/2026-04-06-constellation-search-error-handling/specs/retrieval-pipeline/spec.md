## REMOVED Requirements

### Requirement: Best-cosine fallback
**Reason**: Replaced by explicit error response. A below-threshold cosine result is unreliable by definition — the threshold wasn't met for a reason. With L4 running in parallel, any word with a visual representation should produce a shape from L4. Using a low-similarity cosine result produces misleading constellations; returning an error is more honest.
**Migration**: When L3 and L4 both miss, the pipeline returns `TRIANGLE_FALLBACK`. The caller (local server or Lambda handler) maps this to a 422 error response instead of using the best-cosine result.

## MODIFIED Requirements

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

#### Scenario: Invalid SVG returns TRIANGLE_FALLBACK
- **WHEN** L4 LLM returns an unparseable or empty SVG
- **THEN** the pipeline returns TRIANGLE_FALLBACK and the caller returns 422 to the client
