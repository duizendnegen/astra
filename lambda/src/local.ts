// Local development server — replaces Lambda + DynamoDB + SSM for local testing.
// Usage: npm run dev:local
// Reads OPENROUTER_API_KEY from environment (via .env.local in project root).

import http from 'http';
import path from 'path';
import { retrieveSkeleton, getSharedIndex } from './retrieval.js';
import type { PipelineResult } from './retrieval.js';

const PORT = 3001;
const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
// Default: data/ lives one level above the lambda/ working directory
const INDEX_PATH = process.env.INDEX_PATH ?? path.resolve(process.cwd(), '..', 'data', 'icon-index.sqlite');

if (!API_KEY) {
  console.warn('[local] OPENROUTER_API_KEY not set — LLM calls will fail. Set it in .env.local.');
}

// Open SQLite index once at startup
let db: ReturnType<typeof getSharedIndex>;
try {
  db = getSharedIndex(INDEX_PATH);
  console.log(`[local] Icon index loaded from ${INDEX_PATH}`);
} catch (err) {
  console.error(`[local] Failed to open icon index at ${INDEX_PATH}: ${err}`);
  console.error('[local] Run: cd scripts && npm install && OPENROUTER_API_KEY=<key> npx tsx build-index.ts');
  process.exit(1);
}

// In-memory cache (keyed by word — retrieval pipeline is deterministic for same index)
const cache = new Map<string, PipelineResult>();

const server = http.createServer(async (req, res) => {
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

  if (req.method !== 'POST' || req.url !== '/api/skeleton') {
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

  if (cache.has(word)) {
    console.log(`[local] cache hit: ${word}`);
    const cached = cache.get(word)!;
    res.writeHead(200);
    res.end(JSON.stringify({ skeletons: cached.skeletons, match: cached.match }));
    return;
  }

  console.log(`[local] retrieving skeleton: ${word}`);
  const result = await retrieveSkeleton(word, db, API_KEY);
  cache.set(word, result);

  console.log(`[local] "${word}" → layer ${result.match?.layer ?? 'fallback'}, source: ${result.match?.source ?? 'none'}`);
  res.writeHead(200);
  res.end(JSON.stringify({ skeletons: result.skeletons, match: result.match }));
});

server.listen(PORT, () => {
  console.log(`[local] API server running at http://localhost:${PORT}`);
});
