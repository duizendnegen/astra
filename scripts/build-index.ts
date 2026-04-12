/**
 * build-index.ts
 *
 * Downloads Phosphor icons (and optionally Phylopic silhouettes), generates
 * embeddings for their labels, upserts vectors into Pinecone, and uploads SVG
 * content strings to S3 (keyed {source}/{name}).
 *
 * Reads from environment variables:
 *   OPENROUTER_API_KEY   — required for embeddings (or pass --dry-run)
 *   PINECONE_API_KEY     — Pinecone key (use "local" for local emulator)
 *   PINECONE_INDEX_NAME  — Pinecone index name
 *   PINECONE_HOST        — custom host (set for local emulator)
 *   ICONS_BUCKET_NAME    — S3 bucket for SVG storage
 *   AWS_ENDPOINT_URL     — S3 endpoint override (set for MinIO locally)
 *
 * Usage:
 *   OPENROUTER_API_KEY=<key> npx tsx scripts/build-index.ts
 *
 * Flags:
 *   --phosphor-only   Skip Phylopic ingestion
 *   --phylopic-only   Skip Phosphor ingestion
 *   --dry-run         Parse entries but skip embedding and upload API calls
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMBED_MODEL = 'openai/text-embedding-3-small';
const EMBED_DIMS = 1536;
const EMBED_BATCH_SIZE = 100;
const EMBED_RETRIES = 3;
const PINECONE_UPSERT_BATCH = parseInt(process.env.PINECONE_UPSERT_BATCH ?? '100', 10);
const PINECONE_FETCH_BATCH = 200;

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const PHOSPHOR_ONLY = args.includes('--phosphor-only');
const PHYLOPIC_ONLY = args.includes('--phylopic-only');
const DRY_RUN = args.includes('--dry-run');

const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
if (!API_KEY && !DRY_RUN) {
  console.error('ERROR: OPENROUTER_API_KEY env var is required (or pass --dry-run)');
  process.exit(1);
}

const PINECONE_API_KEY = process.env.PINECONE_API_KEY ?? '';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME ?? '';
const ICONS_BUCKET_NAME = process.env.ICONS_BUCKET_NAME ?? '';

if (!DRY_RUN) {
  if (!PINECONE_API_KEY) { console.error('ERROR: PINECONE_API_KEY env var is required'); process.exit(1); }
  if (!PINECONE_INDEX_NAME) { console.error('ERROR: PINECONE_INDEX_NAME env var is required'); process.exit(1); }
  if (!ICONS_BUCKET_NAME) { console.error('ERROR: ICONS_BUCKET_NAME env var is required'); process.exit(1); }
}

// ── Client setup ──────────────────────────────────────────────────────────────

function buildPineconeClient() {
  const controllerHost = process.env.PINECONE_CONTROLLER_HOST;
  return controllerHost
    ? new Pinecone({ apiKey: PINECONE_API_KEY || 'local', controllerHostUrl: controllerHost })
    : new Pinecone({ apiKey: PINECONE_API_KEY || 'placeholder' });
}

/** Create the local index if it doesn't exist yet (no-op for cloud). */
async function ensureIndex(pc: Pinecone): Promise<void> {
  if (!process.env.PINECONE_HOST) return;
  try {
    await pc.createIndex({
      name: PINECONE_INDEX_NAME,
      dimension: EMBED_DIMS,
      metric: 'cosine',
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
    });
    console.log(`  Created local index "${PINECONE_INDEX_NAME}"`);
  } catch (err: any) {
    // 409 = already exists — that's fine
    if (err?.status !== 409 && !String(err?.message ?? '').includes('already exists')) throw err;
  }
}

function buildS3Client(): S3Client {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  if (endpoint) {
    return new S3Client({ endpoint, forcePathStyle: true });
  }
  return new S3Client({});
}

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (DRY_RUN) return texts.map(() => new Float32Array(EMBED_DIMS));

  for (let attempt = 0; attempt < EMBED_RETRIES; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }

      const data = (await res.json()) as { data: { embedding: number[] }[] };
      return data.data.map((d) => new Float32Array(d.embedding));
    } catch (err) {
      if (attempt < EMBED_RETRIES - 1) {
        const wait = 2 ** attempt * 1000;
        console.warn(`  [embed] attempt ${attempt + 1} failed, retrying in ${wait}ms: ${err}`);
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.warn(`  [embed] batch failed after ${EMBED_RETRIES} attempts, skipping: ${err}`);
        return [];
      }
    }
  }
  return [];
}

