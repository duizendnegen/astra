## MODIFIED Requirements

### Requirement: match() accepts skeleton array
The `match()` function SHALL accept `skeletons: Skeleton[]`, a `catalogue: Star[]` parameter,
an optional `excludeSeeds?: Set<number>` parameter, and an optional `config?: MatcherConfig`.
When `config` is omitted, defaults from `BASE_DEFAULTS` are used.
The function SHALL evaluate all skeletons via the pairwise anchor search pipeline and return the
highest-scoring result, or null if no result is found. Anchor stars whose HYG ID is in
`excludeSeeds` SHALL be skipped in Phase 1.

#### Scenario: Multiple skeletons compared
- **WHEN** `match()` is called with 3 skeletons
- **THEN** all 3 are evaluated and the skeleton with the highest edge-length ratio score wins

#### Scenario: Config constants overridable
- **WHEN** `match()` is called with `{ seedMaxMag: 4 }`
- **THEN** stars with magnitude ≤ 4 are used as primary anchors in Phase 1

#### Scenario: excludeSeeds skips anchors
- **WHEN** `match()` is called with `excludeSeeds` containing HYG ID 27989 (Betelgeuse)
- **THEN** Betelgeuse is not used as a primary or secondary anchor in Phase 1

## REMOVED Requirements

### Requirement: Client-side catalogue loading
**Reason**: The star catalogue is now loaded server-side. The frontend no longer needs `stars.json`.
**Migration**: Remove `loadCatalogue()` and `getCatalogue()` calls from `frontend/src/main.ts`.
The `loadConstellationLines()` function in `frontend/src/catalogue.ts` is unaffected and remains.

### Requirement: Client-side match() call
**Reason**: Matching now runs in the backend as part of `/api/constellation`. The frontend
receives a ready-to-render `constellation` result directly.
**Migration**: Remove the `import { match } from './matcher'` import and the `match()` call
from `frontend/src/main.ts`. Delete `frontend/src/matcher.ts`.
