## MODIFIED Requirements

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