// ── Incremental guard: fetch existing IDs from Pinecone ───────────────────────

async function fetchExistingIds(
  index: ReturnType<InstanceType<typeof Pinecone>['index']>,
  ids: string[],
): Promise<Set<string>> {
  if (DRY_RUN) return new Set();
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += PINECONE_FETCH_BATCH) {
    const batch = ids.slice(i, i + PINECONE_FETCH_BATCH);
    const result = await index.fetch(batch);
    for (const id of Object.keys(result.records ?? {})) {
      existing.add(id);
    }
  }
  return existing;
}

// ── Pinecone upsert + S3 upload ───────────────────────────────────────────────

interface Entry {
  id: string;
  source: string;
  label: string;
  tags: string;
  svgContent: string;
  embedText: string;
}

async function upsertEntries(
  index: ReturnType<InstanceType<typeof Pinecone>['index']>,
  s3: S3Client,
  entries: Entry[],
): Promise<void> {
  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((e) => e.embedText);
    const embeddings = await embedBatch(texts);
    if (embeddings.length === 0) continue;

    // Upsert vectors to Pinecone in sub-batches
    const vectors = batch
      .map((e, j) => embeddings[j] ? {
        id: e.id,
        values: Array.from(embeddings[j]),
        metadata: { source: e.source, label: e.label, tags: e.tags },
      } : null)
      .filter((v): v is NonNullable<typeof v> => v !== null);

    for (let k = 0; k < vectors.length; k += PINECONE_UPSERT_BATCH) {
      if (!DRY_RUN) {
        await index.upsert(vectors.slice(k, k + PINECONE_UPSERT_BATCH));
      }
    }

    // Upload SVG content to S3
    if (!DRY_RUN) {
      await Promise.all(
        batch.map(async (e) => {
          if (!e.svgContent) return;
          const key = e.id.replace(':', '/');
          await s3.send(new PutObjectCommand({
            Bucket: ICONS_BUCKET_NAME,
            Key: key,
            Body: e.svgContent,
            ContentType: 'image/svg+xml',
          }));
        }),
      );
    }

    const pct = Math.round(((i + batch.length) / entries.length) * 100);
    process.stdout.write(`\r  processed ${i + batch.length}/${entries.length} (${pct}%)`);
  }
  process.stdout.write('\n');
}

// ── Phosphor ingestion ────────────────────────────────────────────────────────

function kebabToLabel(name: string): string {
  return name.replace(/-/g, ' ');
}

const PHOSPHOR_ASSETS_DIR = new URL(
  './node_modules/@phosphor-icons/core/assets/regular/',
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function readPhosphorSvg(name: string): string {
  try {
    return fs.readFileSync(`${PHOSPHOR_ASSETS_DIR}${name}.svg`, 'utf-8');
  } catch {
    return '';
  }
}

async function ingestPhosphor(
  index: ReturnType<InstanceType<typeof Pinecone>['index']>,
  s3: S3Client,
): Promise<void> {
  console.log('\n[Phosphor] Starting ingestion...');

  const { icons } = await import('@phosphor-icons/core');

  // Collect all IDs and check which already exist in Pinecone
  const allIds = icons.map((icon) => `phosphor:${icon.name}`);
  console.log(`  Checking ${allIds.length} IDs against Pinecone...`);
  const existing = await fetchExistingIds(index, allIds);
  console.log(`  Found ${existing.size} existing, ${allIds.length - existing.size} to process`);

  const toProcess: Entry[] = [];
  for (const icon of icons) {
    const id = `phosphor:${icon.name}`;
    if (existing.has(id)) continue;

    const label = kebabToLabel(icon.name);
    const tags = (icon.tags ?? []).join(',');
    toProcess.push({
      id,
      source: 'phosphor',
      label,
      tags,
      svgContent: readPhosphorSvg(icon.name),
      embedText: label,
    });
  }

  if (toProcess.length === 0) {
    console.log('  All entries already indexed — nothing to do.');
    return;
  }

  console.log(`  Embedding and uploading ${toProcess.length} new entries...`);
  await upsertEntries(index, s3, toProcess);
}

// ── Phylopic ingestion ────────────────────────────────────────────────────────

const PHYLOPIC_API = 'https://api.phylopic.org';
const PHYLOPIC_CONCURRENCY = 8;

async function fetchWithBackoff(url: string, retries = 5): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) {
      const wait = 2 ** attempt * 2000;
      console.warn(`\n  [phylopic] 429 rate limit, waiting ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    return res;
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`);
}

