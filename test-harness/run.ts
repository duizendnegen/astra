import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { match, maxPairwiseAngularDist } from '../frontend/src/matcher.ts';
import type { MatcherConfig, ModelName } from '../frontend/src/matcher.ts';
import type { Star, Skeleton, MatchResult } from '../frontend/src/types.ts';
import { words } from './words.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must match PATCH_RADIUS_DEG in frontend/src/matcher.ts
const PATCH_RADIUS_DEG = 10;
const ORION_SPAN_DEG = 25;

// ── Types ─────────────────────────────────────────────────────────────────

interface FixtureData {
  skeletons: Skeleton[];
}

interface WordResult {
  word: string;
  matched: boolean;
  score: number;
  starCount: number;
  angularSize: number;
  orionPct: number;
  variantIndex: number;
  patchRA: number;
  patchDec: number;
  matchedStarIds: number[];
  constellationStarIds: number[];
  skeletonPoints: { ra: number; dec: number }[];
  edges: [number, number][];
  patchStars: Star[];
}

interface RunMeta {
  runId: string;
  model: ModelName;
  date: string;
  wordCount: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
}

interface RunResults extends RunMeta {
  results: WordResult[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function distanceDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const dRa = ((ra2 - ra1) * Math.PI) / 180;
  const dDec = ((dec2 - dec1) * Math.PI) / 180;
  const a =
    Math.sin(dDec / 2) ** 2 +
    Math.cos((dec1 * Math.PI) / 180) *
      Math.cos((dec2 * Math.PI) / 180) *
      Math.sin(dRa / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180) / Math.PI;
}

const VALID_MODELS: ModelName[] = ['simple', 'vertex', 'spread'];

const NUMERIC_OVERRIDES: (keyof Omit<MatcherConfig, 'model'>)[] = [
  'seedMaxMag', 'patchRadius', 'maxPatchRadius', 'patchRadiusStep',
  'qualityThreshold', 'coverageThreshold', 'minMatchedStars', 'rotationSteps', 'skeletonFillRatio',
  'distanceThreshold', 'vertexBonusEndpoint', 'vertexBonusJoint', 'vertexSigma',
  'brightnessWeight', 'maxConstellationStars', 'spreadWeight',
];

function parseArgs(): { runId: string | null; compare: [string, string] | null; model: ModelName; overrides: Partial<Omit<MatcherConfig, 'model'>> } {
  const args = process.argv.slice(2);
  let runId: string | null = null;
  let compare: [string, string] | null = null;
  let model: ModelName = 'vertex';
  const overrides: Partial<Omit<MatcherConfig, 'model'>> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--run-id' && args[i + 1]) runId = args[++i];
    if (args[i] === '--compare' && args[i + 1] && args[i + 2]) {
      compare = [args[++i], args[++i]];
    }
    if (args[i] === '--model' && args[i + 1]) {
      const m = args[++i] as ModelName;
      if (!VALID_MODELS.includes(m)) {
        console.error(`Invalid model "${m}". Must be one of: ${VALID_MODELS.join(', ')}`);
        process.exit(1);
      }
      model = m;
    }
    const flag = args[i]?.replace(/^--/, '') as keyof Omit<MatcherConfig, 'model'>;
    if (NUMERIC_OVERRIDES.includes(flag) && args[i + 1]) {
      (overrides as Record<string, number>)[flag] = parseFloat(args[++i]);
    }
  }
  return { runId, compare, model, overrides };
}

function nextRunId(reportsDir: string): string {
  if (!fs.existsSync(reportsDir)) return 'v1';
  const existing = fs.readdirSync(reportsDir)
    .map((d) => /^v(\d+)$/.exec(d))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  return existing.length > 0 ? `v${Math.max(...existing) + 1}` : 'v1';
}

// ── Fixture loading ────────────────────────────────────────────────────────

