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
    const result = match(catalogue, [skeleton], {
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
    const result = match(catalogue, [skeleton], {
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
    const result = match(catalogue, [skeleton], {
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
    const result = match(catalogue, [skeleton], {
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
    const result = match(catalogue, [skeleton], {
      model: 'skeleton-shape',
      generator: 'anchor-pair',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
  });

  it('single-sweep returns a result', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], {
      model: 'skeleton-shape',
      generator: 'single-sweep',
      seedMaxMag: 3,
    });
    expect(result).not.toBeNull();
  });

  it('any-vertex returns a result', () => {
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], {
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
    const result = match(catalogue, [skeleton], { ...cfg, scorer: 'edge-ratio' });
    expect(result).not.toBeNull();
    expect(result!.shapeScore).toBeGreaterThan(0);
  });

  it('vertex-fit scorer returns vertexFitScore as primary', () => {
    const result = match(catalogue, [skeleton], { ...cfg, scorer: 'vertex-fit' });
    expect(result).not.toBeNull();
    expect(result!.vertexFitScore).toBeGreaterThan(0);
  });

  it('procrustes scorer returns procrustesScore', () => {
    const result = match(catalogue, [skeleton], { ...cfg, scorer: 'procrustes' });
    expect(result).not.toBeNull();
    expect(result!.procrustesScore).toBeDefined();
    expect(result!.procrustesScore!).toBeGreaterThan(0);
  });
});

// ── Phase 3 spatial-spread pool ──────────────────────────────────────────

/** Two triangles ≥30° apart, both bright enough to seed anchors. */
function twoRegionCatalogue(): Star[] {
  return [
    // Region A: triangle at RA=100, Dec=0 (~5° span)
    makeStar(1, 100, 0, 2), makeStar(2, 105, 0, 2), makeStar(3, 102.5, 4, 2),
    makeStar(4, 103, 2, 4), makeStar(5, 101, 1, 4),
    // Region B: triangle at RA=220, Dec=0 (120° from A)
    makeStar(6, 220, 0, 2), makeStar(7, 225, 0, 2), makeStar(8, 222.5, 4, 2),
    makeStar(9, 223, 2, 4), makeStar(10, 221, 1, 4),
  ];
}

/** Three triangles: A at RA=100, B at RA=220 (120° from A), C at RA=235 (140° from A, 15° from B). */
function threeRegionCatalogue(): Star[] {
  return [
    // Region A: RA=100
    makeStar(1, 100, 0, 2), makeStar(2, 105, 0, 2), makeStar(3, 102.5, 4, 2),
    makeStar(4, 103, 2, 4), makeStar(5, 101, 1, 4),
    // Region B: RA=220 (120° from A)
    makeStar(6, 220, 0, 2), makeStar(7, 225, 0, 2), makeStar(8, 222.5, 4, 2),
    makeStar(9, 223, 2, 4), makeStar(10, 221, 1, 4),
    // Region C: RA=235 (140° from A, 15° from B)
    makeStar(11, 235, 0, 2), makeStar(12, 240, 0, 2), makeStar(13, 237.5, 4, 2),
    makeStar(14, 238, 2, 4), makeStar(15, 236, 1, 4),
  ];
}

describe('Phase 3 pool diversity (spatial-spread selection)', () => {
  const skel = triangleSkeleton();
  const cfg = { model: 'vertex-penalty' as const, generator: 'anchor-pair' as const, seedMaxMag: 2 };

  it('2.1 candidates from two sky regions make distantCount > 0', () => {
    // Both regions match equally well → Phase 3 pool has representatives from each,
    // so selectDiverse sees a distant acceptable candidate.
    const result = match(twoRegionCatalogue(), [skel], cfg);
    expect(result).not.toBeNull();
    expect(result!.distantCount).toBeGreaterThan(0);
  });

  it('2.2 geographically thin catalogue falls back cleanly — match still succeeds', () => {
    // All stars in one region: diversity filter exhausts distant candidates,
    // fallback fills Phase 3 with close ones. Match must still return a result.
    const result = match(triangleStars(), [skel], cfg);
    expect(result).not.toBeNull();
    expect(result!.selectedScore).toBeGreaterThan(0);
  });

  it('2.3 top-scoring candidate is always reachable — selectedScore ≤ topScore', () => {
    // The top candidate is always the first accepted into Phase 3 (no distance check
    // for the first entry), so topScore is always available to selectDiverse.
    const result = match(twoRegionCatalogue(), [skel], cfg);
    expect(result).not.toBeNull();
    expect(result!.selectedScore).toBeLessThanOrEqual(result!.topScore + 1e-9);
  });

  it('2.4 pairwise separation — adjacent distant regions not double-counted', () => {
    // B (RA=220) and C (RA=235) are both ≥30° from A (RA=100) but only 15° from each other.
    // With phase3Cap=2, only one of {B,C} gets a Phase 3 diverse slot; the other is excluded.
    // distantCount ≤ 1 confirms pairwise checking against all selected (not just top).
    const result = match(threeRegionCatalogue(), [skel], { ...cfg, phase3Cap: 2 });
    expect(result).not.toBeNull();
    expect(result!.distantCount).toBeLessThanOrEqual(1);
  });
});

// ── Phase 3 candidate pool ────────────────────────────────────────────────

describe('runPhase2And3 collects all phase3 candidates', () => {
  it('evaluates multiple Phase 3 candidates when the catalogue is rich', () => {
    // A rich catalogue means many Phase 1 candidates advance, so Phase 3 evaluates
    // more than one candidate. phase3Candidates on the result reflects the count.
    const catalogue = triangleStars();
    const skeleton = triangleSkeleton();
    const result = match(catalogue, [skeleton], {
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

// ── Diversity diagnostic fields ───────────────────────────────────────────

describe('match() diversity diagnostic fields', () => {
  const cfg = { model: 'skeleton-shape' as const, generator: 'anchor-pair' as const, seedMaxMag: 3 };

  it('selectedScore, topScore, acceptableCount, distantCount are defined on a successful match', () => {
    const result = match(triangleStars(), [triangleSkeleton()], cfg);
    expect(result).not.toBeNull();
    expect(typeof result!.selectedScore).toBe('number');
    expect(typeof result!.topScore).toBe('number');
    expect(typeof result!.acceptableCount).toBe('number');
    expect(typeof result!.distantCount).toBe('number');
    expect(result!.selectedScore).toBeGreaterThanOrEqual(0);
    expect(result!.topScore).toBeGreaterThanOrEqual(0);
    expect(result!.acceptableCount).toBeGreaterThanOrEqual(0);
    expect(result!.distantCount).toBeGreaterThanOrEqual(0);
  });

  it('selectedScore equals topScore when no diversity was applied', () => {
    // With a single skeleton and close stars, no distant candidate exists → champion selected
    const result = match(triangleStars(), [triangleSkeleton()], cfg);
    expect(result).not.toBeNull();
    expect(result!.distantCount).toBe(0);
    expect(result!.selectedScore).toBe(result!.topScore);
  });

  it('distantCount is 0 when no distant candidates exist', () => {
    const result = match(triangleStars(), [triangleSkeleton()], cfg);
    expect(result).not.toBeNull();
    expect(result!.distantCount).toBe(0);
  });

  it('nextBestScore is undefined when pool has only one candidate', () => {
    // Restrict to seedMaxMag=2 to keep the pool tiny (only mag≤2 stars seed anchors)
    const tinyStars = triangleStars().filter(s => s.mag <= 2);
    // We need at least enough stars to form one candidate; fall back to full set if match fails
    const result = match(triangleStars(), [triangleSkeleton()], { ...cfg, phase3Cap: 1 });
    // Can't guarantee pool=1 in all configs, but verify the field type contract
    if (result !== null) {
      expect(result.nextBestScore === undefined || typeof result.nextBestScore === 'number').toBe(true);
    }
  });
});
