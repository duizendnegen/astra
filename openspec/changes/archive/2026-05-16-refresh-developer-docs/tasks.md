## 1. Delete stale files

- [x] 1.1 Delete `project-plan.md` from the repository root
- [x] 1.2 Delete `DEPLOYMENT.md` from the repository root

## 2. Rewrite README.md

- [x] 2.1 Write the intro section: evocative product paragraph + live link `https://astra.plusx.black`
- [x] 2.2 Write the "How it works" section: six numbered steps covering the current retrieval pipeline (L1 Pinecone → L3 LLM + L4 Gemini parallel → three-phase matcher → render → share link)
- [x] 2.3 Update Prerequisites section (verify Node.js version requirement is accurate for current stack — Node 22 used in CI/Docker)
- [x] 2.4 Update Local development section: verify `docker compose up` instructions are accurate against current `docker-compose.yml`, update `.env.local` guidance
- [x] 2.5 Rewrite Tests section: integrate test harness docs (run command, what the report contains, the `/test-constellations` skill) into the Tests section — no separate top-level section
- [x] 2.6 Keep Data scripts section as-is (no changes needed)
- [x] 2.7 Write inline Deployment section: first-time setup bullet checklist (CDK bootstrap, SSM secrets for OpenRouter + Pinecone, Pinecone index provisioning, GitHub Actions OIDC secrets/variables), then "After that, push to `main` deploys automatically"
- [x] 2.8 Remove any remaining reference to `DEPLOYMENT.md`, `?show_lines`, `?show_stars`, `render_mode`, `/api/skeleton`, or client-side matching

## 3. Verify

- [x] 3.1 Open the app locally (`docker compose up`) and verify it still loads — confirming README local dev instructions are accurate
- [x] 3.2 Search README.md for `show_lines`, `show_stars`, `skeleton`, `DEPLOYMENT` — confirm no stale references remain
- [x] 3.3 Search repo root for `DEPLOYMENT.md` and `project-plan.md` — confirm both are absent
