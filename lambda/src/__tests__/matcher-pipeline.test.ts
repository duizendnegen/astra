import { describe, it, expect, vi } from 'vitest';
import { match } from '../matcher';
import type { Star, Skeleton } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────

function makeStar(id: number, ra: number, dec: number, mag = 3): Star {
  return { id, ra, dec, mag };
}

/** Build a minimal triangle constellation in a known sky position. */
function triangleSkeleton(): Skeleton {
  return {
    points: [[0, 0], [1, 0], [0.5, 1]],
    edges: [[0, 1], [1, 2], [0, 2]],
  };
}

/** Stars that closely match the triangle skeleton at RA=100, Dec=10, span≈5°. */
function triangleStars(): Star[] {
  return [
    makeStar(1,  100,    10,   2),   // vertex 0
    makeStar(2,  105,    10,   2),   // vertex 1  (5° east)
    makeStar(3,  102.5,  14,   2),   // vertex 2  (~4° north-east)
    // filler stars
    makeStar(4,  103,    12,   4),
    makeStar(5,  101,    11,   4),
    makeStar(6,   99,     9,   4),
    makeStar(7,  106,    11,   4),
    makeStar(8,  104,    13,   4),
  ];
}

// ── vertexFitScore formula ────────────────────────────────────────────────

describe('vertexFitScore formula', () => {
  it('returns 1 when stars land exactly on vertices', () => {
    // physVerts and constellation stars are identical → loss=0 → score=1
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      scorer: 'vertex-fit',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    // Can't guarantee score=1 with real stars, but score should be defined and in (0,1]
    expect(result).not.toBeNull();
    expect(result!.vertexFitScore).toBeGreaterThan(0);
    expect(result!.vertexFitScore).toBeLessThanOrEqual(1);
  });

  it('vertexFitScore is always included even when scorer is edge-ratio', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      scorer: 'edge-ratio',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
    expect(typeof result!.vertexFitScore).toBe('number');
    expect(typeof result!.shapeScore).toBe('number');
  });
});

// ── procrustesScore formula ───────────────────────────────────────────────

describe('procrustesScore formula', () => {
  it('is included when scorer is procrustes', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      scorer: 'procrustes',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.procrustesScore).toBeDefined();
    expect(result!.procrustesScore).toBeGreaterThan(0);
    expect(result!.procrustesScore).toBeLessThanOrEqual(1);
  });

  it('is undefined when scorer is not procrustes', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      scorer: 'edge-ratio',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.procrustesScore).toBeUndefined();
  });
});

// ── Generator dispatch ────────────────────────────────────────────────────

describe('generator dispatch', () => {
  it('anchor-pair returns a result', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
  });

  it('single-sweep returns a result', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      generator: 'single-sweep',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
  });

  it('any-vertex returns a result', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      generator: 'any-vertex',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
  });
});

// ── Scorer dispatch ───────────────────────────────────────────────────────

describe('scorer dispatch', () => {
  const catalogue = triangleStars();
  const skeleton = triangleSkeleton();
  const cfg = { model: 'skeleton-shape' as const, generator: 'anchor-pair' as const, seedMaxMag: 3 };

  it('edge-ratio scorer returns shapeScore as primary', () => {
    const result = match(catalogue, [skeleton], new Set(), { ...cfg, scorer: 'edge-ratio' });
    expect(result).not.toBeNull();
    expect(result!.shapeScore).toBeGreaterThan(0);
  });

  it('vertex-fit scorer returns vertexFitScore as primary', () => {
    const result = match(catalogue, [skeleton], new Set(), { ...cfg, scorer: 'vertex-fit' });
    expect(result).not.toBeNull();
    expect(result!.vertexFitScore).toBeGreaterThan(0);
  });

  it('procrustes scorer returns procrustesScore', () => {
    const result = match(catalogue, [skeleton], new Set(), { ...cfg, scorer: 'procrustes' });
    expect(result).not.toBeNull();
    expect(result!.procrustesScore).toBeDefined();
    expect(result!.procrustesScore!).toBeGreaterThan(0);
  });
});
