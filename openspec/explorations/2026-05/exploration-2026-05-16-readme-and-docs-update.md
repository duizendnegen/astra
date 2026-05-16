# Exploration: readme-and-docs-update

**Date:** 2026-05-16
**Linked change:** none

## Context

README.md, DEPLOYMENT.md, and project-plan.md were written during Iteration 1 and are all significantly stale. The codebase has grown substantially — a full icon-retrieval pipeline (Pinecone + SVG tracing), backend matching, observability, CI previews, and several architectural shifts have landed since those docs were written. The goal is to understand the full current state of the system, then write a great intro and accurate developer guidance for each doc.

---

## Observations

### What the current system actually does

```
User types a word
       │
       ▼
POST /api/constellation  (Lambda on arm64 Node 22)
       │
       ├─ DynamoDB cache hit (matchResult stored) → return immediately
       │
       ├─ DynamoDB cache hit (skeletons only) → run matcher → cache → return
       │
       └─ Cache miss → Retrieval pipeline (L0→L5) → Matcher → cache → return
              │
              ├─ L1: Pinecone vector search (embedding of word)
              │       THRESHOLD_PHOSPHOR ≥ 0.60 → direct SVG hit
              │
              ├─ L3+L4: parallel race
              │   ├─ L3: LLM → 5 candidate nouns → Pinecone batch queries
              │   │       (first to produce valid skeleton wins)
              │   └─ L4: Gemini image gen → Potrace → SVG trace
              │           (wins if ≥5s elapsed AND L4 has valid result)
              │
              └─ L5: SVG → skeleton (RDP simplification, 15–40 points)
                       ↓
                   Three-phase matcher (anchor-pair generator)
                     Phase 1: cell-coverage prescreen → top 500
                     Phase 2: greedy edge-length → top 50
                     Phase 3: Hungarian (Jonker-Volgenant) → top candidates
                     Diversity selection: prefer ≥30° from top candidate
                       ↓
                   MatchResult stored in DynamoDB
                       ↓
                   Response: { constellation, skeleton, match }
```

### Major divergences from README

| README says | Reality |
|---|---|
| "POST /api/skeleton" is the endpoint | Primary endpoint is now `POST /api/constellation` (returns full MatchResult) |
| Lambda returns JSON skeleton (keypoints + edges) | Lambda returns complete constellation: stars, edges, patch centre, scores, procrustes angle |
| Hungarian matching runs client-side | Matching runs **server-side** in Lambda; frontend only renders |
| Feature flags via `?show_lines=1` and `?show_stars=1` URL params | URL params removed; all feature flags live in **localStorage** via a settings panel (gear icon) |
| No mention of Pinecone or icon index | L1 Pinecone search is the primary resolution path (~instant for concrete words) |
| No mention of image generation | L4 uses Gemini to generate a PNG line drawing as a last resort |
| Docker Compose starts "Local Pinecone and MinIO services" | Still accurate — but `index-init` service auto-populates the local index on first run |
| Lambda architecture: DynamoDB stores skeleton | DynamoDB now stores full MatchResult including star assignments and procrustes angle |
| Tests: `cd lambda && npm test`, `cd frontend && npm test` | Still accurate |

### Major divergences from DEPLOYMENT.md

| DEPLOYMENT.md says | Reality |
|---|---|
| Step 4 uses `build-index.ts --phosphor-only` | Phosphor is still supported; Phylopic silhouettes also indexed (~10k entries) |
| No mention of OIDC authentication | Both workflows authenticate via GitHub OIDC; no AWS keys stored in Secrets |
| Step 6 just says "test with crown" | CI now auto-generates constellation previews on PRs (orphan branch + PR comment) |
| `PINECONE_HOST` is the only Pinecone env var | Local dev also needs `PINECONE_CONTROLLER_HOST` (control plane on port 5080, data on 5081) |
| Verify by entering "crown" | Actually: `curl POST /api/constellation` and check `match.layer === 1` |

### Major divergences from project-plan.md

The plan describes an early pre-Pinecone design. The entire "shape pipeline" (LLM → skeleton → match client-side) is now replaced with the retrieval pipeline. The project-plan.md is so stale it probably shouldn't be updated — it's an artefact of the original concept phase.

### Current repo structure

