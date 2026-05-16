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

const REQUIRED_ENV_VARS = ['PINECONE_API_KEY', 'PINECONE_INDEX_NAME', 'ICONS_BUCKET_NAME', 'OPENROUTER_API_KEY'];
for (const v of REQUIRED_ENV_VARS) {
  if (!process.env[v]) log.warn({ var: v }, `${v} not set — pipeline calls may fail`);
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

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  if (req.method !== 'POST' || (req.url !== '/api/constellation' && req.url !== '/api/skeleton')) {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let word: string;
  try {
    const parsed = JSON.parse(body) as { word?: unknown };
    if (typeof parsed.word !== 'string' || !parsed.word.trim()) throw new Error();
    word = parsed.word.trim().toLowerCase();
  } catch {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'word is required' }));
    return;
  }

  if (req.url === '/api/skeleton') {
    let pipelineResult: PipelineResult;
    if (cache.has(word)) {
      log.info({ word }, 'Cache hit (skeleton)');
      pipelineResult = cache.get(word)!;
    } else {
      log.info({ word }, 'Retrieving skeleton');
      pipelineResult = await retrieveSkeleton(word, API_KEY);
      if (pipelineResult.skeletons.length === 0) {
        res.writeHead(422);
        res.end(JSON.stringify({ error: 'No constellation found.' }));
        return;
      }
      cache.set(word, pipelineResult);
      log.info({ word }, 'Pipeline complete (skeleton)');
    }
    res.writeHead(200);
    res.end(JSON.stringify({ match: pipelineResult.match, skeletons: pipelineResult.skeletons }));
    return;
  }

  if (cache.has(word)) {
    log.info({ word }, 'Cache hit');
    const cached = cache.get(word)!;
    const catalogue = getCatalogue();
    const matchResult = match(catalogue, cached.skeletons);
    if (!matchResult) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'matching failed' }));
      return;
    }
    const skeleton = cached.skeletons[matchResult.variantIndex ?? 0];
    res.writeHead(200);
    res.end(JSON.stringify({ constellation: matchResult, skeleton, match: cached.match }));
    return;
  }

  log.info({ word }, 'Retrieving skeleton');
  const result = await retrieveSkeleton(word, API_KEY);

  if (result.match === null) {
    res.writeHead(422);
    res.end(JSON.stringify({ error: 'No constellation found.' }));
    return;
  }

  cache.set(word, result);

  log.info({ word, layer: result.match.layer, source: result.match.source }, 'Pipeline complete');

  const catalogue = getCatalogue();
  const matchResult = match(catalogue, result.skeletons);

  if (!matchResult) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: 'matching failed — no patch found' }));
    return;
  }

  const skeleton = result.skeletons[matchResult.variantIndex ?? 0];

  const durationMs = Date.now() - t0;
  log.info({ word, durationMs, layer: result.match?.layer ?? 'fallback' }, 'Request complete');

  res.writeHead(200);
  res.end(JSON.stringify({ constellation: matchResult, skeleton, match: result.match }));
});

server.listen(PORT, () => {
  log.info({ port: PORT }, `API server running at http://localhost:${PORT}`);
});
