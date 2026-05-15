import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Constants ─────────────────────────────────────────────────────────────

const PREVIEW_WORDS = ['banana', 'anchor', 'love', 'bunny', 'tree'];
const COMMENT_MARKER = '<!-- constellation-previews-bot -->';

// ── Types ─────────────────────────────────────────────────────────────────

interface WordResult {
  word: string;
  matched: boolean;
  score: number;
  pipelineLayer: number | string | null;
}

interface WordDiagnostic {
  word: string;
  phase1Candidates: number;
  phase2Candidates: number;
  phase3Candidates: number;
  selectedScore?: number;
  topScore?: number;
  nextBestScore?: number;
  acceptableCount?: number;
  distantCount?: number;
}

interface RunResults {
  runId: string;
  results: WordResult[];
}

// ── Args ──────────────────────────────────────────────────────────────────

function parseArgs(): { runId: string | null; prNumber: string | null } {
  const args = process.argv.slice(2);
  let runId: string | null = null;
  let prNumber: string | null = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id' && args[i + 1]) runId = args[++i];
    if (args[i] === '--pr-number' && args[i + 1]) prNumber = args[++i];
  }
  return { runId, prNumber };
}

// ── Git / shell helpers ───────────────────────────────────────────────────

function exec(cmd: string, opts: { cwd?: string; input?: string } = {}): string {
  return execSync(cmd, {
    encoding: 'utf-8',
    cwd: opts.cwd,
    ...(opts.input !== undefined ? { input: opts.input, stdio: ['pipe', 'pipe', 'pipe'] } : { stdio: ['inherit', 'pipe', 'pipe'] }),
  }).trim();
}

function tryExec(cmd: string, opts: { cwd?: string } = {}): string | null {
  try { return exec(cmd, opts); } catch { return null; }
}

function getHeadSha(): string {
  return exec('git rev-parse HEAD');
}

function getRepoSlug(): string {
  const remote = exec('git remote get-url origin');
  const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
  if (!m) throw new Error(`Cannot parse GitHub repo slug from remote: ${remote}`);
  return m[1];
}

// ── Push PNGs to ci-previews branch ──────────────────────────────────────

function pushImagesToCiPreviewsBranch(runDir: string, headSha: string, words: string[]): void {
  const worktreePath = path.join(os.tmpdir(), 'ci-previews-wt');

  // Remove any leftover worktree from a previous run
  tryExec(`git worktree remove --force "${worktreePath}"`);
  if (fs.existsSync(worktreePath)) fs.rmSync(worktreePath, { recursive: true, force: true });

  // Determine whether the branch already exists on origin
  const remoteRef = tryExec('git ls-remote --heads origin ci-previews') ?? '';
  const branchExists = remoteRef.includes('ci-previews');

  if (branchExists) {
    tryExec('git fetch origin ci-previews:ci-previews');
    const localExists = tryExec('git show-ref --verify refs/heads/ci-previews') !== null;
    if (localExists) {
      exec(`git worktree add "${worktreePath}" ci-previews`);
    } else {
      exec(`git worktree add -b ci-previews "${worktreePath}" origin/ci-previews`);
    }
  } else {
    // Branch doesn't exist — create as orphan
    exec(`git worktree add --orphan "${worktreePath}" ci-previews`);
    tryExec('git rm -rf .', { cwd: worktreePath });
  }

  try {
    const targetDir = path.join(worktreePath, headSha);
    fs.mkdirSync(targetDir, { recursive: true });

    for (const word of words) {
      const src = path.join(runDir, `${word}.png`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(targetDir, `${word}.png`));
      }
    }

    exec('git add .', { cwd: worktreePath });
    const status = exec('git status --porcelain', { cwd: worktreePath });
    if (!status) {
      console.log('No new images to commit (already up to date)');
    } else {
      exec(`git -c user.email="ci@github-actions" -c user.name="GitHub Actions" commit -m "ci: preview images for ${headSha.slice(0, 12)}"`, { cwd: worktreePath });
      exec('git push origin ci-previews', { cwd: worktreePath });
      console.log(`Pushed preview images for ${headSha.slice(0, 12)} to ci-previews branch`);
    }
  } finally {
    tryExec(`git worktree remove --force "${worktreePath}"`);
  }
}

// ── Metadata table ────────────────────────────────────────────────────────

function fmt(n: number | undefined, decimals = 2): string {
  return n !== undefined ? n.toFixed(decimals) : '–';
}

function fmtDelta(a: number | undefined, b: number | undefined): string {
  if (a === undefined || b === undefined) return '–';
  const d = a - b;
  return (d >= 0 ? `+${d.toFixed(3)}` : d.toFixed(3));
}

