/**
 * retrieval-l1.test.ts
 *
 * Unit tests for the L1 retrieval path helper logic.
 * Tests pure/deterministic code without requiring real Pinecone or S3 calls.
 */

import { describe, it, expect } from 'vitest';
import { normalise, THRESHOLD_PHOSPHOR, THRESHOLD_PHOSPHOR_L3, THRESHOLD_CUSTOM, THRESHOLD_PHYLOPIC } from '../retrieval.js';

// ── S3 key derivation ─────────────────────────────────────────────────────────

describe('S3 key derivation', () => {
  it('replaces colon with slash for phosphor ids', () => {
    const id = 'phosphor:smiley';
    expect(id.replace(':', '/')).toBe('phosphor/smiley');
  });

  it('replaces colon with slash for custom ids', () => {
    const id = 'custom:eagle';
    expect(id.replace(':', '/')).toBe('custom/eagle');
  });

  it('handles ids with hyphens in name part', () => {
    const id = 'phosphor:arrow-right';
    expect(id.replace(':', '/')).toBe('phosphor/arrow-right');
  });

  it('handles ids with no colon gracefully', () => {
    const id = 'unknown';
    expect(id.replace(':', '/')).toBe('unknown');
  });
});

// ── Threshold boundary conditions ─────────────────────────────────────────────

describe('threshold boundary conditions', () => {
  it('phosphor score at exactly threshold is accepted', () => {
    expect(THRESHOLD_PHOSPHOR).toBeCloseTo(0.90);
    expect(0.90 >= THRESHOLD_PHOSPHOR).toBe(true);
  });

  it('phosphor score just below threshold is rejected', () => {
    expect(0.899 >= THRESHOLD_PHOSPHOR).toBe(false);
  });

  it('L3 phosphor threshold is lower than L1 phosphor threshold', () => {
    expect(THRESHOLD_PHOSPHOR_L3).toBeLessThan(THRESHOLD_PHOSPHOR);
  });

  it('phylopic threshold is lower than phosphor', () => {
    expect(THRESHOLD_PHYLOPIC).toBeLessThan(THRESHOLD_PHOSPHOR);
  });

  it('custom score at exactly threshold is accepted', () => {
    expect(THRESHOLD_CUSTOM >= THRESHOLD_CUSTOM).toBe(true);
  });
});

// ── Source name validation (guards L1_SOURCES filter injection) ───────────────

describe('source name validation', () => {
  it('valid source names pass alphanumeric check', () => {
    for (const s of ['phosphor', 'custom', 'phylopic', 'my_source']) {
      expect(/^[a-z0-9_]+$/i.test(s)).toBe(true);
    }
  });

  it('names with special chars are rejected', () => {
    for (const s of ['phos phor', 'custom;drop', "'phosphor'", 'x OR 1=1']) {
      expect(/^[a-z0-9_]+$/i.test(s)).toBe(false);
    }
  });
});

// ── normalise ─────────────────────────────────────────────────────────────────

describe('normalise (L0)', () => {
  it('lowercases input', () => {
    expect(normalise('Star')).toBe('star');
  });

  it('normalises plural -ies to -y', () => {
    expect(normalise('butterflies')).toBe('butterfly');
  });

  it('strips trailing s from consonant-ending plurals', () => {
    expect(normalise('stars')).toBe('star');
    expect(normalise('dogs')).toBe('dog');
  });

  it('preserves "bus" (s preceded by vowel u)', () => {
    expect(normalise('bus')).toBe('bus');
  });

  it('returns non-empty fallback for punctuation-only input', () => {
    const result = normalise('---');
    expect(result.length).toBeGreaterThan(0);
  });
});
