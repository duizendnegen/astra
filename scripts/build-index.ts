/**
 * build-index.ts
 *
 * Downloads Phosphor icons and Phylopic silhouettes, embeds their labels,
 * and writes a SQLite + sqlite-vec index to data/icon-index.sqlite.
 *
 * Usage:
 *   OPENROUTER_API_KEY=<key> npx tsx scripts/build-index.ts
 *
 * Flags:
 *   --phosphor-only   Skip Phylopic ingestion
 *   --phylopic-only   Skip Phosphor ingestion
 *   --dry-run         Parse and insert entries but skip embedding API calls
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../data/icon-index.sqlite');
const SCHEMA_VERSION = '1';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const EMBED_DIMS = 1536;
const EMBED_BATCH_SIZE = 100;
const EMBED_RETRIES = 3;

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

// ── Database setup ────────────────────────────────────────────────────────────

function openDb(): Database.Database {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id      TEXT PRIMARY KEY,
      source  TEXT NOT NULL,
      label   TEXT NOT NULL,
      tags    TEXT NOT NULL DEFAULT '',
      svg_path TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS metadata (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // sqlite-vec virtual table for 1536-dim float32 embeddings
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[${EMBED_DIMS}]
    );
  `);

  return db;
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

async function embedAndStore(
  db: Database.Database,
  entries: { id: string; text: string }[],
): Promise<void> {
  // sqlite-vec virtual tables don't support REPLACE; use IGNORE and rely on the
  // caller to only pass entries that don't already have vectors.
  const insertVec = db.prepare('INSERT OR IGNORE INTO vectors(id, embedding) VALUES (?, ?)');

  for (let i = 0; i < entries.length; i += EMBED_BATCH_SIZE) {
    const batch = entries.slice(i, i + EMBED_BATCH_SIZE);
    const texts = batch.map((e) => e.text);
    const embeddings = await embedBatch(texts);

    if (embeddings.length === 0) continue;

    const storeMany = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        if (embeddings[j]) {
          insertVec.run(batch[j].id, embeddings[j]);
        }
      }
    });
    storeMany();

    const pct = Math.round(((i + batch.length) / entries.length) * 100);
    process.stdout.write(`\r  embedded ${i + batch.length}/${entries.length} (${pct}%)`);
  }
  process.stdout.write('\n');
}

// ── Phosphor ingestion ────────────────────────────────────────────────────────

function kebabToLabel(name: string): string {
  return name.replace(/-/g, ' ');
}

// SVG assets live at assets/regular/<name>.svg inside the package directory.
// Use './node_modules/' (relative to scripts/) not '../node_modules/' (root level).
const PHOSPHOR_ASSETS_DIR = new URL(
  './node_modules/@phosphor-icons/core/assets/regular/',
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, '$1'); // fix Windows path: /C:/... → C:/...

function readPhosphorSvg(name: string): string {
  try {
    return fs.readFileSync(`${PHOSPHOR_ASSETS_DIR}${name}.svg`, 'utf-8');
  } catch {
    return '';
  }
}

async function ingestPhosphor(db: Database.Database): Promise<void> {
  console.log('\n[Phosphor] Starting ingestion...');

  // icons is an array of { name, pascal_name, categories, tags, ... }
  const { icons } = await import('@phosphor-icons/core');

  const insertEntry = db.prepare(`
    INSERT OR IGNORE INTO entries(id, source, label, tags, svg_path)
    VALUES (@id, @source, @label, @tags, @svg_path)
  `);

  const toEmbed: { id: string; text: string }[] = [];
  let inserted = 0;
  let skipped = 0;

  const updateSvg = db.prepare('UPDATE entries SET svg_path = ? WHERE id = ? AND svg_path = \'\'');

  // Read SVG files and insert — done outside a single transaction to avoid
  // holding it open during file I/O, but batched for performance
  for (const icon of icons) {
    const id = `phosphor:${icon.name}`;
    const svgPath = readPhosphorSvg(icon.name);

    // Skip only if entry AND vector both exist AND svg_path is already populated
    const hasEntry = db.prepare('SELECT svg_path FROM entries WHERE id = ?').get(id) as { svg_path: string } | undefined;
    const hasVector = hasEntry ? db.prepare('SELECT 1 FROM vectors WHERE id = ?').get(id) : null;

    if (hasEntry && hasVector) {
      // Update svg_path if it was missing
      if (!hasEntry.svg_path && svgPath) {
        updateSvg.run(svgPath, id);
      }
      skipped++;
      continue;
    }

    const label = kebabToLabel(icon.name);
    const tags = (icon.tags ?? []).join(',');

    insertEntry.run({ id, source: 'phosphor', label, tags, svg_path: svgPath });
    toEmbed.push({ id, text: [label, ...(icon.tags ?? [])].join(', ') });
    inserted++;
  }

  console.log(`  Inserted: ${inserted}, Skipped (already present): ${skipped}`);

  if (toEmbed.length > 0) {
    console.log(`  Embedding ${toEmbed.length} new entries...`);
    await embedAndStore(db, toEmbed);
  }
}

// ── Phylopic ingestion ────────────────────────────────────────────────────────

const PHYLOPIC_API = 'https://api.phylopic.org';
const PHYLOPIC_IMAGES = 'https://images.phylopic.org';
const PHYLOPIC_CONCURRENCY = 8; // parallel image fetches per page

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

/** Fetch SVG from images.phylopic.org and return the full SVG string. */
async function fetchPhylopicSvg(uuid: string, build: number): Promise<string> {
  try {
    // First get the image record to find the vectorFile URL
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

/** Run tasks with a concurrency cap. */
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

async function ingestPhylopic(db: Database.Database): Promise<void> {
  console.log('\n[Phylopic] Starting ingestion (this will take a while)...');

  const insertEntry = db.prepare(`
    INSERT OR IGNORE INTO entries(id, source, label, tags, svg_path)
    VALUES (@id, @source, @label, @tags, @svg_path)
  `);

  const toEmbed: { id: string; text: string }[] = [];
  let total = 0;
  let totalPages = 0;
  let inserted = 0;
  let skipped = 0;

  // Step 1: get build number and total pages
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
  const build = rootData.build;
  total = rootData.totalItems;
  totalPages = rootData.totalPages;
  console.log(`  Build: ${build}, Total images: ${total}, Pages: ${totalPages}`);

  // Step 2: paginate
  for (let page = 0; page < totalPages; page++) {
    const pageRes = await fetchWithBackoff(`${PHYLOPIC_API}/images?build=${build}&page=${page}`);
    if (!pageRes.ok) {
      console.warn(`\n  [phylopic] page ${page} failed: HTTP ${pageRes.status}`);
      continue;
    }

    const pageData = (await pageRes.json()) as {
      _links: { items: { href: string; title: string }[] };
    };

    const items = pageData._links?.items ?? [];

    // Step 3: for each item, fetch SVG concurrently
    type ItemWork = { uuid: string; label: string; needsInsert: boolean };
    const toFetch: ItemWork[] = [];

    for (const item of items) {
      // href is like "/images/<uuid>?build=537"
      const uuidMatch = item.href.match(/\/images\/([^?]+)/);
      if (!uuidMatch) continue;
      const uuid = uuidMatch[1];
      const id = `phylopic:${uuid}`;

      const hasEntry = db.prepare('SELECT svg_path FROM entries WHERE id = ?').get(id) as { svg_path: string } | undefined;
      const hasVector = hasEntry ? db.prepare('SELECT 1 FROM vectors WHERE id = ?').get(id) : null;

      if (hasEntry && hasVector) {
        if (!hasEntry.svg_path) {
          // Fetch SVG to update missing content
          toFetch.push({ uuid, label: item.title, needsInsert: false });
        } else {
          skipped++;
        }
        continue;
      }

      // title is the taxonomic name ("Nactus cheverti")
      toFetch.push({ uuid, label: item.title, needsInsert: true });
    }

    // Fetch SVGs concurrently
    const svgs = await pMap(toFetch, async ({ uuid }) => fetchPhylopicSvg(uuid, build), PHYLOPIC_CONCURRENCY);

    const updateSvg = db.prepare("UPDATE entries SET svg_path = ? WHERE id = ?");

    for (let i = 0; i < toFetch.length; i++) {
      const { uuid, label, needsInsert } = toFetch[i];
      const id = `phylopic:${uuid}`;
      const svg = svgs[i];

      if (needsInsert) {
        insertEntry.run({ id, source: 'phylopic', label, tags: '', svg_path: svg });
        toEmbed.push({ id, text: label });
        inserted++;
      } else if (svg) {
        updateSvg.run(svg, id);
        inserted++; // count as inserted for progress display
      }
    }

    const done = Math.min((page + 1) * rootData.itemsPerPage, total);
    process.stdout.write(`\r  Page ${page + 1}/${totalPages}: ${done}/${total} (inserted: ${inserted}, skipped: ${skipped})`);

    // Embed in rolling batches to avoid memory buildup
    if (toEmbed.length >= EMBED_BATCH_SIZE * 2) {
      const batch = toEmbed.splice(0, EMBED_BATCH_SIZE * 2);
      await embedAndStore(db, batch);
    }
  }

  process.stdout.write('\n');
  console.log(`  Inserted: ${inserted}, Skipped (already present): ${skipped}`);

  if (toEmbed.length > 0) {
    console.log(`  Embedding ${toEmbed.length} new entries...`);
    await embedAndStore(db, toEmbed);
  }
}

// ── Metadata ──────────────────────────────────────────────────────────────────

function writeMetadata(db: Database.Database): void {
  const countPhosphor = (db.prepare("SELECT COUNT(*) as n FROM entries WHERE source = 'phosphor'").get() as { n: number }).n;
  const countPhylopic = (db.prepare("SELECT COUNT(*) as n FROM entries WHERE source = 'phylopic'").get() as { n: number }).n;

  const upsert = db.prepare('INSERT OR REPLACE INTO metadata(key, value) VALUES (?, ?)');
  const writeAll = db.transaction(() => {
    upsert.run('schema_version', SCHEMA_VERSION);
    upsert.run('build_date', new Date().toISOString());
    upsert.run('count_phosphor', String(countPhosphor));
    upsert.run('count_phylopic', String(countPhylopic));
    upsert.run('embed_model', EMBED_MODEL);
    upsert.run('embed_dims', String(EMBED_DIMS));
  });
  writeAll();

  console.log('\n[Metadata]');
  console.log(`  Phosphor entries: ${countPhosphor}`);
  console.log(`  Phylopic entries: ${countPhylopic}`);
  console.log(`  Build date: ${new Date().toISOString()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`Building icon index → ${DB_PATH}`);
  if (DRY_RUN) console.log('(dry-run mode: no embedding API calls)');

  const db = openDb();

  if (!PHYLOPIC_ONLY) await ingestPhosphor(db);
  if (!PHOSPHOR_ONLY) await ingestPhylopic(db);

  writeMetadata(db);
  db.close();

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