```
astra/
├── frontend/           Vite + TypeScript SPA — rendering only
│   └── src/
│       ├── renderer.ts  Star field + constellation rendering (D3)
│       ├── matcher.ts   (client-side matcher remains for test harness)
│       ├── share-link.ts
│       └── settings/    Feature flags (localStorage)
├── lambda/             Node 22 Lambda — retrieval pipeline + matching
│   └── src/
│       ├── retrieval.ts L1–L5 pipeline
│       ├── skeleton.ts  POST /api/constellation handler
│       ├── matcher.ts   Three-phase matcher
│       └── logger.ts    Pino (pretty dev / JSON prod)
├── infra/              AWS CDK stack (TypeScript)
├── scripts/            build-index.ts — Pinecone + S3 icon indexing
├── test-harness/       Standalone Node constellation test runner
│   ├── words.ts        5-category word list (A–E)
│   ├── run.ts          CLI runner → reports/{runId}/
│   └── render-patch.ts Server-side PNG thumbnails (node-canvas)
├── data/               HYG star catalogue (committed asset)
└── docker-compose.yml  pinecone-local, minio, index-init, api, frontend
```

### Endpoint summary (current)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/constellation` | POST | Main: retrieval + matching → full result |
| `/api/skeleton` | POST | Dev/test: retrieval only → skeletons array |
| `/health` | GET | Sync health check: `{ status: "ok" }` |

### Feature flags (current — localStorage, not URL params)

| Flag | localStorage key | Default |
|---|---|---|
| Constellation image | `showConstellationImage` in `astra-features` | false |
| Match trail | `showAssociation` in `astra-features` | false |
| Star labels | `showStarLabels` in `astra-features` | false |

Toggled via gear icon in landing view → settings panel.

### CI/CD (current)

- **PR CI**: tests (lambda + frontend) → `cdk diff` + **constellation-previews** job (generates 5 preview PNGs, posts PR comment with embedded images and metrics table)
- **Deploy**: tests → `build-index.ts` (incremental) → frontend build → `cdk deploy` (OIDC, arm64 QEMU step for Docker bundling)
- Node 22 throughout; arm64 Lambda (Graviton3)

### Observability

- ADOT Lambda layer (arm64) auto-instruments AWS SDK v3 (DynamoDB, S3, SSM)
- Manual OpenTelemetry spans wrap: OpenRouter calls (embed, l3-candidates, l4-image-gen), CPU ops (svg-to-skeleton, matcher phases)
- Pino structured logging: `durationMs` on all significant ops; `createLogger(module)` pattern
- X-Ray service name: `astra-skeleton`

### Production stack (AWS)

- CloudFront → S3 (OAC, private) for frontend
- CloudFront → API Gateway → Lambda for `/api/*`
- DynamoDB (on-demand): `word` PK, stores full MatchResult
- S3 bucket `astra-icons-{account}`: SVG path strings for Phosphor + Phylopic icons
- Pinecone Serverless index `astra-prod-icons` (1536-dim cosine, us-east-1)
- SSM SecureString: `/astra/openrouter-api-key`, `/astra/pinecone-api-key`
- Rate limiting: burst 10 req/s, steady 2 req/s (API Gateway)
- Input validation: word ≤ 100 chars (400 on violation)

---

## Rounds

## Round 1 — Scope and audience of the updated docs

### Q1.1 — Should project-plan.md be updated or retired?

The plan describes an obsolete architecture and is not linked from anywhere user-facing. Options:

- [ ] Delete it (or move to `openspec/archive/`) ← recommended: it's an internal artifact from the concept phase, is misleading, and has been superseded by the spec archive
- [ ] Update it to reflect current architecture — risky, will drift again; the spec archive is the authoritative design record
- [ ] Leave it as-is

> **Your answer / freetext:**
> Delete it.

### Q1.2 — Who is the primary audience for README.md?

This shapes how deep the technical explanations should go and whether we explain implementation details (retrieval layers, matching algorithm) or just the outcome.

- [ ] Developer wanting to contribute or run locally ← recommended: the project is not publicly marketed; anyone landing here is a dev
- [x] General audience / product overview first, then technical
- [ ] Just Pepijn — keep it minimal/personal

> **Your answer / freetext:**
>

### Q1.3 — How much retrieval pipeline detail belongs in README?

The retrieval pipeline (L1–L5 layers, Pinecone, Gemini) is a major architectural feature. Options:

- [x] High-level diagram + layer names, link to openspec specs for depth ← recommended: enough to understand the system without duplicating spec content
- [ ] Full layer-by-layer breakdown inline (L1: embedding search, L3: LLM concept map, L4: image gen, L5: trace)
- [ ] Mention it exists but don't detail it

