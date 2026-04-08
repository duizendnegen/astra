/**
 * retrieval.ts
 *
 * Word → Skeleton retrieval pipeline:
 *   L0  Local normalisation (lowercase, strip punctuation, lemmatise)
 *   L1  Direct embedding match against SQLite icon index
 *   L3  LLM concept mapping (synonyms + visual representations + translate)
 *   L4  LLM SVG generation (last resort)
 *   L5  SVG → Skeleton (via svg-to-skeleton.ts)
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { Skeleton } from './core.js';
import { svgToSkeleton, rdpSimplify, visvalingamWhyatt, type SimplifyFn } from './svg-to-skeleton.js';
import { createLogger } from './logger.js';
import path from 'path';

const log = createLogger('retrieval');

// ── Config ────────────────────────────────────────────────────────────────────

export const THRESHOLD_PHOSPHOR = parseFloat(process.env.THRESHOLD_PHOSPHOR ?? '0.80');
export const THRESHOLD_PHYLOPIC = parseFloat(process.env.THRESHOLD_PHYLOPIC ?? '0.55');
export const THRESHOLD_CUSTOM = parseFloat(process.env.THRESHOLD_CUSTOM ?? '0.85');

// Sources to query in L1. Comma-separated; default includes phosphor and custom.
// Set L1_SOURCES=phosphor to restore pre-custom behaviour exactly.
const L1_SOURCES: string[] = (process.env.L1_SOURCES ?? 'phosphor,custom')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const EMBED_MODEL = 'openai/text-embedding-3-small';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const L4_MODEL = process.env.L4_MODEL ?? 'google/gemini-2.5-flash';

// Disk cache for L5 sub-steps during local development.
// Resolves relative to the working directory (expected: lambda/ when running dev:local).
const L5_DISK_CACHE = process.env.NODE_ENV !== 'production'
  ? path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data'), 'l5-cache')
  : undefined;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchProvenance {
  source: 'phosphor' | 'phylopic' | 'custom' | 'llm';
  id: string;
  similarity: number;
  layer: 1 | 3 | 4;
  svgPath: string;
}

export interface PipelineResult {
  match: MatchProvenance | null;
  skeletons: Skeleton[];
}

interface IndexEntry {
  id: string;
  source: string;
  label: string;
  tags: string;
  svg_path: string;
}

// ── Database helpers ──────────────────────────────────────────────────────────

let _db: Database.Database | null = null;

export function openIndex(dbPath: string): Database.Database {
  const db = new Database(dbPath, { readonly: true });
  sqliteVec.load(db);
  return db;
}

// Default path resolves relative to cwd (lambda/ when running dev:local, /tmp in Lambda).
const DEFAULT_INDEX_PATH = path.resolve(
  process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data'),
  'icon-index.sqlite',
);

export function getSharedIndex(dbPath?: string): Database.Database {
  if (!_db) _db = openIndex(dbPath ?? DEFAULT_INDEX_PATH);
  return _db;
}

// ── L0 — Normalisation ────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, lemmatise (basic suffix rules without compromise for Lambda compat). */
export function normalise(word: string): string {
  // Lowercase and strip punctuation
  let w = word.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  // Conservative plural normalisation only — aggressive suffix rules (ing, tion, er)
  // were removed because they corrupt non-English words (e.g. "Faultier" → "faulti")
  // and common English words (e.g. "ring" → "r", "tower" → "tow"). Embeddings handle
  // morphological variation without explicit stemming.
  w = w
    .replace(/ies$/, 'y')           // butterflies → butterfly
    .replace(/(?<=[^aeiou])s$/, ''); // cars → car, dogs → dog (not "bus", "gas")

  // Re-trim after suffix removal
  w = w.trim();
  return w.length > 0 ? w : word.toLowerCase();
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text: string, apiKey: string): Promise<Float32Array | null> {
  const results = await embedBatch([text], apiKey);
  return results[0] ?? null;
}

/** Embed multiple texts in a single API call. */
async function embedBatch(texts: string[], apiKey: string): Promise<(Float32Array | null)[]> {
  if (texts.length === 0) return [];
  try {
    const t0 = Date.now();
    const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
    if (!res.ok) {
      log.warn({ status: res.status }, 'embed HTTP error');
      return texts.map(() => null);
    }
    const data = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const durationMs = Date.now() - t0;
    log.debug({ count: texts.length, durationMs }, 'embed complete');
    const ordered = new Array<Float32Array | null>(texts.length).fill(null);
    for (const item of data.data ?? []) {
      ordered[item.index] = new Float32Array(item.embedding);
    }
    return ordered;
  } catch (err) {
    log.error({ err }, 'embed error');
    return texts.map(() => null);
  }
}

// ── L1 — Index search ─────────────────────────────────────────────────────────

interface SearchResult {
  entry: IndexEntry;
  similarity: number;
}

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-10 ? 0 : dot / denom;
}

