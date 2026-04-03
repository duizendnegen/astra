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
import { TRIANGLE_FALLBACK, type Skeleton } from './core.js';
import { svgToSkeleton, rdpSimplify, visvalingamWhyatt, type SimplifyFn } from './svg-to-skeleton.js';
import path from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

export const THRESHOLD_PHOSPHOR = parseFloat(process.env.THRESHOLD_PHOSPHOR ?? '0.87');
export const THRESHOLD_PHYLOPIC = parseFloat(process.env.THRESHOLD_PHYLOPIC ?? '0.55');

const EMBED_MODEL = 'openai/text-embedding-3-small';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Disk cache for L5 sub-steps during local development.
// Resolves relative to the working directory (expected: lambda/ when running dev:local).
const L5_DISK_CACHE = process.env.NODE_ENV !== 'production'
  ? path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data'), 'l5-cache')
  : undefined;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchProvenance {
  source: 'phosphor' | 'phylopic' | 'llm';
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

  // Basic English lemmatisation rules (covers the common cases without a full NLP dep)
  // compromise.js can be swapped in if more coverage is needed
  w = w
    .replace(/ies$/, 'y')        // butterflies → butterfly
    .replace(/(?<=[^aeiou])s$/, '') // towers → tower (not "bus")
    .replace(/ing$/, '')         // running → runn → handled below
    .replace(/tion$/, '')
    .replace(/er$/, '');

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
      console.log(`[retrieval] embed HTTP ${res.status}`);
      return texts.map(() => null);
    }
    const data = (await res.json()) as { data?: { embedding: number[]; index: number }[] };
    const elapsed = Date.now() - t0;
    console.log(`[retrieval] embed ${texts.length} texts in ${elapsed}ms`);
    const ordered = new Array<Float32Array | null>(texts.length).fill(null);
    for (const item of data.data ?? []) {
      ordered[item.index] = new Float32Array(item.embedding);
    }
    return ordered;
  } catch (err) {
    console.log(`[retrieval] embed error: ${err}`);
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

// Pre-compiled statement cached at module level for efficiency
let _searchStmt: ReturnType<Database.Database['prepare']> | null = null;
function getSearchStmt(db: Database.Database) {
  if (!_searchStmt) {
    // Phosphor-only search for now. Phylopic SVGs are filled silhouettes that produce
    // poor skeletons with the current L5 extractor (designed for stroke-based icons).
    // Re-enable Phylopic once L5 handles filled paths (stroke extraction / contour tracing).
    // vec_distance_cosine() returns L2 distance; sort ascending in JS and convert to similarity.
    _searchStmt = db.prepare(`
      SELECT v.id, vec_distance_cosine(v.embedding, vec_f32(:buf)) AS dist,
             e.source, e.label, e.tags, e.svg_path
      FROM vectors v
      JOIN entries e ON e.id = v.id
      WHERE e.source = 'phosphor'
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
  console.log(`[retrieval] index search ${rows.length} rows in ${Date.now()-t0}ms, top sim: ${top[0] ? (1 - top[0].dist*top[0].dist/2).toFixed(3) : 'none'}`);

  return top.map((r) => ({
    entry: { id: r.id, source: r.source, label: r.label, tags: r.tags, svg_path: r.svg_path },
    // Convert L2 distance to cosine similarity for unit-norm embeddings
    similarity: 1 - (r.dist * r.dist) / 2,
  }));
}

function thresholdFor(source: string): number {
  return source === 'phosphor' ? THRESHOLD_PHOSPHOR : THRESHOLD_PHYLOPIC;
}

function bestAboveThreshold(results: SearchResult[]): SearchResult | null {
  for (const r of results) {
    if (r.similarity >= thresholdFor(r.entry.source)) return r;
  }
  return null;
}

// ── L3 — LLM concept mapping ──────────────────────────────────────────────────

const L3_PROMPT = (word: string) =>
  `Give 5 synonyms and visual representations of "${word}".
Translate to English first if the word is not English.
Think about what simple object or animal best represents "${word}" as a symbolic silhouette.
Return single nouns only as a JSON array of strings. Example: ["dog","wolf","fox","hound","canine"]
MUST respond with ONLY a JSON array, no explanation.`;

async function l3Candidates(word: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SKELETON_MODEL ?? 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: L3_PROMPT(word) }],
        response_format: { type: 'json_object' },
      }),
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

// Few-shot examples from Phosphor icons to ground the abstraction level
const FEW_SHOT = `Examples of good simple SVGs:
Heart: <svg viewBox="0 0 256 256"><path d="M128,220a12,12,0,0,1-8.49-3.52l-86-86a60,60,0,0,1,84.87-84.87L128,55.48l9.63-9.62a60,60,0,0,1,84.87,84.87l-86,86A12,12,0,0,1,128,220Z"/></svg>
Star: <svg viewBox="0 0 256 256"><path d="M234.5,114.38l-45.1,39.36,13.51,58.6a16,16,0,0,1-23.84,17.34l-51.11-31-51,31a16,16,0,0,1-23.84-17.34L66.61,153.8,21.5,114.38a16,16,0,0,1,9.11-28.06l58.83-5.91,23-55.47a15.92,15.92,0,0,1,29.12,0l23,55.47,58.83,5.91a16,16,0,0,1,9.11,28.06Z"/></svg>`;

const L4_PROMPT = (word: string) =>
  `Generate a simple SVG silhouette for the word "${word}".

Rules:
- Use a single <path> element with stroke only, no fill
- viewBox should be "0 0 256 256"
- Draw the most iconic, universally recognisable form of "${word}"
- Clean outline, no interior lines, no decoration
- Aim for the complexity of an emoji or street sign

${FEW_SHOT}

MUST respond with ONLY a complete <svg>...</svg> string, no explanation.`;

async function l4GenerateSvg(word: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SKELETON_MODEL ?? 'anthropic/claude-haiku-4.5',
        messages: [{ role: 'user', content: L4_PROMPT(word) }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    // Extract SVG block
    const m = content.match(/<svg[\s\S]*?<\/svg>/i);
    return m?.[0] ?? null;
  } catch {
    return null;
  }
}

// ── L5 — SVG → Skeleton ────────────────────────────────────────────────────────

const SIMPLIFIERS: Record<string, SimplifyFn> = {
  rdp: rdpSimplify,
  visvalingam: visvalingamWhyatt,
};

export function svgToSkeletonWithOpts(svgOrPath: string): Skeleton | null {
  const algorithmName = process.env.SIMPLIFY_ALGORITHM ?? 'rdp';
  const simplifyFn = SIMPLIFIERS[algorithmName] ?? rdpSimplify;
  const epsilon = parseFloat(process.env.SIMPLIFY_EPSILON ?? '0.02');

  return svgToSkeleton(svgOrPath, {
    simplify: simplifyFn,
    algorithmName,
    epsilon,
    diskCacheDir: L5_DISK_CACHE,
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
  console.log(`[retrieval] "${word}" → normalised: "${normalised}"`);

  // L1: embed + search
  const queryVec = await embed(normalised, apiKey);
  if (queryVec) {
    const results = searchIndex(db, queryVec);
    const best = bestAboveThreshold(results);
    if (best) {
      console.log(`[retrieval] L1 hit: ${best.entry.id} (${best.similarity.toFixed(3)}) ${elapsed()}`);
      const skeleton = svgToSkeletonWithOpts(best.entry.svg_path);
      if (skeleton) {
        console.log(`[retrieval] L1 skeleton ok ${elapsed()}`);
        return {
          match: {
            source: best.entry.source as 'phosphor' | 'phylopic',
            id: best.entry.id,
            similarity: best.similarity,
            layer: 1,
            svgPath: best.entry.svg_path,
          },
          skeletons: [skeleton],
        };
      }
      console.log(`[retrieval] L1 skeleton null (svg len ${best.entry.svg_path.length}) ${elapsed()}`);
    } else {
      console.log(`[retrieval] L1 miss (best: ${results[0]?.similarity.toFixed(3) ?? 'none'}) ${elapsed()}`);
    }
  }

  // L3: LLM concept mapping — batch embed all candidates in one call
  const candidates = await l3Candidates(normalised, apiKey);
  console.log(`[retrieval] L3 candidates: ${candidates.join(', ')} ${elapsed()}`);

  if (candidates.length > 0) {
    const vecs = await embedBatch(candidates, apiKey);
    console.log(`[retrieval] L3 batch embed done ${elapsed()}`);
    for (let i = 0; i < candidates.length; i++) {
      const vec = vecs[i];
      if (!vec) continue;
      const results = searchIndex(db, vec);
      const best = bestAboveThreshold(results);
      if (best) {
        console.log(`[retrieval] L3 hit via "${candidates[i]}": ${best.entry.id} (${best.similarity.toFixed(3)}) ${elapsed()}`);
        const skeleton = svgToSkeletonWithOpts(best.entry.svg_path);
        if (skeleton) {
          return {
            match: {
              source: best.entry.source as 'phosphor' | 'phylopic',
              id: best.entry.id,
              similarity: best.similarity,
              layer: 3,
              svgPath: best.entry.svg_path,
            },
            skeletons: [skeleton],
          };
        }
        console.log(`[retrieval] L3 skeleton null for "${candidates[i]}" ${elapsed()}`);
      }
    }
  }
  console.log(`[retrieval] L3 miss ${elapsed()}`);

  // L4: LLM SVG generation
  const svg = await l4GenerateSvg(normalised, apiKey);
  if (svg) {
    console.log(`[retrieval] L4 SVG generated (${svg.length} chars) ${elapsed()}`);
    const skeleton = svgToSkeletonWithOpts(svg);
    if (skeleton) {
      return {
        match: {
          source: 'llm',
          id: `llm:${normalised}`,
          similarity: 0,
          layer: 4,
          svgPath: svg,
        },
        skeletons: [skeleton],
      };
    }
    console.log(`[retrieval] L4 skeleton null ${elapsed()}`);
  }

  // Fallback
  console.log(`[retrieval] all layers failed — returning triangle fallback ${elapsed()}`);
  return { match: null, skeletons: [TRIANGLE_FALLBACK] };
}
