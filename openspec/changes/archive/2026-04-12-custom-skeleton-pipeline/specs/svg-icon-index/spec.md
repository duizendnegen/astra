## ADDED Requirements

### Requirement: Custom source in index
The index SHALL support a `custom` source alongside `phosphor`. Custom entries SHALL have `source='custom'`, `id='custom:{word}'`, `label={word}`, `tags=''`, and `svg_path` containing the full SVG string. The `04-ingest.ts` script is the sole writer for custom entries.

#### Scenario: Custom entry queryable by L1
- **WHEN** a custom entry is ingested and L1 runs with `L1_SOURCES` including `custom`
- **THEN** the entry is returned as a candidate in the L1 search results

## REMOVED Requirements

### Requirement: Phylopic ingestion
**Reason**: Phylopic silhouettes produce poor skeletons with the current L5 extractor (filled paths vs stroke-based icons) and are already excluded from live L1 search. Removing them reduces index size and eliminates dead data.
**Migration**: The `04-ingest.ts` script deletes all `source='phylopic'` rows from `entries` and `vectors` on first run. The build-index script `--phylopic-only` flag remains available if Phylopic ingestion is needed again in future; re-run `build-index.ts` to restore.
