## ADDED Requirements

### Requirement: Three skeleton variants generated per word
The system SHALL generate 3 skeleton variants for each word by requesting 3 iconic descriptions in a single LLM call, then running 3 parallel `DRAW` calls. The Lambda SHALL return all valid skeletons as `{ skeletons: Skeleton[] }`.

#### Scenario: Three valid variants returned
- **WHEN** all three DRAW calls return valid skeletons
- **THEN** the response contains `{ skeletons: [s1, s2, s3] }`

#### Scenario: Partial validity
- **WHEN** one or more DRAW calls return invalid skeletons
- **THEN** only valid skeletons are included; if at least one is valid, the response omits the invalid ones

#### Scenario: All variants fail
- **WHEN** all three DRAW calls return invalid skeletons
- **THEN** the response contains `{ skeletons: [TRIANGLE_FALLBACK] }`

### Requirement: Multi-description prompt favours iconic human-viewpoint silhouettes
The `DESCRIBE_MULTI_PROMPT` SHALL instruct the LLM to produce 3 distinct iconic descriptions of the word as a JSON array. The prompt SHALL explicitly require:
- The natural human viewing angle (not overhead, not floor plan, not cross-section)
- Each variant depicts a different valid interpretation or aspect of the word
- Silhouettes as an illustrator or emoji designer would draw them — simple, bold, instantly recognisable

#### Scenario: Word with multiple valid interpretations
- **WHEN** the word is "dog"
- **THEN** the descriptions include varied interpretations such as profile of full body, close-up of face, or sitting pose — not a top-down or anatomical view

#### Scenario: Concrete object word avoids technical view
- **WHEN** the word is "shower"
- **THEN** the descriptions depict the shower head with water spray, not a bathroom floor plan or overhead cross-section

### Requirement: Best-scoring variant returned to client
The frontend `match()` function SHALL run the full seed sweep against each skeleton in the array and return the `MatchResult` with the highest score. The winning variant index SHALL be logged.

#### Scenario: Best variant selected
- **WHEN** three skeletons are matched against the star catalogue
- **THEN** the result with the highest edge-coverage score is returned

#### Scenario: Variant index logged
- **WHEN** a match is returned
- **THEN** the console logs which variant index (0, 1, or 2) produced the best score
