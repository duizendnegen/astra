/**
 * retrieval.ts
 *
 * Word → Skeleton retrieval pipeline:
 *   L0  Local normalisation (lowercase, strip punctuation, lemmatise)
 *   L1  Direct embedding match against Pinecone vector index + S3 SVG fetch
 *   L3  LLM concept mapping (synonyms + visual representations + translate)
 *   L4  LLM SVG generation (last resort)
 *   L5  SVG → Skeleton (via svg-to-skeleton.ts)
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import * as potrace from 'potrace';
import type { Skeleton } from './core.js';
import { svgToSkeleton, rdpSimplify, visvalingamWhyatt, type SimplifyFn } from './svg-to-skeleton.js';
import { createLogger } from './logger.js';
import path from 'path';

const log = createLogger('retrieval');

// ── Config ────────────────────────────────────────────────────────────────────

// Calibrated for text-embedding-3-small with label-only embed text (icon name, no tags).
// Exact-name queries score 1.0; direct semantic near-matches 0.60–0.92; noise < 0.45.
// L1 threshold (0.90) is strict: only very close direct hits pass to avoid false positives.
// L3 threshold (0.80) is looser: the LLM already disambiguated meaning, so we accept
// near-synonyms from the candidate list (e.g. banana→fruit→apple at 0.82 is fine,
// banana→star-and-crescent at 0.689 is not).
export const THRESHOLD_PHOSPHOR = parseFloat(process.env.THRESHOLD_PHOSPHOR ?? '0.90');
export const THRESHOLD_PHOSPHOR_L3 = parseFloat(process.env.THRESHOLD_PHOSPHOR_L3 ?? '0.80');
export const THRESHOLD_PHYLOPIC = parseFloat(process.env.THRESHOLD_PHYLOPIC ?? '0.55');
export const THRESHOLD_CUSTOM = parseFloat(process.env.THRESHOLD_CUSTOM ?? '0.85');

// Sources to query in L1. Comma-separated; default includes phosphor and custom.
const L1_SOURCES: string[] = (process.env.L1_SOURCES ?? 'phosphor,custom')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const EMBED_MODEL = 'openai/text-embedding-3-small';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const L4_IMAGE_MODEL = process.env.L4_IMAGE_MODEL ?? 'google/gemini-2.5-flash-image';

const L5_DISK_CACHE = process.env.NODE_ENV !== 'production'
  ? path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), '..', 'data'), 'l5-cache')
  : undefined;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchProvenance {
  source: 'phosphor' | 'phylopic' | 'custom' | 'generated';
  id: string;
  similarity: number;
  layer: 1 | 3 | 4;
  svgPath: string;
}

export interface PipelineResult {
  match: MatchProvenance | null;
  skeletons: Skeleton[];
}

interface PineconeMatch {
  id: string;
  score: number;
  metadata?: { source?: string; label?: string; tags?: string };
}

// ── Pinecone + S3 client initialisation ──────────────────────────────────────
// Clients are initialised once at module load (standard Lambda best practice).
// API key resolution is lazy-async: the promise is kicked off immediately so
// that on warm invocations the key is already resolved.

const s3 = new S3Client(
  process.env.AWS_ENDPOINT_URL
    ? { endpoint: process.env.AWS_ENDPOINT_URL, forcePathStyle: true, region: process.env.AWS_REGION ?? 'us-east-1' }
    : {},
);

let _pineconeIndex: ReturnType<InstanceType<typeof Pinecone>['index']> | null = null;

const _pineconeReady: Promise<void> = (async () => {
  try {
    let apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      const ssm = new SSMClient({ region: process.env.AWS_REGION ?? 'eu-central-1' });
      const res = await ssm.send(new GetParameterCommand({
        Name: process.env.PINECONE_API_KEY_PARAM!,
        WithDecryption: true,
      }));
      apiKey = res.Parameter?.Value ?? '';
    }
    const indexName = process.env.PINECONE_INDEX_NAME ?? 'astra-icons';
    const controllerHost = process.env.PINECONE_CONTROLLER_HOST;
    const dataHost = process.env.PINECONE_HOST;
    const pc = controllerHost
      ? new Pinecone({ apiKey, controllerHostUrl: controllerHost })
      : new Pinecone({ apiKey });
    _pineconeIndex = dataHost
      ? pc.index(indexName, dataHost)
      : pc.index(indexName);
  } catch (err) {
    log.error({ err }, 'Pinecone init failed');
  }
})();

async function getPineconeIndex() {
  await _pineconeReady;
  return _pineconeIndex;
}

// ── S3 SVG fetch ──────────────────────────────────────────────────────────────

async function fetchSvgFromS3(id: string): Promise<string | null> {
  const bucket = process.env.ICONS_BUCKET_NAME;
  if (!bucket) {
    log.warn('ICONS_BUCKET_NAME not set — cannot fetch SVG');
    return null;
  }
  const key = id.replace(':', '/');
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!res.Body) return null;
    return await res.Body.transformToString('utf-8');
  } catch (err) {
    log.warn({ err, key }, 'S3 GetObject failed');
    return null;
  }
}

// ── L0 — Normalisation ────────────────────────────────────────────────────────

/** Lowercase, strip punctuation, lemmatise (basic suffix rules without compromise for Lambda compat). */
export function normalise(word: string): string {
  let w = word.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();

  w = w
    .replace(/ies$/, 'y')
    .replace(/(?<=[^aeiou])s$/, '');

  w = w.trim();
  return w.length > 0 ? w : word.toLowerCase();
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embed(text: string, apiKey: string): Promise<number[] | null> {
  const results = await embedBatch([text], apiKey);
  return results[0] ?? null;
}

async function embedBatch(texts: string[], apiKey: string): Promise<(number[] | null)[]> {
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
    const ordered = new Array<number[] | null>(texts.length).fill(null);
    for (const item of data.data ?? []) {
      ordered[item.index] = item.embedding;
    }
    return ordered;
  } catch (err) {
    log.error({ err }, 'embed error');
    return texts.map(() => null);
  }
}