// Pre-compiled statement cached at module level for efficiency.
// Invalidated when L1_SOURCES changes (static at module load, so no invalidation needed).
let _searchStmt: ReturnType<Database.Database['prepare']> | null = null;
function getSearchStmt(db: Database.Database) {
  if (!_searchStmt) {
    // Build WHERE clause from L1_SOURCES. Source names are validated as alphanumeric
    // at parse time so interpolation is safe (no SQL injection risk).
    // vec_distance_cosine() returns L2 distance; sorted ascending in JS then converted to similarity.
    //
    // Note: vec0 ANN (MATCH) was investigated but corpus-mixing across sources caused issues.
    // Full-scan is acceptable: L1 is only on the critical path for hits, and L3/L4 run in parallel.
    // See l1-ann-investigation.md.
    const validSources = L1_SOURCES.filter((s) => /^[a-z0-9_]+$/i.test(s));
    const inClause = validSources.map((s) => `'${s}'`).join(', ');
    _searchStmt = db.prepare(`
      SELECT v.id, vec_distance_cosine(v.embedding, vec_f32(:buf)) AS dist,
             e.source, e.label, e.tags, e.svg_path
      FROM vectors v
      JOIN entries e ON e.id = v.id
      WHERE e.source IN (${inClause})
    `);
  }
  return _searchStmt;
}

function searchIndex(db: Database.Database, queryVec: Float32Array, topK = 5): SearchResult[] {
  const buf = Buffer.from(queryVec.buffer, queryVec.byteOffset, queryVec.byteLength);

  const t0 = Date.now();
  const rows = getSearchStmt(db).all({ buf }) as (IndexEntry & { dist: number })[];
  // Sort by cosine distance ascending, take topK
  rows.sort((a, b) => a.dist - b.dist);
  const top = rows.slice(0, topK);
  const durationMs = Date.now() - t0;
  log.debug({ rows: rows.length, durationMs, topSim: top[0] ? (1 - top[0].dist * top[0].dist / 2).toFixed(3) : 'none' }, 'L1 index search');

  return top.map((r) => ({
    entry: { id: r.id, source: r.source, label: r.label, tags: r.tags, svg_path: r.svg_path },
    // Convert L2 distance to cosine similarity for unit-norm embeddings
    similarity: 1 - (r.dist * r.dist) / 2,
  }));
}

function thresholdFor(source: string): number {
  if (source === 'phosphor') return THRESHOLD_PHOSPHOR;
  if (source === 'custom') return THRESHOLD_CUSTOM;
  return THRESHOLD_PHYLOPIC;
}

function bestAboveThreshold(results: SearchResult[]): SearchResult | null {
  for (const r of results) {
    if (r.similarity >= thresholdFor(r.entry.source)) return r;
  }
  return null;
}

// ── L3 — LLM concept mapping ──────────────────────────────────────────────────

const L3_PROMPT = (word: string) =>
  `List 5 single nouns that visually represent "${word}" — synonyms, categories, or iconic objects.\nReturn ONLY a JSON array of strings, e.g. ["cat","tiger","paw","whisker","feline"]. No explanation.`;

async function l3Candidates(word: string, apiKey: string, signal?: AbortSignal): Promise<string[]> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SKELETON_MODEL ?? 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: L3_PROMPT(word) }],
      }),
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    const stripped = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(stripped);
    if (Array.isArray(parsed)) return (parsed as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 5);
    // Some models return { candidates: [...] } or similar
    const vals = Object.values(parsed as object);
    const arr = vals.find(Array.isArray) as unknown[] | undefined;
    return (arr ?? []).filter((x): x is string => typeof x === 'string').slice(0, 5);
  } catch {
    return [];
  }
}

// ── L4 — LLM SVG generation ───────────────────────────────────────────────────

const L4_PROMPT = (word: string) =>
  `Draw "${word} as an SVG". No colours.\nReturn ONLY the complete <svg>...</svg> element. No explanation, no markdown.`;

async function l4GenerateSvg(word: string, apiKey: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: L4_MODEL,
        messages: [{ role: 'user', content: L4_PROMPT(word) }],
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn({ status: res.status, model: L4_MODEL, body: body.slice(0, 200) }, 'L4 HTTP error');
      return null;
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    // Extract SVG block
    const m = content.match(/<svg[\s\S]*?<\/svg>/i);
    return m?.[0] ?? null;
  } catch (err) {
    if ((err as { name?: string }).name !== 'AbortError') {
      log.warn({ err }, 'L4 fetch error');
    }
    return null;
  }
}

// ── L5 — SVG → Skeleton ────────────────────────────────────────────────────────

const SIMPLIFIERS: Record<string, SimplifyFn> = {
  rdp: rdpSimplify,
  visvalingam: visvalingamWhyatt,
};

