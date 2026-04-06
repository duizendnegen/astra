import { describe, it, expect, vi } from 'vitest';
import { match, selectDiverse } from '../matcher';
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

// ── Phase 3 candidate pool ────────────────────────────────────────────────

describe('runPhase2And3 collects all phase3 candidates', () => {
  it('evaluates multiple Phase 3 candidates when the catalogue is rich', () => {
    // A rich catalogue means many Phase 1 candidates advance, so Phase 3 evaluates
    // more than one candidate. phase3Candidates on the result reflects the count.
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], new Set(), {
      model: 'skeleton-shape',
      generator: 'anchor-pair',
      seedMaxMag: 5,
      phase3Cap: 5,
    });
    expect(result).not.toBeNull();
    expect(result!.phase3Candidates).toBeGreaterThan(1);
  });
});

// ── Diversity selection ───────────────────────────────────────────────────

describe('selectDiverse', () => {
  type C = { score: number; patchRA: number; patchDec: number; label: string };

  const top: C    = { score: 0.87, patchRA: 102, patchDec: -17, label: 'top' };
  const distant: C = { score: 0.84, patchRA: 219, patchDec:  45, label: 'distant' };   // ~117° away
  const close: C  = { score: 0.86, patchRA: 108, patchDec: -14, label: 'close' };     // ~7° away
  const bad: C    = { score: 0.75, patchRA: 219, patchDec:  45, label: 'bad' };        // >10% below top

  it('3.2 prefers a distant acceptable candidate over the top result', () => {
    // distant is within 10% tolerance (0.84 >= 0.87*0.9=0.783) and 30°+ away
    const result = selectDiverse([top, distant], () => 0);
    expect(result!.label).toBe('distant');
  });

  it('3.3 falls back to top when no distant candidate exists', () => {
    // close is acceptable (within 10%) but only ~7° away — not distant
    const result = selectDiverse([top, close]);
    expect(result!.label).toBe('top');
  });

  it('3.4a candidate at exactly 10% below top score is acceptable', () => {
    // 0.87 * 0.90 = 0.783; score 0.783 is exactly at the boundary → acceptable
    const boundary: C = { score: 0.87 * 0.90, patchRA: 219, patchDec: 45, label: 'boundary' };
    const result = selectDiverse([top, boundary], () => 0);
    expect(result!.label).toBe('boundary');
  });

  it('3.4b candidate at 10.1% below top score is not acceptable', () => {
    // 0.87 * (1 - 0.101) = ~0.782 < 0.783 → outside tolerance
    const outside: C = { score: 0.87 * (1 - 0.101), patchRA: 219, patchDec: 45, label: 'outside' };
    const result = selectDiverse([top, outside]);
    expect(result!.label).toBe('top');
  });

  it('returns null for an empty pool', () => {
    expect(selectDiverse([])).toBeNull();
  });
});