// ── L1 — Pinecone search ──────────────────────────────────────────────────────

interface SearchResult {
  id: string;
  source: string;
  similarity: number;
}

async function searchPinecone(queryVec: number[], topK = 5): Promise<SearchResult[]> {
  const index = await getPineconeIndex();
  if (!index) return [];

  const t0 = Date.now();
  try {
    const validSources = L1_SOURCES.filter((s) => /^[a-z0-9_]+$/i.test(s));
    const response = await index.query({
      vector: queryVec,
      topK,
      filter: { source: { $in: validSources } },
      includeMetadata: true,
    });
    const durationMs = Date.now() - t0;
    const matches = (response.matches ?? []) as PineconeMatch[];
    log.debug({ count: matches.length, durationMs, topScore: matches[0]?.score?.toFixed(3) ?? 'none' }, 'L1 Pinecone search');

    return matches.map((m) => ({
      id: m.id,
      source: String(m.metadata?.source ?? ''),
      similarity: m.score ?? 0,
    }));
  } catch (err) {
    log.error({ err }, 'Pinecone query error');
    return [];
  }
}

function thresholdFor(source: string): number {
  if (source === 'phosphor') return THRESHOLD_PHOSPHOR;
  if (source === 'custom') return THRESHOLD_CUSTOM;
  return THRESHOLD_PHYLOPIC;
}

function thresholdForL3(source: string): number {
  if (source === 'phosphor') return THRESHOLD_PHOSPHOR_L3;
  if (source === 'custom') return THRESHOLD_CUSTOM;
  return THRESHOLD_PHYLOPIC;
}

function bestAboveThreshold(results: SearchResult[]): SearchResult | null {
  for (const r of results) {
    if (r.similarity >= thresholdFor(r.source)) return r;
  }
  return null;
}

function bestAboveThresholdL3(results: SearchResult[]): SearchResult | null {
  for (const r of results) {
    if (r.similarity >= thresholdForL3(r.source)) return r;
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
    const vals = Object.values(parsed as object);
    const arr = vals.find(Array.isArray) as unknown[] | undefined;
    return (arr ?? []).filter((x): x is string => typeof x === 'string').slice(0, 5);
  } catch {
    return [];
  }
}

// ── L4 — Image generation + Potrace tracing ───────────────────────────────────

const L4_IMAGE_PROMPT = (word: string) =>
  `Simple black line drawing of "${word}" as an icon on white background. Single element, minimum amount of strokes. Clean outlines only, no fill, no shading, no text.`;

export async function l4GenerateFromImage(word: string, apiKey: string, signal?: AbortSignal): Promise<Buffer | null> {
  try {
    const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: L4_IMAGE_MODEL,
        messages: [{ role: 'user', content: L4_IMAGE_PROMPT(word) }],
      }),
      signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      log.warn({ status: res.status, model: L4_IMAGE_MODEL, body: body.slice(0, 200) }, 'L4 image gen HTTP error');
      return null;
    }
    const data = (await res.json()) as {
      choices?: {
        message?: {
          content?: unknown;
          images?: { type: string; image_url?: { url: string } }[];
        };
      }[];
    };
    const msg = data.choices?.[0]?.message;
    for (const img of msg?.images ?? []) {
      if (img.image_url?.url) {
        const match = img.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (match) return Buffer.from(match[1], 'base64');
      }
    }
    log.warn({ msgKeys: JSON.stringify(Object.keys(msg ?? {})) }, 'L4 image gen: no image in response');
    return null;
  } catch (err) {
    if ((err as { name?: string }).name !== 'AbortError') {
      log.warn({ err }, 'L4 image gen fetch error');
    }
    return null;
  }
}

