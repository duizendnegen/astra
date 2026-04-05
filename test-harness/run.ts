import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { match, maxPairwiseAngularDist } from '../lambda/src/matcher.ts';
import type { MatcherConfig, ModelName, GeneratorName, ScorerName } from '../lambda/src/matcher.ts';
import type { Star, Skeleton, MatchResult } from '../lambda/src/types.ts';
import { words, wordCategoryMap } from './words.ts';
import { renderPatch, renderComposite } from './render-patch.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Must match PATCH_RADIUS_DEG in frontend/src/matcher.ts
const PATCH_RADIUS_DEG = 10;
const THUMB_SIZE = 300;
const ORION_SPAN_DEG = 25;

// ── Types ─────────────────────────────────────────────────────────────────

interface MatchProvenance {
  source: 'phosphor' | 'phylopic' | 'llm';
  id: string;
  similarity: number;
  layer: 1 | 3 | 4;
  svgPath: string;
}

interface FixtureData {
  skeletons: Skeleton[];
  match?: MatchProvenance | null;
}

interface WordResult {
  word: string;
  category: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  pipelineLayer: 1 | 3 | 4 | 'fallback' | null;
  matchSource: 'phosphor' | 'phylopic' | 'llm' | null;
  matched: boolean;
  score: number;
  shapeScore: number;
  vertexFitScore: number;
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

interface VertexAssignment {
  vertexIndex: number;
  physVertRA: number;
  physVertDec: number;
  starId: number;
  starRA: number;
  starDec: number;
  distanceDeg: number;
  distanceNormBySpan: number | null;
}

interface WordDiagnostic {
  word: string;
  generator: string;
  scorer: string;
  phase1Candidates: number;
  phase2Candidates: number;
  phase3Candidates: number;
  shapeScore: number;
  vertexFitScore: number;
  procrustesScore?: number;
  physVerts: { ra: number; dec: number }[];
  vertexAssignments: VertexAssignment[];
}

function writeDiagnostics(outDir: string, diagnostics: WordDiagnostic[]): void {
  const outPath = path.join(outDir, 'diagnostics.json');
  fs.writeFileSync(outPath, JSON.stringify(diagnostics, null, 2));
  console.log(`Diagnostics written to ${outPath}`);
}

interface RunMeta {
  runId: string;
  model: ModelName;
  date: string;
  wordCount: number;
  greenCount: number;
  amberCount: number;
  redCount: number;
  fixturesDir: string;
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

const VALID_MODELS: ModelName[] = ['vertex-penalty', 'skeleton-shape'];

const NUMERIC_OVERRIDES: (keyof Omit<MatcherConfig, 'model' | 'generator' | 'scorer'>)[] = [
  'seedMaxMag', 'patchRadius', 'maxPatchRadius', 'patchRadiusStep',
  'qualityThreshold', 'coverageThreshold', 'rotationSteps', 'skeletonFillRatio',
  'distanceThreshold', 'vertexBonusEndpoint', 'vertexBonusJoint', 'vertexSigma',
  'brightnessWeight', 'penaltyWeight', 'phase2Cap', 'phase3Cap',
];

const VALID_GENERATORS: GeneratorName[] = ['anchor-pair', 'single-sweep', 'any-vertex'];
const VALID_SCORERS: ScorerName[] = ['edge-ratio', 'vertex-fit', 'procrustes', 'procrustes-unit-scale'];

function parseArgs(): { runId: string | null; compare: [string, string] | null; model: ModelName; overrides: Partial<Omit<MatcherConfig, 'model'>>; fixturesDir: string; promptVariant: string | null; skeletonModel: string | null; wordFilter: string[] | null } {
  const args = process.argv.slice(2);
  let runId: string | null = null;
  let compare: [string, string] | null = null;
  let model: ModelName = 'vertex-penalty';
  let fixturesDir = 'fixtures';
  let promptVariant: string | null = null;
  let skeletonModel: string | null = null;
  let wordFilter: string[] | null = null;
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
    if (args[i] === '--generator' && args[i + 1]) {
      const g = args[++i] as GeneratorName;
      if (!VALID_GENERATORS.includes(g)) {
        console.error(`Invalid generator "${g}". Must be one of: ${VALID_GENERATORS.join(', ')}`);
        process.exit(1);
      }
      overrides.generator = g;
    }
    if (args[i] === '--scorer' && args[i + 1]) {
      const s = args[++i] as ScorerName;
      if (!VALID_SCORERS.includes(s)) {
        console.error(`Invalid scorer "${s}". Must be one of: ${VALID_SCORERS.join(', ')}`);
        process.exit(1);
      }
      overrides.scorer = s;
    }
    if (args[i] === '--words' && args[i + 1]) {
      wordFilter = args[++i].split(',').map(w => w.trim()).filter(Boolean);
    }
    if (args[i] === '--fixtures-dir' && args[i + 1]) fixturesDir = args[++i];
    if (args[i] === '--prompt-variant' && args[i + 1]) promptVariant = args[++i];
    if (args[i] === '--skeleton-model' && args[i + 1]) skeletonModel = args[++i];
    if (args[i] === '--skeleton-shape-refine') (overrides as Record<string, boolean>)['skeletonShapeRefine'] = true;
    if (args[i] === '--assignment-algorithm' && args[i + 1]) {
      const alg = args[++i];
      if (alg === 'greedy' || alg === 'hungarian') (overrides as Record<string, string>)['assignmentAlgorithm'] = alg;
    }
    const flag = args[i]?.replace(/^--/, '') as keyof Omit<MatcherConfig, 'model' | 'generator' | 'scorer'>;
    if (NUMERIC_OVERRIDES.includes(flag) && args[i + 1]) {
      (overrides as Record<string, number>)[flag] = parseFloat(args[++i]);
    }
  }
  return { runId, compare, model, overrides, fixturesDir, promptVariant, skeletonModel, wordFilter };
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

async function loadOrFetchFixture(word: string, fixturesDir: string, promptVariant: string | null = null, skeletonModel: string | null = null): Promise<FixtureData> {
  const fixturePath = path.join(fixturesDir, `${word}.json`);
  if (fs.existsSync(fixturePath)) {
    return JSON.parse(fs.readFileSync(fixturePath, 'utf-8')) as FixtureData;
  }

  // Fixture missing — fetch from local API (retry once on transient failure)
  const body: Record<string, string> = { word };
  if (promptVariant) body.promptVariant = promptVariant;
  if (skeletonModel) body.model = skeletonModel;

  let res: Response | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 3000));
    try {
      res = await fetch('http://localhost:3001/api/skeleton', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      break;
    } catch (err) {
      if (attempt === 1) {
        console.error(
          `\nERROR: Fixture for "${word}" is missing and the local API is not reachable.\n` +
            `Start the local API first:\n  cd lambda && npm run dev:local\nThen re-run the harness.`,
        );
        process.exit(1);
      }
      console.warn(`  [retry] ${word}: fetch failed, retrying...`);
    }
  }

