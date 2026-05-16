## Context

Three top-level docs describe an architecture that no longer exists. `README.md` documents `/api/skeleton`, client-side matching, and URL-param feature flags — all removed. `DEPLOYMENT.md` describes a 6-step first-time setup guide that omits OIDC authentication and references the wrong `--phosphor-only` flag. `project-plan.md` outlines a pre-Pinecone pipeline that has been entirely superseded by the retrieval layers. Developers landing in the repo today are given a misleading picture of how Astra works.

## Goals / Non-Goals

**Goals:**
- `README.md` accurately describes the current system end-to-end, with a general-audience intro and technically precise "How it works" section
- Deployment information is consolidated in `README.md` as a brief checklist; DEPLOYMENT.md is deleted
- `project-plan.md` is deleted
- Test harness documentation is integrated into the Tests section of `README.md`

**Non-Goals:**
- Writing a comprehensive architecture reference (the spec archive covers that)
- Documenting every env var or CDK output in README (that level of detail belonged in DEPLOYMENT.md and is not replicated)
- Any code changes

## Decisions

**Delete DEPLOYMENT.md rather than update it** — The full 6-step first-time setup essay adds length without proportional benefit. The CDK stack is self-documenting, GitHub Actions config is visible in the repo, and the key prerequisite facts fit in a bullet checklist. A single README is easier to keep accurate than two files with overlapping content.

**Delete project-plan.md rather than update it** — The plan documents an exploratory concept phase. Updating it to match current reality would produce a document that duplicates the spec archive while being less precise. No known link from README or elsewhere points to it.

**Integrate test harness into Tests section** — The test harness is part of the test workflow for contributors; a separate section or separate README would fragment naturally related content. The integration keeps README coherent without bloating it.

**Drop settings panel / feature flags section** — The three feature toggles (constellation image, match trail, star labels) are discoverable via the gear icon in the app. Documenting them in README adds maintenance burden for low developer value; they are already covered by the settings-panel and feature-flags specs.

**"How it works" accuracy corrections** — Phylopic is not implemented; the icon set is ~1,500 Phosphor icons only. L3 (LLM concept mapping) and L4 (Gemini image generation) run in parallel, not sequentially — the corrected copy gives each its own numbered step to make the parallel nature apparent.

## Risks / Trade-offs

[Risk] Inline deployment checklist omits commands that first-time deployers need → Mitigation: CDK, GitHub Actions, and scripts are self-documenting; the checklist points to the right tools without reproducing their CLI syntax.

[Risk] Deleting DEPLOYMENT.md loses the record of which AWS account/region was bootstrapped → Mitigation: That information is in the CDK stack outputs and git history; it does not belong in a living doc.

## Migration Plan

1. Rewrite `README.md` in place
2. Delete `DEPLOYMENT.md`
3. Delete `project-plan.md`

No rollback complexity — all changes are to markdown files tracked in git.