> **Your answer / freetext:**
>

### Q1.4 — Feature flags section: URL params are gone, settings panel is the UI

The README currently documents `?show_lines=1` and `?show_stars=1` which are removed. Should we:

- [x] Replace with a "Settings panel" section describing the gear icon and three toggles ← recommended: accurate, useful for devs
- [ ] Remove the feature flags section entirely (they're debug-only, not needed in README)
- [ ] Keep URL params as undocumented/hidden features — but they've been removed from the code

> **Your answer / freetext:**
>

## Round 2 — README structure and framing

### Q2.1 — What should the general-audience intro say?

The current README opens with a one-liner then jumps straight into prerequisites. For a general audience first, the intro should hook someone who's never heard of Astra. Options:

- [x] One vivid product paragraph + live link, then a brief "How it works" section for the technically curious ← recommended: mirrors the existing structure but makes the prose more evocative, keeps technical depth in its own section
- [ ] Two paragraphs: product experience first, then a non-technical "magic" explanation with no code at all
- [ ] Keep the current one-liner but move the live link higher

> **Your answer / freetext:**
>

### Q2.2 — What sections should appear in README?

Given general-audience first, here's a proposed section list. Pick what to keep, cut, or rename:

- [x] Intro / product description ← keep
- [x] Live link prominently near the top ← keep
- [x] How it works (high-level, 3–5 bullet steps) ← keep but rewrite to cover the current pipeline
- [x] Prerequisites ← keep
- [x] Local development ← keep
- [x] Tests ← keep
- [ ] Test harness
- [x] Data scripts — these are rarely run and clutter the README for general audiences
- [ ] Settings panel (replaces Feature flags) ← keep, updated
- [x] Deployment (brief, to retire DEPLOYMENT.md)
- [ ] Feature flags table — replaced by settings panel section above

> **Your answer / freetext:**
>

### Q2.3 — "How it works" — rewrite for the current pipeline

The current "How it works" describes the old flow. A rewrite would say something like:

> 1. Your word is embedded and searched against a library of 17,000+ icon shapes (Phosphor + Phylopic) in Pinecone — most common words match instantly
> 2. If no confident match, an LLM maps the word to related nouns and tries those; as a last resort, Gemini generates a line drawing which is traced to a shape
> 3. The matched shape is fitted to real stars from the HYG catalogue using a three-phase matching algorithm
> 4. The constellation is rendered on a D3-projected star field, lines drawn between matched stars
> 5. The result is encoded into a share URL entirely client-side — no backend needed to replay it

Is this the right level of detail and framing for general audience?

- [ ] Yes, this captures the interesting parts without being overwhelming ← recommended
- [ ] Simplify further — general audience doesn't need to know about Pinecone or HYG
- [ ] Go deeper — include layer names (L1/L3/L4) so developers understand the architecture at a glance

> **Your answer / freetext:**
> Good level of abstraction but slightly incorrect. Phylopic is never implemented, so it's a 1500 icon shape set. The Gemini line drawing is not just a last resort, it's often the option that's active - so this should live on its own step.

### Q2.4 — Data scripts section: keep or drop?

The data scripts (`filter-hyg.mjs`, `build-constellation-lines.mjs`) regenerate pre-built assets from source data. They are very rarely run and aren't part of the normal dev workflow.

- [ ] Drop from README entirely — they're edge-case and clutter the page ← recommended: the scripts are self-documenting and pre-built assets are committed
- [ ] Keep but move to a collapsible `<details>` block or an appendix
- [x] Keep as-is

> **Your answer / freetext:**
>

## Round 3 — DEPLOYMENT.md retirement and "How it works" copy

### Q3.1 — What happens to DEPLOYMENT.md?

The user chose "Deployment (brief, to retire DEPLOYMENT.md)" in Q2.2. Options:

- [x] Delete DEPLOYMENT.md entirely — the inline README section replaces it ← recommended: eliminates drift, README is the single source
- [ ] Archive DEPLOYMENT.md (move to `openspec/archive/`) — keeps history
- [ ] Keep DEPLOYMENT.md but mark it "legacy" at the top

> **Your answer / freetext:**
>

### Q3.2 — What level of detail in the inline deployment section?

The current DEPLOYMENT.md has 6 detailed steps (CDK bootstrap, SSM secrets, CDK deploy, build-index, GitHub Actions config, verify). The inline README section should cover:

- [ ] Just one sentence: "All deploys run automatically via GitHub Actions on push to `main`. See DEPLOYMENT.md for first-time setup." (minimal, but DEPLOYMENT.md is being retired)
- [x] A brief summary: first-time setup checklist (bullet list, no command blocks), and "after that, push to main deploys automatically" ← recommended: enough for a developer to know what's required without duplicating the DEPLOYMENT.md essay
- [ ] Full step-by-step inline (replicate current DEPLOYMENT.md content in README)

> **Your answer / freetext:**
>

### Q3.3 — Corrected "How it works" — does this read right?

Based on Q2.3 feedback (Phylopic not implemented, ~1500 Phosphor icons, L4 is a common path not last resort):

> 1. Your word is embedded and searched against ~1,500 Phosphor icon shapes in Pinecone — most concrete words match instantly at this layer
> 2. If no confident match, an LLM maps the word to related nouns (synonyms, categories) and re-queries the icon index
> 3. In parallel, Gemini generates a black-and-white line drawing of the word, which is traced to a shape outline via Potrace
> 4. The matched shape is fitted to real stars from the HYG catalogue using a three-phase algorithm (prescreen → greedy → Hungarian)
> 5. The constellation is rendered on a D3-projected star field, lines drawn between matched stars
> 6. The result is encoded into a share URL entirely client-side — no backend needed to replay it

Does this read correctly and at the right level for the README?

- [x] Yes, ship it ← recommended
- [ ] Step 3 still makes L4 sound like a fallback — rephrase to make parallel race clearer
- [ ] Too technical — cut steps 2–3 to a single sentence

> **Your answer / freetext:**
>

### Q3.4 — Test harness: removed from README but where does it live?

Q2.2 dropped the test harness section. The harness docs are still useful for contributors. Options:

- [ ] Move the test harness docs into a `test-harness/README.md` ← recommended: co-located with the code, easy to find, keeps root README clean
- [ ] Drop entirely — it's self-documenting via the CLI
- [ ] Keep in root README after all

> **Your answer / freetext:**
> Integrate it into the testing section.

## Insights & Decisions

_Decision:_ Delete `project-plan.md` — _Reason:_ Describes an obsolete pre-Pinecone architecture; the spec archive is the authoritative design record and the file would mislead any new contributor.

_Decision:_ README targets general audience first, technical second — _Reason:_ Anyone landing in the repo is likely a developer, but the product intro should hook them before diving into architecture details.

_Decision:_ README intro = one vivid product paragraph + live link, followed by a "How it works" section — _Reason:_ Mirrors the existing structure but makes the prose evocative and separates product story from technical depth.

_Decision:_ "How it works" uses this 6-step corrected copy — _Reason:_ Phylopic is not implemented (only ~1,500 Phosphor icons), and L3 + L4 run as a parallel race (not a sequential fallback):
1. Your word is embedded and searched against ~1,500 Phosphor icon shapes in Pinecone — most concrete words match instantly at this layer
2. If no confident match, an LLM maps the word to related nouns (synonyms, categories) and re-queries the icon index
3. In parallel, Gemini generates a black-and-white line drawing of the word, which is traced to a shape outline via Potrace
4. The matched shape is fitted to real stars from the HYG catalogue using a three-phase algorithm (prescreen → greedy → Hungarian)
5. The constellation is rendered on a D3-projected star field, lines drawn between matched stars
6. The result is encoded into a share URL entirely client-side — no backend needed to replay it

_Decision:_ README sections: intro, how it works, prerequisites, local development, tests (with test harness integrated), data scripts, deployment (inline) — _Reason:_ Settings panel and feature flags sections dropped; test harness folded into tests; DEPLOYMENT.md retired.

_Decision:_ Delete `DEPLOYMENT.md` entirely — _Reason:_ Inline deployment section in README eliminates drift; two sources of truth is worse than one slightly longer README.

_Decision:_ Inline deployment section = brief first-time setup checklist (no command blocks) + "push to `main` deploys automatically" — _Reason:_ Enough for a developer to know what's required without duplicating the DEPLOYMENT.md essay; commands live in CDK/scripts which are self-documenting.

_Decision:_ Test harness docs integrated into the Tests section (not a separate section, not a separate `test-harness/README.md`) — _Reason:_ Keeps the root README unified and concise; harness is part of the testing workflow, not a standalone tool from the reader's perspective.