async function fetchPhylopicSvg(uuid: string, build: number): Promise<string> {
  try {
    const res = await fetchWithBackoff(`${PHYLOPIC_API}/images/${uuid}?build=${build}`);
    if (!res.ok) return '';
    const data = (await res.json()) as { _links?: { vectorFile?: { href: string } } };
    const vectorUrl = data._links?.vectorFile?.href;
    if (!vectorUrl) return '';
    const svgRes = await fetch(vectorUrl);
    if (!svgRes.ok) return '';
    return await svgRes.text();
  } catch {
    return '';
  }
}

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

async function ingestPhylopic(
  index: ReturnType<InstanceType<typeof Pinecone>['index']>,
  s3: S3Client,
): Promise<void> {
  console.log('\n[Phylopic] Starting ingestion (this will take a while)...');

  const rootRes = await fetchWithBackoff(`${PHYLOPIC_API}/images`);
  if (!rootRes.ok) {
    console.warn(`  [phylopic] failed to fetch root: HTTP ${rootRes.status}`);
    return;
  }
  const rootData = (await rootRes.json()) as {
    build: number;
    totalItems: number;
    totalPages: number;
    itemsPerPage: number;
  };
  const { build, totalItems, totalPages } = rootData;
  console.log(`  Build: ${build}, Total images: ${totalItems}, Pages: ${totalPages}`);

  const toProcess: Entry[] = [];
  let skipped = 0;
  const pageIds: { uuid: string; label: string }[] = [];

  // Collect all IDs across pages for batch existence check
  for (let page = 0; page < totalPages; page++) {
    const pageRes = await fetchWithBackoff(`${PHYLOPIC_API}/images?build=${build}&page=${page}`);
    if (!pageRes.ok) {
      console.warn(`\n  [phylopic] page ${page} failed: HTTP ${pageRes.status}`);
      continue;
    }
    const pageData = (await pageRes.json()) as {
      _links: { items: { href: string; title: string }[] };
    };
    for (const item of pageData._links?.items ?? []) {
      const uuidMatch = item.href.match(/\/images\/([^?]+)/);
      if (!uuidMatch) continue;
      pageIds.push({ uuid: uuidMatch[1], label: item.title });
    }
    process.stdout.write(`\r  Fetched page ${page + 1}/${totalPages}`);
  }
  process.stdout.write('\n');

  // Batch-check existence
  const allIds = pageIds.map(({ uuid }) => `phylopic:${uuid}`);
  console.log(`  Checking ${allIds.length} IDs against Pinecone...`);
  const existing = await fetchExistingIds(index, allIds);
  console.log(`  Found ${existing.size} existing, ${allIds.length - existing.size} to process`);

  const newItems = pageIds.filter(({ uuid }) => !existing.has(`phylopic:${uuid}`));
  skipped = existing.size;

  // Fetch SVGs for new items concurrently
  if (newItems.length > 0) {
    console.log(`  Fetching SVGs for ${newItems.length} new items...`);
    const svgs = await pMap(
      newItems,
      ({ uuid }) => fetchPhylopicSvg(uuid, build),
      PHYLOPIC_CONCURRENCY,
    );
    for (let i = 0; i < newItems.length; i++) {
      toProcess.push({
        id: `phylopic:${newItems[i].uuid}`,
        source: 'phylopic',
        label: newItems[i].label,
        tags: '',
        svgContent: svgs[i],
        embedText: newItems[i].label,
      });
    }
  }

  console.log(`  Inserted: ${toProcess.length}, Skipped (already present): ${skipped}`);

  if (toProcess.length > 0) {
    console.log(`  Embedding and uploading ${toProcess.length} new entries...`);
    await upsertEntries(index, s3, toProcess);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('Building icon index → Pinecone + S3');
  if (DRY_RUN) console.log('(dry-run mode: no embedding, Pinecone, or S3 API calls)');

  const pc = buildPineconeClient();
  await ensureIndex(pc);
  const controllerHost = process.env.PINECONE_HOST;
  const index = controllerHost
    ? pc.index(PINECONE_INDEX_NAME, controllerHost)
    : pc.index(PINECONE_INDEX_NAME);
  const s3 = buildS3Client();

  if (!PHYLOPIC_ONLY) await ingestPhosphor(index, s3);
  if (!PHOSPHOR_ONLY) await ingestPhylopic(index, s3);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
