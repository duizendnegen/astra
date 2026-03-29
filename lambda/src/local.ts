// Local development server — replaces Lambda + DynamoDB + SSM for local testing.
// Usage: npm run dev:local
// Reads OPENROUTER_API_KEY from environment (via .env.local in project root).

import http from 'http';
import { generateSkeleton } from './core';

const PORT = 3001;
const API_KEY = process.env.OPENROUTER_API_KEY ?? '';

if (!API_KEY) {
  console.warn('[local] OPENROUTER_API_KEY not set — LLM calls will fail. Set it in .env.local.');
}

// In-memory skeleton cache (keyed by normalised word)
const cache = new Map<string, object>();

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
    res.writeHead(200);
    res.end(JSON.stringify(cache.get(word)));
    return;
  }

  console.log(`[local] generating skeleton: ${word}`);
  const skeletons = await generateSkeleton(word, API_KEY);
  const payload = { skeletons };
  cache.set(word, payload);
  res.writeHead(200);
  res.end(JSON.stringify(payload));
});

server.listen(PORT, () => {
  console.log(`[local] API server running at http://localhost:${PORT}`);
});