async function loadOrFetchFixture(word: string, fixturesDir: string): Promise<FixtureData> {
  const fixturePath = path.join(fixturesDir, `${word}.json`);
  if (fs.existsSync(fixturePath)) {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as FixtureData;
  }

  // Fixture missing — fetch from local API
  let res: Response;
  try {
    res = await fetch('http://localhost:3001/api/skeleton', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
  } catch {
    console.error(
      `\nERROR: Fixture for "${word}" is missing and the local API is not reachable.\n` +
        `Start the local API first:\n  cd lambda && npm run dev:local\nThen re-run the harness.`,
    );
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`ERROR: API returned ${res.status} for word "${word}"`);
    process.exit(1);
  }

  const data = (await res.json()) as FixtureData;
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(data, null, 2));
  console.log(`  Saved fixture for "${word}"`);
  return data;
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function runSuite(runId: string, reportsDir: string, fixturesDir: string, catalogue: Star[], cfg: MatcherConfig): Promise<RunResults> {
  const results: WordResult[] = [];
  const outDir = path.join(reportsDir, runId);
  fs.mkdirSync(outDir, { recursive: true });

  for (const word of words) {
    process.stdout.write(`  ${word}...`);
    const fixture = await loadOrFetchFixture(word, fixturesDir);
    const matchResult: MatchResult | null = match(catalogue, fixture.skeletons, undefined, cfg);

    let wordResult: WordResult;
    if (!matchResult) {
      wordResult = {
        word, matched: false, score: 0, starCount: 0, angularSize: 0, orionPct: 0,
        variantIndex: 0, patchRA: 0, patchDec: 0,
        matchedStarIds: [], constellationStarIds: [],
        skeletonPoints: [], edges: [], patchStars: [],
      };
      console.log(' no match');
    } else {
      const angularSize = maxPairwiseAngularDist(matchResult.stars);
      const orionPct = Math.round((angularSize / ORION_SPAN_DEG) * 100);
      const patchStars = catalogue.filter(
        (s) => distanceDeg(s.ra, s.dec, matchResult.patchRA, matchResult.patchDec) <= PATCH_RADIUS_DEG,
      );
      const score = matchResult.stars.length /
        Math.max(1, patchStars.length);
      const displayScore = Math.round(score * 100);
      console.log(` ${displayScore}% (${matchResult.stars.length} stars, ${angularSize.toFixed(1)}°)`);

      wordResult = {
        word,
        matched: true,
        score,
        starCount: matchResult.stars.length,
        angularSize,
        orionPct,
        variantIndex: matchResult.variantIndex ?? 0,
        patchRA: matchResult.patchRA,
        patchDec: matchResult.patchDec,
        matchedStarIds: matchResult.stars.map((s) => s.id),
        constellationStarIds: matchResult.constellationStars.map((s) => s.id),
        skeletonPoints: matchResult.skeletonPoints ?? [],
        edges: matchResult.edges,
        patchStars,
      };
    }
    results.push(wordResult);
  }

  const greenCount = results.filter((r) => r.score >= 0.8).length;
  const amberCount = results.filter((r) => r.score >= 0.65 && r.score < 0.8).length;
  const redCount = results.filter((r) => r.score < 0.65).length;

  const runResults: RunResults = {
    runId, model: cfg.model, date: new Date().toISOString(),
    wordCount: words.length, greenCount, amberCount, redCount,
    results,
  };

  const resultsPath = path.join(outDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(runResults, null, 2));
  console.log(`\nResults written to ${resultsPath}`);

  const reportPath = path.join(outDir, 'report.html');
  fs.writeFileSync(reportPath, generateReportHtml(runResults));
  console.log(`Report written to ${reportPath}`);

  return runResults;
}

// ── HTML Report ────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 0.8) return '#22c55e';
  if (score >= 0.65) return '#f59e0b';
  return '#ef4444';
}

