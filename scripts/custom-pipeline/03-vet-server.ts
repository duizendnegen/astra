/**
 * 03-vet-server.ts
 *
 * Local vetting UI server for reviewing generated PNG/SVG/skeleton pairs.
 * Opens at http://localhost:4242
 *
 * Usage:
 *   npx tsx 03-vet-server.ts
 *
 * Keyboard shortcuts in UI: A (accept), R (retry), ← → (navigate), G (jump to word)
 */

import express from 'express';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { readCsv, writeCsv, type WordRow } from './csv.js';
// Import svgToSkeleton from the lambda source (relative path)
import { svgToSkeleton } from '../../lambda/src/svg-to-skeleton.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 4242;

const log = pino(
  { level: 'debug' },
  pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

type SkeletonData = { points: [number, number][]; edges: [number, number][] } | null;

interface WordData {
  word: string;
  pngBase64: string;
  svgBase64: string;
  skeletons: {
    concaveHull: SkeletonData;
    polygonUnion: SkeletonData;
    subpathComponents: SkeletonData;
  };
  status: string;
}

function computeSkeleton(svgContent: string, strategy: 'concave-hull' | 'polygon-union' | 'subpath-components'): SkeletonData {
  const sk = svgToSkeleton(svgContent, { strategy });
  return sk ? { points: sk.points as [number, number][], edges: sk.edges as [number, number][] } : null;
}

// Pre-compute all skeleton previews at server startup and cache in memory
function buildWordCache(rows: WordRow[]): WordData[] {
  const proposed = rows.filter((r) => r.status === 'proposed');
  log.info({ count: proposed.length }, 'Pre-computing skeleton previews...');

  return proposed.map((row) => {
    let pngBase64 = '';
    let svgBase64 = '';
    const skeletons: WordData['skeletons'] = { concaveHull: null, polygonUnion: null, subpathComponents: null };

    if (row.png_path && existsSync(row.png_path)) {
      pngBase64 = readFileSync(row.png_path).toString('base64');
    }

    if (row.svg_path && existsSync(row.svg_path)) {
      const svgContent = readFileSync(row.svg_path, 'utf-8');
      svgBase64 = Buffer.from(svgContent).toString('base64');

      for (const [key, strategy] of [
        ['concaveHull', 'concave-hull'],
        ['polygonUnion', 'polygon-union'],
        ['subpathComponents', 'subpath-components'],
      ] as const) {
        try {
          skeletons[key] = computeSkeleton(svgContent, strategy);
        } catch (err) {
          log.warn({ word: row.word, strategy, err: String(err) }, 'Skeleton computation failed');
        }
      }
    }

    log.debug({ word: row.word, hasPng: !!pngBase64, hasSvg: !!svgBase64 }, 'Word cached');
    return { word: row.word, pngBase64, svgBase64, skeletons, status: row.status };
  });
}

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Custom Pipeline — Vetting UI</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; background: #111; color: #eee; min-height: 100vh; }
    #app { display: flex; flex-direction: column; align-items: center; padding: 24px; }
    h1 { font-size: 1.2rem; margin-bottom: 8px; color: #aaa; }
    #counter { font-size: 0.9rem; color: #666; margin-bottom: 20px; }
    #card { background: #1e1e1e; border-radius: 12px; padding: 24px; width: 100%; max-width: 1200px; }
    #word-title { font-size: 2rem; font-weight: bold; margin-bottom: 16px; text-align: center; }
    #panels { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
    .panel { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .panel label { font-size: 0.75rem; color: #888; text-transform: uppercase; letter-spacing: 0.08em; }
    .panel img { width: 200px; height: 200px; object-fit: contain; background: white; border-radius: 6px; }
    canvas { background: #0a0a0a; border-radius: 6px; border: 2px solid transparent; transition: border-color 0.15s; }
    canvas.selected { border-color: #facc15; }
    canvas.dimmed { opacity: 0.4; }
    .skeleton-key { font-size: 0.7rem; color: #666; margin-top: 2px; }
    #status-bar { display: flex; gap: 12px; justify-content: center; margin-top: 20px; align-items: center; }
    .btn { padding: 10px 28px; border-radius: 8px; border: none; cursor: pointer; font-size: 1rem; font-weight: 600; }
    .btn-accept { background: #22c55e; color: white; }
    .btn-retry  { background: #ef4444; color: white; }
    .btn-nav    { background: #333; color: #ddd; padding: 10px 16px; }
    #decision-badge { display: none; position: absolute; top: 12px; right: 12px; font-size: 0.85rem;
                      padding: 4px 12px; border-radius: 20px; font-weight: 600; }
    #card { position: relative; }
    .badge-accepted { background: #22c55e; color: white; display: block !important; }
    .badge-retry    { background: #ef4444; color: white; display: block !important; }
    /* Retry reason picker */
    #reason-picker { display: none; background: #2a1a1a; border: 1px solid #5a2020; border-radius: 10px;
                     padding: 14px 16px; margin-top: 12px; }
    #reason-picker.visible { display: block; }
    #reason-picker p { font-size: 0.8rem; color: #aaa; margin-bottom: 10px; }
    .reason-presets { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .btn-reason { background: #3a1a1a; color: #f87171; border: 1px solid #5a2020; border-radius: 6px;
                  padding: 6px 14px; font-size: 0.85rem; cursor: pointer; }
    .btn-reason:hover { background: #4a2020; }
    #reason-custom-row { display: flex; gap: 8px; }
    #reason-custom { flex: 1; background: #1a1a1a; border: 1px solid #444; border-radius: 6px;
                     color: #eee; padding: 6px 10px; font-size: 0.85rem; }
    #reason-submit { background: #ef4444; color: white; border: none; border-radius: 6px;
                     padding: 6px 14px; cursor: pointer; font-size: 0.85rem; font-weight: 600; }
    #completion { text-align: center; padding: 60px 20px; }
    #completion h2 { font-size: 2rem; margin-bottom: 12px; color: #22c55e; }
    #completion p  { color: #888; }
    #shortcuts { font-size: 0.75rem; color: #555; margin-top: 12px; text-align: center; }
    #strategy-hint { font-size: 0.8rem; color: #ef4444; text-align: center; margin-top: 6px; min-height: 1.2em; }
  </style>
</head>
<body>
<div id="app">
  <h1>Custom Pipeline — Vetting UI</h1>
  <div id="counter"></div>
  <div id="card">
    <div id="decision-badge"></div>
    <div id="word-title"></div>
    <div id="panels">
      <div class="panel">
        <label>PNG</label>
        <img id="png-img" src="" alt="PNG" />
      </div>
      <div class="panel">
        <label>SVG</label>
        <img id="svg-img" src="" alt="SVG" />
      </div>
      <div class="panel">
        <label>1 — Concave Hull</label>
        <canvas id="canvas-concave-hull" width="200" height="200" data-strategy="concave-hull"></canvas>
        <span class="skeleton-key">concave-hull</span>
      </div>
      <div class="panel">
        <label>2 — Polygon Union</label>
        <canvas id="canvas-polygon-union" width="200" height="200" data-strategy="polygon-union"></canvas>
        <span class="skeleton-key">polygon-union</span>
      </div>
      <div class="panel">
        <label>3 — Subpath Components</label>
        <canvas id="canvas-subpath-components" width="200" height="200" data-strategy="subpath-components"></canvas>
        <span class="skeleton-key">subpath-components</span>
      </div>
    </div>
    <div id="strategy-hint"></div>
    <div id="status-bar">
      <button class="btn btn-nav" id="btn-prev">← Prev</button>
      <button class="btn btn-retry" id="btn-retry">R — Retry</button>
      <button class="btn btn-accept" id="btn-accept">A — Accept</button>
      <button class="btn btn-nav" id="btn-next">Next →</button>
    </div>
    <div id="reason-picker">
      <p>Why retry? (will be added to the next generation prompt)</p>
      <div class="reason-presets">
        <button class="btn-reason" data-reason="Important: Draw only the main body outline, no fine detail.">Too complex</button>
        <button class="btn-reason" data-reason="Important: iconic, easy to recognize representation.">Not accurate</button>
        <button class="btn-reason" data-reason="Important: Use a simple side-view silhouette with minimal internal lines.">Too detailed</button>
      </div>
      <div id="reason-custom-row">
        <input id="reason-custom" type="text" placeholder="Custom retry prompt..." />
        <button id="reason-submit">Retry ↵</button>
      </div>
    </div>
    <div id="shortcuts">Shortcuts: 1/2/3 pick skeleton · A accept · R retry · ← → navigate · G jump to word</div>
  </div>
  <div id="completion" style="display:none">
    <h2>All words vetted!</h2>
    <p>No more proposed words. You can stop the server now.</p>
  </div>
</div>
<script>
let words = [];
let decisions = {};
let idx = 0;
let selectedStrategy = null; // 'concave-hull' | 'polygon-union' | 'subpath-components' | null

const STRATEGIES = ['concave-hull', 'polygon-union', 'subpath-components'];
const STRATEGY_KEYS = { 'concave-hull': 'concaveHull', 'polygon-union': 'polygonUnion', 'subpath-components': 'subpathComponents' };
const CANVAS_IDS = { 'concave-hull': 'canvas-concave-hull', 'polygon-union': 'canvas-polygon-union', 'subpath-components': 'canvas-subpath-components' };

async function load() {
  const res = await fetch('/api/words');
  words = await res.json();
  if (words.length === 0) {
    document.getElementById('card').style.display = 'none';
    document.getElementById('completion').style.display = 'block';
    return;
  }
  render();
}

function drawSkeleton(canvas, skeleton) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!skeleton) {
    ctx.fillStyle = '#555';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('No skeleton', W / 2, H / 2);
    return;
  }
  const pts = skeleton.points;
  const edges = skeleton.edges;
  const pad = 10;
  const size = W - pad * 2;
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth = 1.5;
  for (const [a, b] of edges) {
    ctx.beginPath();
    ctx.moveTo(pad + pts[a][0] * size, pad + pts[a][1] * size);
    ctx.lineTo(pad + pts[b][0] * size, pad + pts[b][1] * size);
    ctx.stroke();
  }
  ctx.fillStyle = '#facc15';
  for (const [x, y] of pts) {
    ctx.beginPath();
    ctx.arc(pad + x * size, pad + y * size, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function updateStrategyHighlight() {
  for (const s of STRATEGIES) {
    const canvas = document.getElementById(CANVAS_IDS[s]);
    canvas.classList.toggle('selected', s === selectedStrategy);
    canvas.classList.toggle('dimmed', selectedStrategy !== null && s !== selectedStrategy);
  }
}

function selectStrategy(strategy) {
  // Toggle off if same key pressed twice
  selectedStrategy = selectedStrategy === strategy ? null : strategy;
  document.getElementById('strategy-hint').textContent = '';
  updateStrategyHighlight();
}

function render() {
  if (words.length === 0) return;
  const w = words[idx];
  document.getElementById('counter').textContent = \`Word \${idx + 1} of \${words.length}\`;
  document.getElementById('word-title').textContent = w.word;

  document.getElementById('png-img').src = w.pngBase64
    ? \`data:image/png;base64,\${w.pngBase64}\`
    : '';

  document.getElementById('svg-img').src = w.svgBase64
    ? \`data:image/svg+xml;base64,\${w.svgBase64}\`
    : '';

  for (const s of STRATEGIES) {
    const canvas = document.getElementById(CANVAS_IDS[s]);
    const skKey = STRATEGY_KEYS[s];
    drawSkeleton(canvas, w.skeletons?.[skKey] ?? null);
  }

  updateStrategyHighlight();

  const badge = document.getElementById('decision-badge');
  const dec = decisions[w.word];
  badge.className = '';
  if (dec === 'accepted') { badge.textContent = 'Accepted ✓'; badge.className = 'badge-accepted'; badge.style.display = 'block'; }
  else if (dec && dec.startsWith('retry')) {
    const reason = dec.replace('retry: ', '').replace('retry:', '').trim();
    badge.textContent = reason && reason !== '…' ? \`Retry: \${reason.slice(0, 40)}\` : 'Retry';
    badge.className = 'badge-retry';
    badge.style.display = 'block';
  } else { badge.style.display = 'none'; }
}

async function decide(decision, reason) {
  if (decision === 'accepted' && !selectedStrategy) {
    const hint = document.getElementById('strategy-hint');
    hint.textContent = 'Pick a skeleton strategy first (keys 1, 2, or 3)';
    // Flash canvases
    for (const s of STRATEGIES) {
      const c = document.getElementById(CANVAS_IDS[s]);
      c.style.borderColor = '#ef4444';
      setTimeout(() => { c.style.borderColor = ''; }, 500);
    }
    return;
  }

  const word = words[idx].word;
  const chosenStrategy = selectedStrategy;
  decisions[word] = decision === 'retry' ? ('retry: ' + (reason || '…')) : decision;
  if (decision === 'accepted') selectedStrategy = null;
  closeReasonPicker();
  render();
  await fetch('/api/decide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ word, decision, reason, skeletonStrategy: decision === 'accepted' ? chosenStrategy : '' }),
  });
  // Auto-advance after accept or retry
  setTimeout(() => navigate(1), 300);
}

function openReasonPicker() {
  // Fill in the word-specific placeholder for "not accurate" preset
  document.querySelectorAll('.btn-reason[data-reason]').forEach(btn => {
    btn.dataset.resolvedReason = btn.dataset.reason.replace('\${word}', words[idx].word);
    btn.textContent = btn.dataset.resolvedReason === btn.dataset.reason
      ? btn.textContent
      : btn.textContent; // text already set in HTML
  });
  document.getElementById('reason-picker').classList.add('visible');
  document.getElementById('reason-custom').focus();
}

function closeReasonPicker() {
  document.getElementById('reason-picker').classList.remove('visible');
  document.getElementById('reason-custom').value = '';
}

function navigate(delta) {
  closeReasonPicker();
  selectedStrategy = null;
  document.getElementById('strategy-hint').textContent = '';
  idx = Math.max(0, Math.min(words.length - 1, idx + delta));
  render();
}

document.getElementById('btn-accept').addEventListener('click', () => decide('accepted'));
document.getElementById('btn-retry').addEventListener('click', () => openReasonPicker());
document.getElementById('btn-prev').addEventListener('click', () => navigate(-1));
document.getElementById('btn-next').addEventListener('click', () => navigate(1));

// Preset reason buttons
document.querySelectorAll('.btn-reason').forEach(btn => {
  btn.addEventListener('click', () => {
    const word = words[idx]?.word ?? '';
    const reason = btn.dataset.reason.replace('\${word}', word);
    decide('retry', reason);
  });
});

// Custom reason submit
document.getElementById('reason-submit').addEventListener('click', () => {
  const reason = document.getElementById('reason-custom').value.trim();
  decide('retry', reason);
});
document.getElementById('reason-custom').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const reason = e.target.value.trim();
    decide('retry', reason);
  }
  e.stopPropagation(); // don't fire global shortcuts while typing
});

document.addEventListener('keydown', (e) => {
  const picker = document.getElementById('reason-picker');
  if (e.key === 'Escape') { closeReasonPicker(); return; }
  if (picker.classList.contains('visible')) return; // let picker handle input
  if (e.target !== document.body && e.target.tagName !== 'BODY') return;
  if (e.key === '1') selectStrategy('concave-hull');
  else if (e.key === '2') selectStrategy('polygon-union');
  else if (e.key === '3') selectStrategy('subpath-components');
  else if (e.key === 'a' || e.key === 'A') decide('accepted');
  else if (e.key === 'r' || e.key === 'R') openReasonPicker();
  else if (e.key === 'ArrowLeft') navigate(-1);
  else if (e.key === 'ArrowRight') navigate(1);
  else if (e.key === 'g' || e.key === 'G') {
    const target = prompt('Jump to word:');
    if (target) {
      const i = words.findIndex(w => w.word.toLowerCase() === target.toLowerCase());
      if (i !== -1) { idx = i; render(); }
    }
  }
});

load();
</script>
</body>
</html>`;

async function main(): Promise<void> {
  const rows = readCsv();
  const wordCache = buildWordCache(rows);

  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.send(HTML_PAGE);
  });

  app.get('/api/words', (_req, res) => {
    // Return fresh proposed rows from cache (decisions don't remove from cache, they just update status)
    res.json(wordCache);
  });

  /**
   * GET /api/word/:word?concavity=N
   * Recompute skeleton for a word with a custom concavity value.
   * Used for visual tuning of the concavity parameter.
   */
  app.get('/api/word/:word', (req, res) => {
    const { word } = req.params;
    const concavityParam = req.query['concavity'];
    const concavity = concavityParam ? parseFloat(concavityParam as string) : 1.5;

    const wordData = wordCache.find((w) => w.word === word);
    if (!wordData) {
      res.status(404).json({ error: 'word not found' });
      return;
    }

    if (!wordData.svgBase64) {
      res.json({ word, concavity, skeleton: null });
      return;
    }

    const svgContent = Buffer.from(wordData.svgBase64, 'base64').toString('utf-8');
    try {
      const sk = svgToSkeleton(svgContent, { concavity });
      res.json({
        word,
        concavity,
        skeleton: sk ? { points: sk.points, edges: sk.edges } : null,
      });
    } catch (err) {
      log.warn({ word, concavity, err: String(err) }, 'Skeleton recompute failed');
      res.status(500).json({ error: String(err) });
    }
  });

  app.post('/api/decide', (req, res) => {
    const { word, decision, reason, skeletonStrategy } = req.body as {
      word: string;
      decision: 'accepted' | 'retry';
      reason?: string;
      skeletonStrategy?: string;
    };
    if (!word || !decision) {
      res.status(400).json({ error: 'word and decision are required' });
      return;
    }

    const currentRows = readCsv();
    const row = currentRows.find((r) => r.word === word);
    if (!row) {
      res.status(404).json({ error: 'word not found' });
      return;
    }

    if (decision === 'accepted') {
      row.status = 'accepted';
      row.retry_reason = '';
      row.skeleton_strategy = skeletonStrategy ?? '';
    } else if (decision === 'retry') {
      row.status = 'retry';
      row.retry_count = String(parseInt(row.retry_count || '0', 10) + 1);
      row.retry_reason = reason ?? '';
      row.skeleton_strategy = '';
    }

    writeCsv(currentRows);
    log.info({ word, decision, reason, skeletonStrategy }, 'Decision recorded');
    res.json({ ok: true });
  });

  app.listen(PORT, () => {
    log.info({ url: `http://localhost:${PORT}` }, 'Vet server running');
  });
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
