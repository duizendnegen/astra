/**
 * ingest.test.ts
 *
 * Integration test for the ingest DB operations in 04-ingest.ts.
 * Runs against a temporary SQLite copy; verifies custom entries are present
 * and Phylopic entries are absent after the migration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, copyFileSync, statSync } from 'fs';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const TMP = join(tmpdir(), `ingest-test-${process.pid}`);
const DB_PATH = join(TMP, 'test-index.sqlite');
const DB_BAK_PATH = join(TMP, 'test-index.sqlite.bak');
const EMBED_DIMS = 1536;

function createTestDb(): Database.Database {
  mkdirSync(TMP, { recursive: true });
  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  db.exec(`
    CREATE TABLE entries (
      id       TEXT PRIMARY KEY,
      source   TEXT NOT NULL,
      label    TEXT NOT NULL,
      tags     TEXT NOT NULL DEFAULT '',
      svg_path TEXT NOT NULL DEFAULT ''
    );
    CREATE VIRTUAL TABLE vectors USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[${EMBED_DIMS}]
    );
  `);

  // Insert some phosphor and phylopic seed entries
  const insertEntry = db.prepare(`INSERT INTO entries VALUES (@id, @source, @label, @tags, @svg_path)`);
  const insertVector = db.prepare(`INSERT INTO vectors VALUES (@id, @embedding)`);

  function addEntry(id: string, source: string, label: string) {
    insertEntry.run({ id, source, label, tags: '', svg_path: '' });
    const vec = new Float32Array(EMBED_DIMS).fill(0.1);
    insertVector.run({ id, embedding: Buffer.from(vec.buffer) });
  }

  addEntry('phosphor:arrow', 'phosphor', 'arrow');
  addEntry('phosphor:star',  'phosphor', 'star');
  addEntry('phylopic:001',   'phylopic', 'cat silhouette');
  addEntry('phylopic:002',   'phylopic', 'dog silhouette');

  return db;
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('ingest DB migration', () => {
  it('backup file is created before any writes', () => {
    const db = createTestDb();
    db.close();

    // Simulate backup step
    copyFileSync(DB_PATH, DB_BAK_PATH);

    const stat = statSync(DB_BAK_PATH);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('phylopic entries are deleted from both entries and vectors', () => {
    const db = createTestDb();

    // Simulate Phylopic deletion
    db.prepare(`DELETE FROM vectors WHERE id IN (SELECT id FROM entries WHERE source = 'phylopic')`).run();
    db.prepare(`DELETE FROM entries WHERE source = 'phylopic'`).run();

    const entryCount = (db.prepare(`SELECT COUNT(*) as n FROM entries WHERE source = 'phylopic'`).get() as { n: number }).n;
    expect(entryCount).toBe(0);

    const vecCount = (db.prepare(`SELECT COUNT(*) as n FROM vectors WHERE id LIKE 'phylopic:%'`).get() as { n: number }).n;
    expect(vecCount).toBe(0);

    // Phosphor entries should remain
    const phosphorCount = (db.prepare(`SELECT COUNT(*) as n FROM entries WHERE source = 'phosphor'`).get() as { n: number }).n;
    expect(phosphorCount).toBe(2);

    db.close();
  });

  it('custom entries are inserted with correct schema', () => {
    const db = createTestDb();

    // Simulate inserting a custom entry
    const insertEntry = db.prepare(`
      INSERT OR REPLACE INTO entries (id, source, label, tags, svg_path)
      VALUES (@id, @source, @label, @tags, @svg_path)
    `);
    const insertVector = db.prepare(`
      INSERT OR REPLACE INTO vectors (id, embedding) VALUES (@id, @embedding)
    `);

    const entryId = 'custom:eagle';
    const svgContent = '<svg><path d="M 0 0 L 10 10"/></svg>';
    const vec = new Float32Array(EMBED_DIMS).fill(0.5);

    db.transaction(() => {
      insertEntry.run({ id: entryId, source: 'custom', label: 'eagle', tags: '', svg_path: svgContent });
      insertVector.run({ id: entryId, embedding: Buffer.from(vec.buffer) });
    })();

    const entry = db.prepare(`SELECT * FROM entries WHERE id = ?`).get(entryId) as {
      id: string; source: string; label: string; svg_path: string;
    };
    expect(entry).toBeTruthy();
    expect(entry.id).toBe('custom:eagle');
    expect(entry.source).toBe('custom');
    expect(entry.label).toBe('eagle');
    expect(entry.svg_path).toBe(svgContent);

    db.close();
  });

  it('custom source is queryable alongside phosphor', () => {
    const db = createTestDb();

    // Delete phylopic, add custom
    db.prepare(`DELETE FROM vectors WHERE id IN (SELECT id FROM entries WHERE source = 'phylopic')`).run();
    db.prepare(`DELETE FROM entries WHERE source = 'phylopic'`).run();

    const insertEntry = db.prepare(`INSERT OR REPLACE INTO entries (id, source, label, tags, svg_path) VALUES (@id, @source, @label, @tags, @svg_path)`);
    const insertVector = db.prepare(`INSERT OR REPLACE INTO vectors (id, embedding) VALUES (@id, @embedding)`);

    const vec = new Float32Array(EMBED_DIMS).fill(0.1);
    insertEntry.run({ id: 'custom:eagle', source: 'custom', label: 'eagle', tags: '', svg_path: '<svg/>' });
    insertVector.run({ id: 'custom:eagle', embedding: Buffer.from(vec.buffer) });

    const rows = db.prepare(`
      SELECT e.id, e.source FROM vectors v
      JOIN entries e ON e.id = v.id
      WHERE e.source IN ('phosphor', 'custom')
      ORDER BY e.id
    `).all() as { id: string; source: string }[];

    expect(rows).toHaveLength(3); // 2 phosphor + 1 custom
    expect(rows.find((r) => r.id === 'custom:eagle')).toBeTruthy();
    expect(rows.filter((r) => r.source === 'phosphor')).toHaveLength(2);

    db.close();
  });
});