function generateReportHtml(run: RunResults): string {
  const cards = run.results.map((r) => {
    const pct = Math.round(r.score * 100);
    const color = scoreColor(r.score);
    const sizeFlag = r.angularSize > 0 && r.angularSize < 2.5 ? ' ⚠️' : '';
    return `<div class="card" data-word="${r.word}">
  <div class="word">${r.word}</div>
  <canvas class="sky" width="150" height="130" data-word="${r.word}"></canvas>
  <div class="bar-wrap"><div class="bar" style="width:${pct}%;background:${color}"></div></div>
  <div class="metrics">
    <span class="score" style="color:${color}">${pct}%</span>
    <span>${r.starCount} stars</span>
    <span>${r.angularSize.toFixed(1)}°${sizeFlag}</span>
    <span>${r.orionPct}% Orion</span>
  </div>
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Constellation Harness — ${run.runId}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d1f; color: #ccc; font-family: system-ui, sans-serif; padding: 16px; }
  header { margin-bottom: 16px; }
  h1 { font-size: 1.1rem; color: #fff; margin-bottom: 4px; }
  .meta { font-size: 0.8rem; color: #888; }
  .counts { display: inline-flex; gap: 12px; margin-left: 12px; font-size: 0.85rem; }
  .counts .g { color: #22c55e; } .counts .a { color: #f59e0b; } .counts .r { color: #ef4444; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .card { background: #14142a; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px; width: 200px; }
  .word { font-size: 0.9rem; font-weight: bold; color: #fff; margin-bottom: 6px; text-transform: capitalize; }
  .sky { display: block; background: #05050f; border-radius: 3px; margin-bottom: 6px; }
  .bar-wrap { height: 6px; background: #1e1e3a; border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
  .bar { height: 100%; border-radius: 3px; }
  .metrics { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 0.7rem; color: #888; }
  .score { font-weight: bold; }
</style>
</head>
<body>
<header>
  <h1>Constellation Test Harness — Run: ${run.runId}</h1>
  <div class="meta">${new Date(run.date).toLocaleString()} &nbsp;|&nbsp; model: <strong>${run.model}</strong> &nbsp;|&nbsp; ${run.wordCount} words
    <span class="counts">
      <span class="g">✓ ${run.greenCount}</span>
      <span class="a">~ ${run.amberCount}</span>
      <span class="r">✗ ${run.redCount}</span>
    </span>
  </div>
</header>
<div class="grid">
${cards}
</div>
<script id="run-data" type="application/json">${JSON.stringify(run.results)}</script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
(function () {
  const results = JSON.parse(document.getElementById('run-data').textContent);
  const byWord = Object.fromEntries(results.map(r => [r.word, r]));
  const PATCH_R = ${PATCH_RADIUS_DEG};

  function renderCard(canvas, r) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, w, h);
    if (!r.matched || r.patchStars.length === 0) {
      ctx.fillStyle = '#333';
      ctx.font = '10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('no match', w / 2, h / 2);
      return;
    }

    const proj = d3.geoStereographic()
      .rotate([-r.patchRA, -r.patchDec])
      .scale((Math.min(w, h) / 2) / (PATCH_R * Math.PI / 180))
      .translate([w / 2, h / 2]);

    const matchedIds = new Set(r.matchedStarIds);
    const constIds = new Set(r.constellationStarIds);

    // Background patch stars
    for (const s of r.patchStars) {
      const p = proj([s.ra, s.dec]);
      if (!p) continue;
      const [x, y] = p;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      const radius = Math.max(0.4, 2.2 - s.mag * 0.25);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      if (constIds.has(s.id)) {
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = '#8af';
        ctx.shadowBlur = 4;
      } else if (matchedIds.has(s.id)) {
        ctx.fillStyle = '#aabbdd';
        ctx.shadowBlur = 0;
      } else {
        ctx.fillStyle = '#2a2a55';
        ctx.shadowBlur = 0;
      }
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // Skeleton edges
    if (r.skeletonPoints && r.skeletonPoints.length > 0 && r.edges && r.edges.length > 0) {
      ctx.strokeStyle = 'rgba(100, 160, 255, 0.55)';
      ctx.lineWidth = 1;
      for (const [i, j] of r.edges) {
        const a = r.skeletonPoints[i], b = r.skeletonPoints[j];
        if (!a || !b) continue;
        const pa = proj([a.ra, a.dec]);
        const pb = proj([b.ra, b.dec]);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
    }
  }

  document.querySelectorAll('canvas.sky').forEach(canvas => {
    const word = canvas.dataset.word;
    const r = byWord[word];
    if (r) renderCard(canvas, r);
  });
})();
</script>
</body>
</html>`;
}

// ── Compare mode ───────────────────────────────────────────────────────────

function generateCompareHtml(idA: string, idB: string, runA: RunResults, runB: RunResults): string {
  const byWordB = Object.fromEntries(runB.results.map((r) => [r.word, r]));

  const cards = runA.results.map((rA) => {
    const rB = byWordB[rA.word];
    const pctA = Math.round(rA.score * 100);
    const pctB = rB ? Math.round(rB.score * 100) : 0;
    const delta = pctB - pctA;
    const deltaStr = delta > 0 ? `+${delta}%` : `${delta}%`;
    const deltaColor = delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : '#888';
    return `<div class="card">
  <div class="word">${rA.word} <span class="delta" style="color:${deltaColor}">${deltaStr}</span></div>
  <div class="halves">
    <div class="half">
      <div class="run-label">${idA}</div>
      <canvas class="sky sky-a" width="90" height="90" data-word="${rA.word}" data-run="a"></canvas>
      <div class="score" style="color:${scoreColor(rA.score)}">${pctA}%</div>
    </div>
    <div class="half">
      <div class="run-label">${idB}</div>
      <canvas class="sky sky-b" width="90" height="90" data-word="${rA.word}" data-run="b"></canvas>
      <div class="score" style="color:${rB ? scoreColor(rB.score) : '#555'}">${pctB}%</div>
    </div>
  </div>
</div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Compare ${idA} vs ${idB}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d1f; color: #ccc; font-family: system-ui, sans-serif; padding: 16px; }
  header { margin-bottom: 16px; }
  h1 { font-size: 1.1rem; color: #fff; margin-bottom: 4px; }
  .grid { display: flex; flex-wrap: wrap; gap: 10px; }
  .card { background: #14142a; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px; width: 210px; }
  .word { font-size: 0.9rem; font-weight: bold; color: #fff; margin-bottom: 6px; text-transform: capitalize; }
  .delta { font-size: 0.75rem; font-weight: bold; }
  .halves { display: flex; gap: 6px; }
  .half { flex: 1; text-align: center; }
  .run-label { font-size: 0.65rem; color: #555; margin-bottom: 3px; }
  .sky { background: #05050f; border-radius: 3px; display: block; }
  .score { font-size: 0.75rem; font-weight: bold; margin-top: 3px; }
</style>
</head>
<body>
<header>
  <h1>Compare: ${idA} vs ${idB}</h1>
</header>
<div class="grid">
${cards}
</div>
<script id="data-a" type="application/json">${JSON.stringify(runA.results)}</script>
<script id="data-b" type="application/json">${JSON.stringify(runB.results)}</script>
<script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
<script>
(function () {
  const PATCH_R = ${PATCH_RADIUS_DEG};
  const dataA = JSON.parse(document.getElementById('data-a').textContent);
  const dataB = JSON.parse(document.getElementById('data-b').textContent);
  const byWordA = Object.fromEntries(dataA.map(r => [r.word, r]));
  const byWordB = Object.fromEntries(dataB.map(r => [r.word, r]));

  function renderCanvas(canvas, r) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#05050f';
    ctx.fillRect(0, 0, w, h);
    if (!r || !r.matched || r.patchStars.length === 0) {
      ctx.fillStyle = '#333';
      ctx.font = '9px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('no match', w / 2, h / 2);
      return;
    }
    const proj = d3.geoStereographic()
      .rotate([-r.patchRA, -r.patchDec])
      .scale((Math.min(w, h) / 2) / (PATCH_R * Math.PI / 180))
      .translate([w / 2, h / 2]);
    const matchedIds = new Set(r.matchedStarIds);
    const constIds = new Set(r.constellationStarIds);
    for (const s of r.patchStars) {
      const p = proj([s.ra, s.dec]);
      if (!p) continue;
      const [x, y] = p;
      if (x < 0 || x > w || y < 0 || y > h) continue;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(0.4, 1.8 - s.mag * 0.2), 0, Math.PI * 2);
      ctx.fillStyle = constIds.has(s.id) ? '#fff' : matchedIds.has(s.id) ? '#aabbdd' : '#2a2a55';
      ctx.fill();
    }
    if (r.skeletonPoints && r.edges) {
      ctx.strokeStyle = 'rgba(100,160,255,0.55)';
      ctx.lineWidth = 1;
      for (const [i, j] of r.edges) {
        const a = r.skeletonPoints[i], b = r.skeletonPoints[j];
        if (!a || !b) continue;
        const pa = proj([a.ra, a.dec]), pb = proj([b.ra, b.dec]);
        if (!pa || !pb) continue;
        ctx.beginPath(); ctx.moveTo(pa[0], pa[1]); ctx.lineTo(pb[0], pb[1]); ctx.stroke();
      }
    }
  }

  document.querySelectorAll('canvas.sky').forEach(canvas => {
    const word = canvas.dataset.word;
    const run = canvas.dataset.run;
    renderCanvas(canvas, run === 'a' ? byWordA[word] : byWordB[word]);
  });
})();
</script>
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { runId: argRunId, compare, model, overrides } = parseArgs();
  const matcherConfig: MatcherConfig = { model, ...overrides };
  const reportsDir = path.join(__dirname, 'reports');
  const fixturesDir = path.join(__dirname, 'fixtures');

  // Load star catalogue
  const cataloguePath = path.join(__dirname, '../frontend/public/data/stars.json');
  const catalogue: Star[] = JSON.parse(fs.readFileSync(cataloguePath, 'utf-8'));
  console.log(`Loaded ${catalogue.length} stars from catalogue`);

  if (compare) {
    // Compare mode
    const [idA, idB] = compare;
    const pathA = path.join(reportsDir, idA, 'results.json');
    const pathB = path.join(reportsDir, idB, 'results.json');

    if (!fs.existsSync(pathA)) {
      console.error(`ERROR: Run "${idA}" not found at ${pathA}`);
      process.exit(1);
    }
    if (!fs.existsSync(pathB)) {
      console.error(`ERROR: Run "${idB}" not found at ${pathB}`);
      process.exit(1);
    }

    const runA: RunResults = JSON.parse(fs.readFileSync(pathA, 'utf-8'));
    const runB: RunResults = JSON.parse(fs.readFileSync(pathB, 'utf-8'));

    const compareHtml = generateCompareHtml(idA, idB, runA, runB);
    const outPath = path.join(reportsDir, `compare-${idA}-${idB}.html`);
    fs.mkdirSync(reportsDir, { recursive: true });
    fs.writeFileSync(outPath, compareHtml);
    console.log(`Compare report written to ${outPath}`);
    return;
  }

  // Run mode
  const runId = argRunId ?? nextRunId(reportsDir);
  console.log(`\nRun ID: ${runId}`);
  console.log(`Processing ${words.length} words...\n`);

  const runResults = await runSuite(runId, reportsDir, fixturesDir, catalogue, matcherConfig);

  console.log(
    `\nDone: ${runResults.greenCount} green, ${runResults.amberCount} amber, ${runResults.redCount} red`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
