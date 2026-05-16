## ADDED Requirements

### Requirement: README intro and live link
`README.md` SHALL open with an evocative product description paragraph followed immediately by the live link `https://astra.plusx.black`. The intro SHALL be written for a general audience — someone who has never heard of Astra — before presenting any technical content.

#### Scenario: Live link is prominent
- **WHEN** a visitor opens README.md
- **THEN** the live link appears within the first visible section, before any prerequisites or technical details

### Requirement: README "How it works" section
`README.md` SHALL include a "How it works" section with the following six numbered steps, accurately describing the current retrieval pipeline:
1. Word embedded and searched against ~1,500 Phosphor icon shapes in Pinecone
2. If no confident match, LLM maps word to related nouns and re-queries the index
3. In parallel, Gemini generates a black-and-white line drawing traced to a shape outline via Potrace
4. Matched shape fitted to HYG catalogue stars via three-phase algorithm (prescreen → greedy → Hungarian)
5. Constellation rendered on D3-projected star field
6. Result encoded into a share URL client-side — no backend needed to replay

The section SHALL NOT mention Phylopic, `/api/skeleton`, client-side matching, or URL-param feature flags.

#### Scenario: Retrieval pipeline accurately described
- **WHEN** a developer reads "How it works"
- **THEN** they understand that L1 (Pinecone), L3 (LLM), and L4 (Gemini) are the resolution paths, and that L3 and L4 run in parallel

### Requirement: README tests section integrates test harness
The Tests section of `README.md` SHALL document both the unit test commands (`cd lambda && npm test`, `cd frontend && npm test`) and the test harness (how to run it, what it produces). There SHALL NOT be a separate "Test harness" top-level section.

#### Scenario: Test harness documented under Tests
- **WHEN** a developer looks for how to run the test harness
- **THEN** the instructions appear within the Tests section of README.md

### Requirement: README deployment section (inline checklist)
`README.md` SHALL include a Deployment section with a brief first-time setup checklist (bullet points, no command blocks) and a statement that all subsequent deploys are automatic on push to `main`. `DEPLOYMENT.md` SHALL NOT exist.

#### Scenario: DEPLOYMENT.md is absent
- **WHEN** the repository root is listed
- **THEN** no file named `DEPLOYMENT.md` is present

#### Scenario: First-time setup visible in README
- **WHEN** a developer reads the Deployment section
- **THEN** they can identify the prerequisites (CDK bootstrap, SSM secrets, Pinecone index, GitHub OIDC config) without needing a separate file

### Requirement: project-plan.md removed
`project-plan.md` SHALL NOT exist in the repository root.

#### Scenario: project-plan.md is absent
- **WHEN** the repository root is listed
- **THEN** no file named `project-plan.md` is present

### Requirement: README omits stale sections
`README.md` SHALL NOT contain a Feature flags URL-param table (`?show_lines`, `?show_stars`), a standalone "Test harness" section, or a reference to `DEPLOYMENT.md`.

#### Scenario: No stale feature flag docs
- **WHEN** README.md is searched for `show_lines` or `show_stars`
- **THEN** no matches are found