export function svgToSkeletonWithOpts(svgOrPath: string, source?: string): Skeleton | null {
  const algorithmName = process.env.SIMPLIFY_ALGORITHM ?? 'rdp';
  const simplifyFn = SIMPLIFIERS[algorithmName] ?? rdpSimplify;
  const epsilon = parseFloat(process.env.SIMPLIFY_EPSILON ?? '0.02');

  return svgToSkeleton(svgOrPath, {
    simplify: simplifyFn,
    algorithmName,
    epsilon,
    diskCacheDir: L5_DISK_CACHE,
    strategy: source === 'phosphor' ? 'polygon-union' : 'concave-hull',
  });
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function retrieveSkeleton(
  word: string,
  db: Database.Database,
  apiKey: string,
): Promise<PipelineResult> {
  const t0 = Date.now();
  const elapsed = () => `+${Date.now() - t0}ms`;

  // L0: normalise
  const normalised = normalise(word);
  log.debug({ word, normalised }, 'L0 normalised');

  // L1: embed + search
  const queryVec = await embed(normalised, apiKey);
  if (queryVec) {
    const results = searchIndex(db, queryVec);
    const best = bestAboveThreshold(results);
    if (best) {
      log.info({ id: best.entry.id, similarity: best.similarity.toFixed(3), durationMs: Date.now() - t0 }, 'L1 hit');
      const skeleton = svgToSkeletonWithOpts(best.entry.svg_path, best.entry.source);
      if (skeleton) {
        log.debug({ durationMs: Date.now() - t0 }, 'L1 skeleton ok');
        return {
          match: {
            source: best.entry.source as 'phosphor' | 'phylopic' | 'custom',
            id: best.entry.id,
            similarity: best.similarity,
            layer: 1,
            svgPath: best.entry.svg_path,
          },
          skeletons: [skeleton],
        };
      }
      log.warn({ svgLen: best.entry.svg_path.length, durationMs: Date.now() - t0 }, 'L1 skeleton null');
    } else {
      log.info({ bestSim: results[0]?.similarity.toFixed(3) ?? 'none', durationMs: Date.now() - t0 }, 'L1 miss');
    }
  }

  // L3 + L4: parallel race with dual-flag cancellation
  let l4Done = false;
  let timerFired = false;
  let l4Result: PipelineResult | null = null;
  const l3Controller = new AbortController();
  const l4Controller = new AbortController();

  // 5s timer: when both timerFired and l4Done are set, abort L3
  const timer = setTimeout(() => {
    timerFired = true;
    if (l4Done) l3Controller.abort();
  }, 5000);

  // L4 task: runs concurrently; sets flags and stores result for use if L3 misses
  const l4Task = (async () => {
    const svg = await l4GenerateSvg(normalised, apiKey, l4Controller.signal);
    l4Done = true;
    if (timerFired) l3Controller.abort();
    if (svg) {
      log.debug({ svgLen: svg.length, durationMs: Date.now() - t0 }, 'L4 SVG generated');
      const skeleton = svgToSkeletonWithOpts(svg);
      if (skeleton) {
        l4Result = {
          match: { source: 'llm', id: `llm:${normalised}`, similarity: 0, layer: 4, svgPath: svg },
          skeletons: [skeleton],
        };
      } else {
        log.warn({ durationMs: Date.now() - t0 }, 'L4 skeleton null');
      }
    }
  })();

  // L3 task: wins immediately on a valid index result; abortable via l3Controller
  const l3Task = (async (): Promise<PipelineResult | null> => {
    const candidates = await l3Candidates(normalised, apiKey, l3Controller.signal);
    log.debug({ candidates, durationMs: Date.now() - t0 }, 'L3 candidates');

    if (candidates.length > 0) {
      const vecs = await embedBatch(candidates, apiKey);
      log.debug({ durationMs: Date.now() - t0 }, 'L3 batch embed done');
      for (let i = 0; i < candidates.length; i++) {
        const vec = vecs[i];
        if (!vec) continue;
        const results = searchIndex(db, vec);
        const best = bestAboveThreshold(results);
        if (best) {
          log.info({ via: candidates[i], id: best.entry.id, similarity: best.similarity.toFixed(3), durationMs: Date.now() - t0 }, 'L3 hit');
          const skeleton = svgToSkeletonWithOpts(best.entry.svg_path, best.entry.source);
          if (skeleton) {
            clearTimeout(timer);
            l4Controller.abort();
            return {
              match: { source: best.entry.source as 'phosphor' | 'phylopic' | 'custom', id: best.entry.id, similarity: best.similarity, layer: 3, svgPath: best.entry.svg_path },
              skeletons: [skeleton],
            };
          }
          log.warn({ via: candidates[i], durationMs: Date.now() - t0 }, 'L3 skeleton null');
        }
      }
    }
    log.info({ durationMs: Date.now() - t0 }, 'L3 miss');
    return null;
  })();

  // Await L3 (L4 runs concurrently and may abort L3 via timer + l4Done)
  const l3Result = await l3Task;

  if (l3Result !== null) {
    // L3 won — wait for L4 to settle (already aborted inside l3Task)
    await l4Task;
    return l3Result;
  }

  // L3 missed — clear timer (L3 is done, no longer needs aborting) and await L4
  clearTimeout(timer);
  await l4Task;

  if (l4Result !== null) {
    return l4Result;
  }

  log.warn({ durationMs: Date.now() - t0 }, 'All layers failed — no constellation found');
  return { match: null, skeletons: [] };
}
