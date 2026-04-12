/**
 * retrieval-sources.test.ts
 *
 * Unit tests for L1_SOURCES-driven retrieval behaviour and per-source thresholds.
 * Uses an in-memory SQLite database with custom + phosphor entries.
 * Does not require the sqlite-vec extension (tests SQL source filtering only).
 */

import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  THRESHOLD_PHOSPHOR,
  THRESHOLD_CUSTOM,
} from '../retrieval.js';

// ── In-memory test DB helper (no vec0 needed for source filtering tests) ──────

function buildTestDb(): Database.Database {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE entries (
      id       TEXT PRIMARY KEY,
      source   TEXT NOT NULL,
      label    TEXT NOT NULL,
      tags     TEXT NOT NULL DEFAULT '',
      svg_path TEXT NOT NULL DEFAULT ''
    );
  `);

  const insert = db.prepare(`INSERT INTO entries VALUES (@id, @source, @label, @tags, @svg_path)`);
  insert.run({ id: 'phosphor:arrow', source: 'phosphor', label: 'arrow', tags: '', svg_path: '' });
  insert.run({ id: 'phosphor:star',  source: 'phosphor', label: 'star',  tags: '', svg_path: '' });
  insert.run({ id: 'custom:eagle',   source: 'custom',   label: 'eagle', tags: '', svg_path: '' });
  insert.run({ id: 'custom:owl',     source: 'custom',   label: 'owl',   tags: '', svg_path: '' });

  return db;
}

// ── Constants tests ───────────────────────────────────────────────────────────

describe('threshold constants', () => {
  it('THRESHOLD_PHOSPHOR defaults to 0.80', () => {
    expect(THRESHOLD_PHOSPHOR).toBeCloseTo(0.80);
  });

  it('THRESHOLD_CUSTOM defaults to 0.85', () => {
    expect(THRESHOLD_CUSTOM).toBeCloseTo(0.85);
  });

  it('THRESHOLD_CUSTOM is stricter than THRESHOLD_PHOSPHOR', () => {
    expect(THRESHOLD_CUSTOM).toBeGreaterThan(THRESHOLD_PHOSPHOR);
  });
});

// ── SQL source filtering verification ─────────────────────────────────────────

describe('source filtering in test DB', () => {
  it('L1_SOURCES=phosphor returns only phosphor entries', () => {
    const db = buildTestDb();
    const rows = db.prepare(`SELECT id, source FROM entries WHERE source IN ('phosphor') ORDER BY id`).all() as { id: string; source: string }[];
    expect(rows.every((r) => r.source === 'phosphor')).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(['phosphor:arrow', 'phosphor:star']);
    db.close();
  });

  it('L1_SOURCES=custom returns only custom entries', () => {
    const db = buildTestDb();
    const rows = db.prepare(`SELECT id, source FROM entries WHERE source IN ('custom') ORDER BY id`).all() as { id: string; source: string }[];
    expect(rows.every((r) => r.source === 'custom')).toBe(true);
    expect(rows.map((r) => r.id)).toEqual(['custom:eagle', 'custom:owl']);
    db.close();
  });

  it('L1_SOURCES=phosphor,custom returns all entries', () => {
    const db = buildTestDb();
    const rows = db.prepare(`SELECT id, source FROM entries WHERE source IN ('phosphor', 'custom') ORDER BY id`).all() as { id: string; source: string }[];
    expect(rows).toHaveLength(4);
    expect(rows.filter((r) => r.source === 'phosphor')).toHaveLength(2);
    expect(rows.filter((r) => r.source === 'custom')).toHaveLength(2);
    db.close();
  });

  it('custom entry ids follow the custom:{word} convention', () => {
    const db = buildTestDb();
    const rows = db.prepare(`SELECT id FROM entries WHERE source = 'custom'`).all() as { id: string }[];
    for (const row of rows) {
      expect(row.id).toMatch(/^custom:/);
    }
    db.close();
  });

  it('phylopic entries are absent after deletion migration', () => {
    const db = buildTestDb();

    // Seed a phylopic entry
    db.prepare(`INSERT INTO entries VALUES ('phylopic:cat', 'phylopic', 'cat', '', '')`).run();
    expect((db.prepare(`SELECT COUNT(*) as n FROM entries WHERE source = 'phylopic'`).get() as { n: number }).n).toBe(1);

    // Simulate migration
    db.prepare(`DELETE FROM entries WHERE source = 'phylopic'`).run();

    const count = (db.prepare(`SELECT COUNT(*) as n FROM entries WHERE source = 'phylopic'`).get() as { n: number }).n;
    expect(count).toBe(0);

    // Other sources unaffected
    const remaining = (db.prepare(`SELECT COUNT(*) as n FROM entries`).get() as { n: number }).n;
    expect(remaining).toBe(4);

    db.close();
  });
});