export function traceWithPotrace(pngBuffer: Buffer): Promise<string | null> {
  return new Promise((resolve) => {
    potrace.trace(pngBuffer, (err: Error | null, svg: string) => {
      if (err) {
        log.warn({ err }, 'Potrace trace failed');
        resolve(null);
      } else {
        resolve(svg);
      }
    });
  });
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
  apiKey: string,
): Promise<PipelineResult> {
  const t0 = Date.now();

  // L0: normalise
  const normalised = normalise(word);
  log.debug({ word, normalised }, 'L0 normalised');

  // L1: embed + Pinecone search + S3 SVG fetch
  const queryVec = await embed(normalised, apiKey);
  if (queryVec) {
    const results = await searchPinecone(queryVec);
    const best = bestAboveThreshold(results);
    if (best) {
      log.info({ id: best.id, similarity: best.similarity.toFixed(3), durationMs: Date.now() - t0 }, 'L1 hit');
      const svgContent = await fetchSvgFromS3(best.id);
      if (svgContent) {
        const skeleton = svgToSkeletonWithOpts(svgContent);
        if (skeleton) {
          log.debug({ durationMs: Date.now() - t0 }, 'L1 skeleton ok');
          return {
            match: {
              source: best.source as 'phosphor' | 'phylopic' | 'custom',
              id: best.id,
              similarity: best.similarity,
              layer: 1,
              svgPath: svgContent,
            },
            skeletons: [skeleton],
          };
        }
        log.warn({ svgLen: svgContent.length, durationMs: Date.now() - t0 }, 'L1 skeleton null');
      } else {
        log.warn({ id: best.id, durationMs: Date.now() - t0 }, 'L1 S3 fetch failed');
      }
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

  const timer = setTimeout(() => {
    timerFired = true;
    if (l4Done) l3Controller.abort();
  }, 5000);

  const l4Task = (async () => {
    const pngBuffer = await l4GenerateFromImage(normalised, apiKey, l4Controller.signal);
    l4Done = true;
    if (timerFired) l3Controller.abort();
    if (pngBuffer) {
      log.debug({ bytes: pngBuffer.length, durationMs: Date.now() - t0 }, 'L4 PNG generated');
      const svg = await traceWithPotrace(pngBuffer);
      if (svg) {
        log.debug({ svgLen: svg.length, durationMs: Date.now() - t0 }, 'L4 Potrace SVG traced');
        const skeleton = svgToSkeletonWithOpts(svg);
        if (skeleton) {
          l4Result = {
            match: { source: 'generated', id: `generated:${normalised}`, similarity: 0, layer: 4, svgPath: svg },
            skeletons: [skeleton],
          };
        } else {
          log.warn({ durationMs: Date.now() - t0 }, 'L4 skeleton null');
        }
      }
    }
  })();

  const l3Task = (async (): Promise<PipelineResult | null> => {
    const candidates = await l3Candidates(normalised, apiKey, l3Controller.signal);
    log.debug({ candidates, durationMs: Date.now() - t0 }, 'L3 candidates');

    if (candidates.length > 0) {
      const vecs = await embedBatch(candidates, apiKey);
      log.debug({ durationMs: Date.now() - t0 }, 'L3 batch embed done');
      for (let i = 0; i < candidates.length; i++) {
        const vec = vecs[i];
        if (!vec) continue;
        const results = await searchPinecone(vec);
        const best = bestAboveThresholdL3(results);
        if (best) {
          log.info({ via: candidates[i], id: best.id, similarity: best.similarity.toFixed(3), durationMs: Date.now() - t0 }, 'L3 hit');
          const svgContent = await fetchSvgFromS3(best.id);
          if (svgContent) {
            const skeleton = svgToSkeletonWithOpts(svgContent);
            if (skeleton) {
              clearTimeout(timer);
              l4Controller.abort();
              return {
                match: { source: best.source as 'phosphor' | 'phylopic' | 'custom', id: best.id, similarity: best.similarity, layer: 3, svgPath: svgContent },
                skeletons: [skeleton],
              };
            }
            log.warn({ via: candidates[i], durationMs: Date.now() - t0 }, 'L3 skeleton null');
          } else {
            log.warn({ via: candidates[i], id: best.id, durationMs: Date.now() - t0 }, 'L3 S3 fetch failed');
          }
        }
      }
    }
    log.info({ durationMs: Date.now() - t0 }, 'L3 miss');
    return null;
  })();

  const l3Result = await l3Task;

  if (l3Result !== null) {
    await l4Task;
    return l3Result;
  }

  clearTimeout(timer);
  await l4Task;

  if (l4Result !== null) {
    return l4Result;
  }

  log.warn({ durationMs: Date.now() - t0 }, 'All layers failed — no constellation found');
  return { match: null, skeletons: [] };
}
