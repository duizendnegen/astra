// Local development server — replaces Lambda + DynamoDB + SSM for local testing.
// Usage: npm run dev:local
// Reads OPENROUTER_API_KEY from environment (via .env.local in project root).

import http from 'http';
import { retrieveSkeleton } from './retrieval.js';
import type { PipelineResult } from './retrieval.js';
import { match } from './matcher.js';
import { getCatalogue } from './catalogue.js';
import { createLogger } from './logger.js';

const log = createLogger('local');
const PORT = 3001;
const API_KEY = process.env.OPENROUTER_API_KEY ?? '';

if (!API_KEY) {
  log.warn('OPENROUTER_API_KEY not set — LLM calls will fail. Set it in .env.local.');
}

// In-memory cache (keyed by word — retrieval pipeline is deterministic for same index)
const cache = new Map<string, PipelineResult>();

const server = http.createServer(async (req, res) => {
  const t0 = Date.now();

  // CORS for local Vite dev server
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/api/constellation') {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let word: string;
  let excludeSeeds: number[] = [];
  try {
    const parsed = JSON.parse(body) as { word?: unknown; excludeSeeds?: unknown };
    if (typeof parsed.word !== 'string' || !parsed.word.trim()) throw new Error();
    word = parsed.word.trim().toLowerCase();
    if (Array.isArray(parsed.excludeSeeds)) {
      excludeSeeds = (parsed.excludeSeeds as unknown[]).filter((x): x is number => typeof x === 'number');
    }
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'word is required' }));
    return;
  }

  const useCache = excludeSeeds.length === 0;

  if (useCache && cache.has(word)) {
    log.info({ word }, 'Cache hit');
    const cached = cache.get(word)!;
    const catalogue = getCatalogue();
    const excludeSet = new Set<number>();
    const matchResult = match(catalogue, cached.skeletons, excludeSet);
    if (!matchResult) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'matching failed' }));
      return;
    }
    const skeleton = cached.skeletons[matchResult.variantIndex ?? 0];
    const seedStar = catalogue.find(s => s.ra === matchResult.patchRA && s.dec === matchResult.patchDec);
    res.writeHead(200);
    res.end(JSON.stringify({ constellation: matchResult, skeleton, match: cached.match, seedStarId: seedStar?.id }));
    return;
  }

  log.info({ word, excludeSeeds }, 'Retrieving skeleton');
  const result = await retrieveSkeleton(word, API_KEY);

  if (result.match === null) {
    res.writeHead(422);
    res.end(JSON.stringify({ error: 'No constellation found.' }));
    return;
  }

  if (useCache) cache.set(word, result);

  log.info({ word, layer: result.match.layer, source: result.match.source }, 'Pipeline complete');

  const catalogue = getCatalogue();
  const excludeSet = new Set<number>(excludeSeeds);
  const matchResult = match(catalogue, result.skeletons, excludeSet);

  if (!matchResult) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'matching failed — no patch found' }));
    return;
  }

  const skeleton = result.skeletons[matchResult.variantIndex ?? 0];
  const seedStar = catalogue.find(s => s.ra === matchResult.patchRA && s.dec === matchResult.patchDec);

  const durationMs = Date.now() - t0;
  log.info({ word, durationMs, layer: result.match?.layer ?? 'fallback' }, 'Request complete');

  res.writeHead(200);
  res.end(JSON.stringify({ constellation: matchResult, skeleton, match: result.match, seedStarId: seedStar?.id }));
});

server.listen(PORT, () => {
  log.info({ port: PORT }, `API server running at http://localhost:${PORT}`);
});
