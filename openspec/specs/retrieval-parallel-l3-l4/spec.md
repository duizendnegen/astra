## ADDED Requirements

### Requirement: L3 and L4 run in parallel after L1 miss
After an L1 miss, the system SHALL start L3 (LLM concept mapping) and L4 (LLM SVG generation) concurrently. The first layer to produce a valid skeleton result SHALL be used; the other SHALL be cancelled.

#### Scenario: L3 wins within 5s window
- **WHEN** L3 returns a non-empty candidate list that yields a valid skeleton before 5 seconds have elapsed
- **THEN** L4 is cancelled and the L3 result is returned

#### Scenario: L4 wins after 5s
- **WHEN** L4 returns a valid SVG and skeleton, and 5 seconds have already elapsed
- **THEN** L3 is aborted immediately and the L4 result is returned

#### Scenario: L4 returns before 5s, L3 still running
- **WHEN** L4 returns a valid result before 5 seconds have elapsed and L3 has not yet completed
- **THEN** L3 continues running; L3 is only cancelled once 5 seconds have elapsed

#### Scenario: Both slow — L4 arrives after 5s
- **WHEN** neither L3 nor L4 has returned at the 5-second mark, and L4 subsequently returns
- **THEN** L3 is aborted when L4 returns (since 5s has already elapsed) and the L4 result is used

### Requirement: L3 cancellation requires both conditions
The system SHALL cancel L3 only when BOTH of the following are true: (a) at least 5 seconds have elapsed since the parallel race began, AND (b) L4 has returned a valid result. Neither condition alone is sufficient to cancel L3.

#### Scenario: Timer fires but L4 not yet done
- **WHEN** 5 seconds elapse and L4 has not yet returned
- **THEN** L3 continues running and is not cancelled

#### Scenario: L4 done but timer not yet fired
- **WHEN** L4 returns a result before 5 seconds have elapsed
- **THEN** L3 is not cancelled; it continues until it resolves or the timer fires

### Requirement: L4 model configurable via env var
The system SHALL use the image generation model specified by the `L4_IMAGE_MODEL` environment variable for L4 image generation. If `L4_IMAGE_MODEL` is not set, the system SHALL default to `google/gemini-2.5-flash-image`.

#### Scenario: Custom L4 image model used
- **WHEN** `L4_IMAGE_MODEL=google/gemini-2.0-flash-exp` is set in the environment
- **THEN** L4 image generation calls use that model via OpenRouter

#### Scenario: Default model used
- **WHEN** `L4_IMAGE_MODEL` is not set
- **THEN** L4 image generation uses `google/gemini-2.5-flash-image`
