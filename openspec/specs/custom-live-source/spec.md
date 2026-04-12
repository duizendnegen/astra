## ADDED Requirements

### Requirement: L4 results promoted to `custom-live` asynchronously
After L4 produces a valid SVG and skeleton, the system SHALL asynchronously write the SVG to a `custom_live` table in `icon-index.sqlite`. This write SHALL NOT block the response to the caller.

The `custom_live` table schema:
```sql
CREATE TABLE IF NOT EXISTS custom_live (
  word       TEXT PRIMARY KEY,
  svg        TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

The SVG SHALL be stored inline as a string (not as a file path). No embedding vector is stored at promotion time.

#### Scenario: Promotion does not block response
- **WHEN** L4 produces a valid result
- **THEN** the skeleton response is returned to the caller before the SQLite write completes

#### Scenario: Promotion write failure is non-fatal
- **WHEN** the async SQLite write to `custom_live` fails
- **THEN** a warning is logged and the error is swallowed; the caller result is unaffected

#### Scenario: Duplicate word not re-promoted
- **WHEN** L4 fires for a word already present in `custom_live`
- **THEN** the existing row is replaced (upsert by primary key)

### Requirement: `custom-live` not searched at L1
The `custom-live` source SHALL NOT be included in the L1 vector similarity search. The `L1_SOURCES` configuration SHALL remain unchanged by this change.

#### Scenario: L1 ignores custom-live
- **WHEN** L1 queries the icon index
- **THEN** only sources in `L1_SOURCES` (e.g. `phosphor`, `custom`) are searched; `custom-live` entries are excluded