  if (!res!.ok) {
    console.error(`ERROR: API returned ${res!.status} for word "${word}"`);
    process.exit(1);
  }

  const data = (await res.json()) as FixtureData;
  fs.mkdirSync(fixturesDir, { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(data, null, 2));
  console.log(`  Saved fixture for "${word}"`);
  return data;
}

// ── Runner ─────────────────────────────────────────────────────────────────

async function runSuite(runId: string, reportsDir: string, fixturesDir: string, catalogue: Star[], cfg: MatcherConfig, promptVariant: string | null = null, skeletonModel: string | null = null, wordFilter: string[] | null = null): Promise<RunResults> {
  const outDir = path.join(reportsDir, runId);
  fs.mkdirSync(outDir, { recursive: true });

  // Apply word filter if provided
  let activeWords = words;
  if (wordFilter !== null) {
    const unknown = wordFilter.filter(w => !words.includes(w));
    if (unknown.length > 0) {
      console.error(`Unknown words: ${unknown.join(', ')}`);
      process.exit(1);
    }
    activeWords = wordFilter;
  }

  // Process words in parallel with a concurrency cap to avoid overwhelming the LLM API
  const CONCURRENCY = 2;
  const queue = [...activeWords];
  const results: WordResult[] = [];
  const diagnostics: WordDiagnostic[] = [];

  async function processWord(word: string): Promise<{ wordResult: WordResult; diagnostic: WordDiagnostic | null }> {
    const fixture = await loadOrFetchFixture(word, fixturesDir, promptVariant, skeletonModel);
    const matchResult: MatchResult | null = match(catalogue, fixture.skeletons, undefined, cfg);

    const category = wordCategoryMap[word] ?? null;
    const pipelineLayer: WordResult['pipelineLayer'] = fixture.match
      ? fixture.match.layer
      : fixture.match === null ? 'fallback' : null;
    const matchSource = fixture.match?.source ?? null;

    let wordResult: WordResult;
    let diagnostic: WordDiagnostic | null = null;
    let effectiveRadius = PATCH_RADIUS_DEG;
    if (!matchResult) {
      wordResult = {
        word, category, pipelineLayer, matchSource,
        matched: false, score: 0, shapeScore: 0, vertexFitScore: 0,
        starCount: 0, angularSize: 0, orionPct: 0,
        variantIndex: 0, patchRA: 0, patchDec: 0,
        matchedStarIds: [], constellationStarIds: [],
        skeletonPoints: [], edges: [], patchStars: [],
      };
      console.log(`  ${word}: no match`);
    } else {
      const angularSize = maxPairwiseAngularDist(matchResult.stars);
      effectiveRadius = Math.max(PATCH_RADIUS_DEG, angularSize * 0.7);
      const orionPct = Math.round((angularSize / ORION_SPAN_DEG) * 100);
      const patchStars = catalogue.filter(
        (s) => distanceDeg(s.ra, s.dec, matchResult.patchRA, matchResult.patchDec) <= effectiveRadius,
      );
      const score = matchResult.stars.length / Math.max(1, patchStars.length);
      const displayScore = Math.round(score * 100);
      console.log(`  ${word}: ${displayScore}% (${matchResult.stars.length} stars, ${angularSize.toFixed(1)}°) shape=${Math.round(matchResult.shapeScore * 100)}% vtx=${Math.round(matchResult.vertexFitScore * 100)}%`);

      wordResult = {
        word,
        category,
        pipelineLayer,
        matchSource,
        matched: true,
        score,
        shapeScore: matchResult.shapeScore,
        vertexFitScore: matchResult.vertexFitScore,
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

      const physVerts = matchResult.skeletonPoints ?? [];
      const vertexAssignments: VertexAssignment[] = matchResult.constellationStars.map((star, i) => {
        const pv = physVerts[i];
        const dist = pv ? distanceDeg(star.ra, star.dec, pv.ra, pv.dec) : 0;
        return {
          vertexIndex: i,
          physVertRA: pv?.ra ?? 0,
          physVertDec: pv?.dec ?? 0,
          starId: star.id,
          starRA: star.ra,
          starDec: star.dec,
          distanceDeg: dist,
          distanceNormBySpan: angularSize > 0 ? dist / angularSize : null,
        };
      });

      diagnostic = {
        word,
        generator: cfg.generator ?? 'anchor-pair',
        scorer: cfg.scorer ?? 'edge-ratio',
        phase1Candidates: matchResult.phase1Candidates ?? 0,
        phase2Candidates: matchResult.phase2Candidates ?? 0,
        phase3Candidates: matchResult.phase3Candidates ?? 0,
        shapeScore: matchResult.shapeScore,
        vertexFitScore: matchResult.vertexFitScore,
        procrustesScore: matchResult.procrustesScore,
        physVerts,
        vertexAssignments,
      };
    }
    const constellationBuf = renderPatch(wordResult, { width: THUMB_SIZE, height: THUMB_SIZE, patchRadiusDeg: effectiveRadius });
    const skeleton = fixture.skeletons?.[0] ?? null;
    const svgString = fixture.match?.svgPath ?? null;
    const compositeBuf = renderComposite(svgString, skeleton, constellationBuf, THUMB_SIZE);
    fs.writeFileSync(path.join(outDir, `${word}.png`), compositeBuf);
    return { wordResult, diagnostic };
  }

  async function worker() {
    let word: string | undefined;
    while ((word = queue.shift()) !== undefined) {
      const { wordResult, diagnostic } = await processWord(word);
      results.push(wordResult);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const greenCount = results.filter((r) => r.score >= 0.8).length;
  const amberCount = results.filter((r) => r.score >= 0.65 && r.score < 0.8).length;
  const redCount = results.filter((r) => r.score < 0.65).length;

  const runResults: RunResults = {
    runId, model: cfg.model, date: new Date().toISOString(),
    wordCount: activeWords.length, greenCount, amberCount, redCount,
    fixturesDir: path.basename(fixturesDir),
    results,
  };

  const resultsPath = path.join(outDir, 'results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(runResults, null, 2));
  console.log(`\nResults written to ${resultsPath}`);

  const reportPath = path.join(outDir, 'report.html');
  fs.writeFileSync(reportPath, generateReportHtml(runResults));
  console.log(`Report written to ${reportPath}`);

  try {
    writeDiagnostics(outDir, diagnostics);
  } catch (err) {
    console.warn(`Warning: failed to write diagnostics: ${err}`);
  }

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
    return `<div class="card">
  <div class="word">${r.word}</div>
  <img src="./${r.word}.png" class="sky" width="${THUMB_SIZE * 3}" height="${THUMB_SIZE}" alt="${r.word}">
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
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .card { background: #14142a; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px; width: ${THUMB_SIZE * 3 + 16}px; }
  .word { font-size: 0.9rem; font-weight: bold; color: #fff; margin-bottom: 6px; text-transform: capitalize; }
  .sky { display: block; width: 100%; height: auto; border-radius: 3px; margin-bottom: 6px; }
  .bar-wrap { height: 6px; background: #1e1e3a; border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
  .bar { height: 100%; border-radius: 3px; }
  .metrics { display: flex; flex-wrap: wrap; gap: 4px 8px; font-size: 0.7rem; color: #888; }
  .score { font-weight: bold; }
</style>
</head>
<body>
<header>
  <h1>Constellation Test Harness — Run: ${run.runId}</h1>
  <div class="meta">${new Date(run.date).toLocaleString()} &nbsp;|&nbsp; model: <strong>${run.model}</strong> &nbsp;|&nbsp; fixtures: <strong>${run.fixturesDir}</strong> &nbsp;|&nbsp; ${run.wordCount} words
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
      <img src="./${idA}/${rA.word}.png" class="sky" alt="${rA.word} (${idA})">
      <div class="score" style="color:${scoreColor(rA.score)}">${pctA}%</div>
    </div>
    <div class="half">
      <div class="run-label">${idB}</div>
      <img src="./${idB}/${rA.word}.png" class="sky" alt="${rA.word} (${idB})">
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
  .grid { display: grid; grid-template-columns: repeat(3, 880px); gap: 12px; }
  .card { background: #14142a; border: 1px solid #2a2a4a; border-radius: 6px; padding: 8px; }
  .word { font-size: 0.9rem; font-weight: bold; color: #fff; margin-bottom: 6px; text-transform: capitalize; }
  .delta { font-size: 0.75rem; font-weight: bold; }
  .halves { display: flex; gap: 6px; }
  .half { flex: 1; text-align: center; }
  .run-label { font-size: 0.65rem; color: #555; margin-bottom: 3px; }
  .sky { display: block; width: 100%; height: auto; border-radius: 3px; background: #05050f; }
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
</body>
</html>`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { runId: argRunId, compare, model, overrides, fixturesDir: fixturesDirName, promptVariant, skeletonModel, wordFilter } = parseArgs();
  const matcherConfig: MatcherConfig = { model, ...overrides };
  const reportsDir = path.join(__dirname, 'reports');
  const fixturesDir = path.join(__dirname, fixturesDirName);

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
  const activeWordCount = wordFilter !== null ? wordFilter.length : words.length;
  console.log(`Processing ${activeWordCount} words...\n`);

  const runResults = await runSuite(runId, reportsDir, fixturesDir, catalogue, matcherConfig, promptVariant, skeletonModel, wordFilter);

  console.log(
    `\nDone: ${runResults.greenCount} green, ${runResults.amberCount} amber, ${runResults.redCount} red`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
