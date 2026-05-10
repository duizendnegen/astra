/**
 * Upload constellation preview images to a dedicated branch and post (or update)
 * a PR comment containing the metadata table and embedded images.
 *
 * Required env vars (set by the CI workflow):
 *   GITHUB_REPOSITORY  e.g. "owner/repo"
 *   GITHUB_TOKEN       workflow token with contents:write and pull-requests:write
 *   GITHUB_SHA         the commit SHA for this run (used as directory name)
 *   PR_NUMBER          pull-request number; script exits silently if absent
 *   REPORTS_DIR        path to the test-harness reports directory (default: reports/ci-preview)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PREVIEW_WORDS = ['banana', 'anchor', 'love', 'bunny', 'tree'];
const BRANCH = 'ci-previews';
const COMMENT_MARKER = '<!-- constellation-previews-bot -->';

// ── Env ───────────────────────────────────────────────────────────────────────

const [OWNER, REPO] = (process.env.GITHUB_REPOSITORY ?? '/').split('/');
const TOKEN = process.env.GITHUB_TOKEN ?? '';
const SHA = process.env.GITHUB_SHA ?? 'unknown';
const PR_NUMBER = process.env.PR_NUMBER ? parseInt(process.env.PR_NUMBER, 10) : null;
const REPORTS_DIR = path.resolve(
  __dirname,
  process.env.REPORTS_DIR ?? 'reports/ci-preview',
);

if (!PR_NUMBER) {
  console.log('PR_NUMBER not set — skipping PR comment (not a pull-request context).');
  process.exit(0);
}

if (!TOKEN) {
  console.error('GITHUB_TOKEN is required.');
  process.exit(1);
}

// ── GitHub REST helpers ───────────────────────────────────────────────────────

async function ghFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = endpoint.startsWith('https://')
    ? endpoint
    : `https://api.github.com${endpoint}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
}

// ── Branch management ─────────────────────────────────────────────────────────

async function ensurePreviewBranch(): Promise<void> {
  const checkRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  if (checkRes.ok) return; // branch already exists

  // Get default branch HEAD to use as base
  const repoRes = await ghFetch(`/repos/${OWNER}/${REPO}`);
  const repoData = await repoRes.json() as { default_branch: string };
  const defaultBranch = repoData.default_branch;

  const refRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/ref/heads/${defaultBranch}`);
  const refData = await refRes.json() as { object: { sha: string } };
  const baseSha = refData.object.sha;

  const createRes = await ghFetch(`/repos/${OWNER}/${REPO}/git/refs`, {
    method: 'POST',
    body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: baseSha }),
  });
  if (!createRes.ok && createRes.status !== 422) {
    throw new Error(`Failed to create branch ${BRANCH}: ${createRes.status} ${await createRes.text()}`);
  }
}

// ── Image upload ──────────────────────────────────────────────────────────────

async function uploadImage(word: string): Promise<string> {
  const imagePath = path.join(REPORTS_DIR, `${word}.png`);
  if (!fs.existsSync(imagePath)) {
    console.warn(`  [skip] no image for "${word}" at ${imagePath}`);
    return '';
  }

  const content = fs.readFileSync(imagePath).toString('base64');
  const filePath = `previews/${SHA}/${word}.png`;

  // Check for existing file blob SHA (required for updates)
  let existingBlobSha: string | undefined;
  const checkRes = await ghFetch(
    `/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`,
  );
  if (checkRes.ok) {
    const existing = await checkRes.json() as { sha: string };
    existingBlobSha = existing.sha;
  }

  const body: Record<string, string> = {
    message: `ci: constellation preview ${word} [${SHA.slice(0, 7)}]`,
    content,
    branch: BRANCH,
  };
  if (existingBlobSha) body.sha = existingBlobSha;

  const uploadRes = await ghFetch(`/repos/${OWNER}/${REPO}/contents/${filePath}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!uploadRes.ok) {
    throw new Error(`Upload failed for ${word}: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  console.log(`  uploaded ${word}.png`);
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${filePath}`;
}

// ── Comment body ──────────────────────────────────────────────────────────────

interface DiagnosticEntry {
  word: string;
  phase1Candidates: number;
  phase2Candidates: number;
  phase3Candidates: number;
  selectedScore?: number;
  topScore?: number;
  acceptableCount?: number;
  distantCount?: number;
}

function fmt(n: number | undefined, decimals = 3): string {
  return n !== undefined ? n.toFixed(decimals) : '—';
}

function fmtDelta(n: number | undefined): string {
  if (n === undefined) return '—';
  return n === 0 ? '0' : `+${n.toFixed(3)}`;
}

function buildComment(
  diagnostics: DiagnosticEntry[],
  imageUrls: Record<string, string>,
): string {
  const diagByWord = Object.fromEntries(diagnostics.map((d) => [d.word, d]));

  const tableHeader = [
    '| Word | P1 | P2 | P3 | Score | Δ top | Acceptable | Distant |',
    '|------|---:|---:|---:|------:|------:|-----------:|--------:|',
  ].join('\n');

  const tableRows = PREVIEW_WORDS
    .map((word) => {
      const d = diagByWord[word];
      if (!d) return `| ${word} | — | — | — | — | — | — | — |`;
      const deltaTop = d.topScore !== undefined && d.selectedScore !== undefined
        ? d.topScore - d.selectedScore : undefined;
      return `| ${word} | ${d.phase1Candidates} | ${d.phase2Candidates} | ${d.phase3Candidates} | ${fmt(d.selectedScore)} | ${fmtDelta(deltaTop)} | ${d.acceptableCount ?? '—'} | ${d.distantCount ?? '—'} |`;
    })
    .join('\n');

  const imageSections = PREVIEW_WORDS
    .map((word) => {
      const url = imageUrls[word];
      const img = url ? `![${word}](${url})` : '_image unavailable_';
      return `### ${word}\n${img}`;
    })
    .join('\n\n');

  return `${COMMENT_MARKER}
## Constellation Previews

**Commit:** \`${SHA.slice(0, 7)}\` · **P1/P2/P3** = placement candidates per phase · **Δ top** = quality sacrificed by diversity selection · **Acceptable** = candidates within 10% of top score · **Distant** = acceptable candidates ≥30° from top (different sky regions)

${tableHeader}
${tableRows}

---

${imageSections}
`;
}

// ── PR comment (create or update) ─────────────────────────────────────────────

async function upsertPrComment(body: string): Promise<void> {
  // Find existing preview comment
  let page = 1;
  let existingCommentId: number | undefined;
  outer: while (true) {
    const res = await ghFetch(
      `/repos/${OWNER}/${REPO}/issues/${PR_NUMBER}/comments?per_page=100&page=${page}`,
    );
    if (!res.ok) break;
    const comments = await res.json() as Array<{ id: number; body: string }>;
    if (comments.length === 0) break;
    for (const c of comments) {
      if (c.body?.includes(COMMENT_MARKER)) {
        existingCommentId = c.id;
        break outer;
      }
    }
    page++;
  }

  if (existingCommentId) {
    const res = await ghFetch(
      `/repos/${OWNER}/${REPO}/issues/comments/${existingCommentId}`,
      { method: 'PATCH', body: JSON.stringify({ body }) },
    );
    if (!res.ok) throw new Error(`Failed to update comment: ${res.status}`);
    console.log(`Updated existing PR comment ${existingCommentId}`);
  } else {
    const res = await ghFetch(
      `/repos/${OWNER}/${REPO}/issues/${PR_NUMBER}/comments`,
      { method: 'POST', body: JSON.stringify({ body }) },
    );
    if (!res.ok) throw new Error(`Failed to create comment: ${res.status}`);
    console.log(`Posted new PR comment on PR #${PR_NUMBER}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\nPosting constellation previews for PR #${PR_NUMBER} (${SHA.slice(0, 7)})\n`);

  // Load diagnostics
  const diagPath = path.join(REPORTS_DIR, 'diagnostics.json');
  const diagnostics: DiagnosticEntry[] = fs.existsSync(diagPath)
    ? (JSON.parse(fs.readFileSync(diagPath, 'utf-8')) as DiagnosticEntry[])
    : [];

  // Ensure branch exists before uploading
  console.log(`Ensuring branch "${BRANCH}" exists...`);
  await ensurePreviewBranch();

  // Upload images
  console.log('Uploading images...');
  const imageUrls: Record<string, string> = {};
  for (const word of PREVIEW_WORDS) {
    imageUrls[word] = await uploadImage(word);
  }

  // Post or update PR comment
  const body = buildComment(diagnostics, imageUrls);
  await upsertPrComment(body);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