function buildMetadataTable(
  words: string[],
  resultsByWord: Map<string, WordResult>,
  diagByWord: Map<string, WordDiagnostic>,
): string {
  const header = '| word | layer | phase1 | phase2 | phase3 | score | Δ top | Δ 2nd | acceptable | distant |';
  const sep    = '|------|-------|--------|--------|--------|-------|-------|-------|------------|---------|';

  const rows = words.map(word => {
    const r = resultsByWord.get(word);
    const d = diagByWord.get(word);
    if (!r || !r.matched) {
      return `| ⚠ ${word} | – | – | – | – | retrieval failed | – | – | – | – |`;
    }
    return `| ${word} | ${r.pipelineLayer ?? '–'} | ${d?.phase1Candidates ?? '–'} | ${d?.phase2Candidates ?? '–'} | ${d?.phase3Candidates ?? '–'} | ${fmt(r.score)} | ${fmtDelta(d?.selectedScore, d?.topScore)} | ${fmtDelta(d?.topScore, d?.nextBestScore)} | ${d?.acceptableCount ?? '–'} | ${d?.distantCount ?? '–'} |`;
  });

  return [header, sep, ...rows].join('\n');
}

function buildImageSection(
  words: string[],
  resultsByWord: Map<string, WordResult>,
  headSha: string,
  repoSlug: string,
): string {
  return words
    .filter(word => resultsByWord.get(word)?.matched)
    .map(word => {
      const url = `https://raw.githubusercontent.com/${repoSlug}/ci-previews/${headSha}/${word}.png`;
      return `**${word}**\n![${word}](${url})`;
    })
    .join('\n\n');
}

// ── PR comment upsert via gh CLI ──────────────────────────────────────────

function upsertPrComment(prNumber: string, body: string, repoSlug: string): void {
  // Find existing comment with our marker (using jq to filter)
  const listJson = tryExec(
    `gh api "repos/${repoSlug}/issues/${prNumber}/comments" --paginate`,
  );

  let existingId: number | null = null;
  if (listJson) {
    try {
      const comments = JSON.parse(listJson) as Array<{ id: number; body: string }>;
      const found = comments.find(c => c.body.includes(COMMENT_MARKER));
      if (found) existingId = found.id;
    } catch { /* ignore */ }
  }

  const input = JSON.stringify({ body });

  if (existingId !== null) {
    exec(`gh api "repos/${repoSlug}/issues/comments/${existingId}" -X PATCH --input -`, { input });
    console.log(`Updated PR comment #${existingId}`);
  } else {
    exec(`gh api "repos/${repoSlug}/issues/${prNumber}/comments" -X POST --input -`, { input });
    console.log('Created new PR comment');
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { runId, prNumber } = parseArgs();

  if (!runId) { console.error('ERROR: --run-id is required'); process.exit(1); }
  if (!prNumber) { console.error('ERROR: --pr-number is required'); process.exit(1); }

  const runDir = path.join(__dirname, 'reports', runId);
  if (!fs.existsSync(runDir)) {
    console.error(`ERROR: Run directory not found: ${runDir}`);
    process.exit(1);
  }

  const resultsPath = path.join(runDir, 'results.json');
  if (!fs.existsSync(resultsPath)) {
    console.error(`ERROR: results.json not found in ${runDir}`);
    process.exit(1);
  }

  const runResults: RunResults = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'));
  const resultsByWord = new Map(runResults.results.map(r => [r.word, r]));

  let diagByWord = new Map<string, WordDiagnostic>();
  const diagPath = path.join(runDir, 'diagnostics.json');
  if (fs.existsSync(diagPath)) {
    const diags: WordDiagnostic[] = JSON.parse(fs.readFileSync(diagPath, 'utf-8'));
    diagByWord = new Map(diags.map(d => [d.word, d]));
  }

  const headSha = getHeadSha();
  const repoSlug = getRepoSlug();
  console.log(`Posting preview comment for PR #${prNumber} (sha: ${headSha.slice(0, 12)}, repo: ${repoSlug})`);

  // Push PNGs to ci-previews branch
  const wordsWithPng = PREVIEW_WORDS.filter(w => fs.existsSync(path.join(runDir, `${w}.png`)));
  if (wordsWithPng.length > 0) {
    console.log(`Pushing PNGs for: ${wordsWithPng.join(', ')}`);
    pushImagesToCiPreviewsBranch(runDir, headSha, wordsWithPng);
  } else {
    console.log('No PNGs found to push');
  }

  // Build comment
  const table = buildMetadataTable(PREVIEW_WORDS, resultsByWord, diagByWord);
  const images = buildImageSection(PREVIEW_WORDS, resultsByWord, headSha, repoSlug);

  const failedWords = PREVIEW_WORDS.filter(w => !resultsByWord.get(w)?.matched);
  const allFailed = failedWords.length === PREVIEW_WORDS.length;

  const statusLine = allFailed
    ? '> ⚠️ All preview words failed retrieval.'
    : failedWords.length > 0
      ? `> ⚠️ ${failedWords.length} word(s) failed: ${failedWords.join(', ')}`
      : '> ✓ All preview words matched successfully.';

  const commentBody = [
    COMMENT_MARKER,
    `## Constellation Previews — \`${headSha.slice(0, 12)}\``,
    '',
    statusLine,
    '',
    '### Match Diagnostics',
    '',
    table,
    '',
    '### Preview Images',
    '',
    images || '_No images available._',
    '',
    `<sub>Run ID: ${runId}</sub>`,
  ].join('\n');

  upsertPrComment(prNumber, commentBody, repoSlug);

  if (allFailed) {
    console.error('All five preview words failed — exiting with error');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
