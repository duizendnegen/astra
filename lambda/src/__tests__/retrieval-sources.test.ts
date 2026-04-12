/**
 * retrieval-sources.test.ts
 *
 * Unit tests for threshold constants and source-related logic in retrieval.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  THRESHOLD_PHOSPHOR,
  THRESHOLD_CUSTOM,
  THRESHOLD_PHYLOPIC,
  normalise,
} from '../retrieval.js';

describe('threshold constants', () => {
  it('THRESHOLD_PHOSPHOR defaults to 0.60', () => {
    expect(THRESHOLD_PHOSPHOR).toBeCloseTo(0.60);
  });

  it('THRESHOLD_CUSTOM defaults to 0.85', () => {
    expect(THRESHOLD_CUSTOM).toBeCloseTo(0.85);
  });

  it('THRESHOLD_PHYLOPIC defaults to 0.55', () => {
    expect(THRESHOLD_PHYLOPIC).toBeCloseTo(0.55);
  });

  it('THRESHOLD_CUSTOM is stricter than THRESHOLD_PHOSPHOR', () => {
    expect(THRESHOLD_CUSTOM).toBeGreaterThan(THRESHOLD_PHOSPHOR);
  });

  it('THRESHOLD_PHOSPHOR is stricter than THRESHOLD_PHYLOPIC', () => {
    expect(THRESHOLD_PHOSPHOR).toBeGreaterThan(THRESHOLD_PHYLOPIC);
  });
});

describe('normalise', () => {
  it('lowercases input', () => {
    expect(normalise('Star')).toBe('star');
  });

  it('strips punctuation', () => {
    expect(normalise('arrow-right')).toBe('arrowright');
  });

  it('strips trailing s from consonant-ending words', () => {
    expect(normalise('stars')).toBe('star');
    expect(normalise('dogs')).toBe('dog');
  });

  it('preserves bus and gas (vowel-ending or short)', () => {
    // "bus" ends with 's' preceded by vowel 'u' — should not strip
    expect(normalise('bus')).toBe('bus');
  });

  it('normalises plural -ies to -y', () => {
    expect(normalise('butterflies')).toBe('butterfly');
  });

  it('returns fallback for empty result', () => {
    expect(normalise('---')).toBe('---');
  });
});
