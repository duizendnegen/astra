/**
 * 04-ingest.ts
 *
 * Ingests accepted custom SVGs into icon-index.sqlite:
 *   1. Backs up icon-index.sqlite → icon-index.sqlite.bak
 *   2. Deletes all Phylopic entries from entries + vectors
 *   3. For each accepted word: embeds + inserts into entries + vectors, records skeleton_ms
 *   4. Updates CSV status to ingested
 *
 * Usage:
 *   OPENROUTER_API_KEY=<key> npx tsx 04-ingest.ts
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { copyFileSync, readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { readCsv, writeCsv } from './csv.js';
// Import svgToSkeleton for skeleton_ms timing
import { svgToSkeleton } from '../../lambda/src/svg-to-skeleton.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'icon-index.sqlite');
const DB_BAK_PATH = path.join(DATA_DIR, 'icon-index.sqlite.bak');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const EMBED_MODEL = 'openai/text-embedding-3-small';
const EMBED_DIMS = 1536;

const log = pino(
  { level: 'debug' },
  pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

async function embed(word: string, apiKey: string): Promise<Float32Array> {
  const res = await fetch(`${OPENROUTER_BASE}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: [word] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embed HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return new Float32Array(data.data[0].embedding);
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY env var is required');

  if (!existsSync(DB_PATH)) {
    throw new Error(`Database not found at ${DB_PATH}`);
  }

  // 1. Backup
  log.info({ src: DB_PATH, dest: DB_BAK_PATH }, 'Backing up database');
  copyFileSync(DB_PATH, DB_BAK_PATH);
  log.info('Backup complete');

  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  // 2. Delete Phylopic entries
  const phylopicEntries = db.prepare(`SELECT COUNT(*) as n FROM entries WHERE source = 'phylopic'`).get() as { n: number };
  log.info({ count: phylopicEntries.n }, 'Deleting Phylopic entries from vectors');
  db.prepare(`DELETE FROM vectors WHERE id IN (SELECT id FROM entries WHERE source = 'phylopic')`).run();
  db.prepare(`DELETE FROM entries WHERE source = 'phylopic'`).run();
  log.info({ deleted: phylopicEntries.n }, 'Phylopic entries deleted');

  const insertEntry = db.prepare(`
    INSERT OR REPLACE INTO entries (id, source, label, tags, svg_path)
    VALUES (@id, @source, @label, @tags, @svg_path)
  `);
  const insertVector = db.prepare(`
    INSERT OR REPLACE INTO vectors (id, embedding)
    VALUES (@id, @embedding)
  `);

  // 3. Ingest accepted words
  const rows = readCsv();
  const toIngest = rows.filter((r) => r.status === 'accepted');
  const alreadyIngested = rows.filter((r) => r.status === 'ingested').length;

  log.info({ toIngest: toIngest.length, alreadyIngested }, 'Starting ingest');

  let ingested = 0;
  let skipped = 0;

  for (const row of toIngest) {
    if (!row.svg_path || !existsSync(row.svg_path)) {
      log.warn({ word: row.word }, 'svg_path missing or file not found — skipping');
      skipped++;
      continue;
    }

    const svgContent = readFileSync(row.svg_path, 'utf-8');
    const entryId = `custom:${row.word}`;

    // skeleton_ms: time to run svgToSkeleton
    const t0 = Date.now();
    try {
      svgToSkeleton(svgContent);
    } catch { /* ignore errors, just timing */ }
    const skeletonMs = Date.now() - t0;

    log.info({ word: row.word }, 'Embedding and inserting');
    try {
      const vec = await embed(row.word, apiKey);
      const buf = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);

      db.transaction(() => {
        insertEntry.run({ id: entryId, source: 'custom', label: row.word, tags: '', svg_path: svgContent });
        insertVector.run({ id: entryId, embedding: buf });
      })();

      row.skeleton_ms = String(skeletonMs);
      row.status = 'ingested';
      writeCsv(rows);
      ingested++;
      log.info({ word: row.word, skeletonMs }, 'Ingested');
    } catch (err) {
      log.error({ word: row.word, err: String(err) }, 'Ingest failed for word — skipping');
      skipped++;
    }
  }

  // 5. Summary
  const totalEntries = (db.prepare(`SELECT COUNT(*) as n FROM entries`).get() as { n: number }).n;
  log.info({
    ingested,
    skipped,
    alreadyIngested,
    phylopicDeleted: phylopicEntries.n,
    totalDbEntries: totalEntries,
  }, 'Ingest complete');

  db.close();
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
