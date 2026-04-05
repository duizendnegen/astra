## ADDED Requirements

### Requirement: Pino root logger with environment-aware transport
A shared Pino root logger SHALL be created in `lambda/src/logger.ts`. In development
(`NODE_ENV !== 'production'`) it SHALL use `pino-pretty` for human-readable output.
In production it SHALL emit raw JSON. The file SHALL export a `createLogger(module: string)`
helper that returns a child logger with the `module` field pre-bound.

#### Scenario: Development output is human-readable
- **WHEN** the server runs with `NODE_ENV=development`
- **THEN** log output is formatted by pino-pretty (coloured, indented, human-readable)

#### Scenario: Production output is JSON
- **WHEN** the server runs with `NODE_ENV=production`
- **THEN** each log entry is a single-line JSON object

#### Scenario: Child logger includes module field
- **WHEN** `createLogger('retrieval')` is called and a log entry is emitted
- **THEN** the entry contains `"module": "retrieval"`

### Requirement: Per-operation durationMs on all significant operations
Every significant backend operation SHALL emit a structured log entry with a `durationMs` field
measured using `performance.now()` or `Date.now()`. Timed operations SHALL include at minimum:
- Total `/api/constellation` handler time per request
- Each retrieval pipeline layer (L1 embedding lookup, L3 LLM concept map, L4 LLM SVG, L5 SVG→skeleton)
- Matcher phases (prescreen, greedy, Hungarian) and per-skeleton total

#### Scenario: Request duration logged
- **WHEN** a `/api/constellation` request completes
- **THEN** a log entry at info level contains `durationMs` for the total handler time

#### Scenario: Retrieval layer durations logged
- **WHEN** each retrieval layer (L1, L3, L4, L5) completes
- **THEN** a log entry contains `layer` and `durationMs`

#### Scenario: No ad-hoc console.log in lambda/src
- **WHEN** any module in `lambda/src/` emits a log
- **THEN** it uses a Pino child logger — no bare `console.log` calls remain
