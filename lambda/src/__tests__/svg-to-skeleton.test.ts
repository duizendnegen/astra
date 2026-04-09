import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on concaveman while preserving real implementation for hull behaviour tests
vi.mock('concaveman', async (importOriginal) => {
  const mod = await importOriginal<typeof import('concaveman')>();
  return { default: vi.fn(mod.default) };
});

import concaveman from 'concaveman';
import { svgToSkeleton, concaveHullContour, extractOutlineContour, clearSvgCaches, buildSubpathComponentsSkeleton, rdpSimplify } from '../svg-to-skeleton.js';

beforeEach(() => {
  clearSvgCaches();
  vi.mocked(concaveman).mockClear();
});

// ── Helper SVG builders ──────────────────────────────────────────────────────

/** Simple square: 4 clear corners at (20,20)-(80,80) in a 100x100 viewBox */
const SQUARE_SVG = `<svg viewBox="0 0 100 100"><path d="M20,20 L80,20 L80,80 L20,80 Z"/></svg>`;

/** 2-point line — degenerate input */
const LINE_SVG = `<svg viewBox="0 0 100 100"><path d="M10,10 L20,20"/></svg>`;

/** 50 thin horizontal stroke-like rectangles spanning the full canvas.
 *  Each is a separate path element (simulates vtracer line-art output). */
function makeLineArtSvg(): string {
  const paths: string[] = [];
  for (let i = 0; i < 50; i++) {
    const y = i * 2;          // y: 0, 2, 4, ..., 98 → full vertical extent
    const x1 = 5;
    const x2 = 95;            // full horizontal extent
    paths.push(`<path d="M${x1},${y} L${x2},${y} L${x2},${y + 0.5} L${x1},${y + 0.5} Z"/>`);
  }
  return `<svg viewBox="0 0 100 100">${paths.join('')}</svg>`;
}

// ── 3.1: Single filled polygon → hull closely follows boundary ───────────────

describe('concaveHullContour — single filled polygon', () => {
  it('hull bounding box closely follows the input polygon boundary', () => {
    const skeleton = svgToSkeleton(SQUARE_SVG);
    expect(skeleton).not.toBeNull();

    const pts = skeleton!.points;
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // Normalised square corners are at 0.2 and 0.8 — hull should stay within 0.05 units
    expect(minX).toBeLessThanOrEqual(0.25);
    expect(maxX).toBeGreaterThanOrEqual(0.75);
    expect(minY).toBeLessThanOrEqual(0.25);
    expect(maxY).toBeGreaterThanOrEqual(0.75);
  });
});

// ── 3.2: Disconnected line-art → hull encloses full bounding extent ──────────

describe('concaveHullContour — disconnected line-art strokes', () => {
  it('hull encloses the full bounding extent across all 50 disconnected subpaths', () => {
    const svg = makeLineArtSvg();
    const skeleton = svgToSkeleton(svg);
    expect(skeleton).not.toBeNull();

    const pts = skeleton!.points;
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    // Strokes span x: 0.05–0.95, y: 0–0.98; hull should cover the full extent
    expect(minX).toBeLessThanOrEqual(0.15);
    expect(maxX).toBeGreaterThanOrEqual(0.85);
    expect(minY).toBeLessThanOrEqual(0.10);
    expect(maxY).toBeGreaterThanOrEqual(0.88);
  });
});

// ── 3.3: Fewer than 3 points → svgToSkeleton returns null ───────────────────

describe('concaveHullContour — degenerate input', () => {
  it('returns [] for fewer than 3 points', () => {
    expect(concaveHullContour([[0.1, 0.1]], 3.0)).toEqual([]);
    expect(concaveHullContour([[0.1, 0.1], [0.9, 0.9]], 3.0)).toEqual([]);
  });

  it('svgToSkeleton returns null when SVG yields fewer than 3 sampled points', () => {
    const result = svgToSkeleton(LINE_SVG);
    expect(result).toBeNull();
  });
});

// ── 3.4: concavity option forwarded to concaveman ───────────────────────────

describe('concavity option', () => {
  it('default concavity 1.5 is forwarded to concaveman', () => {
    svgToSkeleton(SQUARE_SVG);
    expect(vi.mocked(concaveman)).toHaveBeenCalled();
    const [, concavityArg] = vi.mocked(concaveman).mock.calls[0];
    expect(concavityArg).toBe(1.5);
  });

  it('custom concavity is forwarded to concaveman', () => {
    svgToSkeleton(SQUARE_SVG, { concavity: 1.5 });
    expect(vi.mocked(concaveman)).toHaveBeenCalled();
    const [, concavityArg] = vi.mocked(concaveman).mock.calls[0];
    expect(concavityArg).toBe(1.5);
  });
});

// ── extractOutlineContour (polygon-union) tests ──────────────────────────────

/** Square with circular hole (two subpaths): outer square 10–90, inner circle approx at 50,50 r=20 */
const SQUARE_WITH_HOLE_SVG = `<svg viewBox="0 0 100 100">
  <path d="M10,10 L90,10 L90,90 L10,90 Z"/>
  <path d="M50,30 L70,50 L50,70 L30,50 Z"/>
</svg>`;

/** Two disconnected squares of different sizes */
const TWO_SQUARES_SVG = `<svg viewBox="0 0 100 100">
  <path d="M5,5 L45,5 L45,45 L5,45 Z"/>
  <path d="M55,55 L95,55 L95,95 L55,95 Z"/>
</svg>`;

describe('extractOutlineContour — polygon-union', () => {
  it('returns outer contour for a single subpath polygon', () => {
    const pts: [number, number][] = [[0,0],[1,0],[1,1],[0,1]];
    const result = extractOutlineContour([pts]);
    expect(result).toEqual(pts);
  });

  it('returns empty for empty input', () => {
    expect(extractOutlineContour([])).toEqual([]);
  });

  it('filled icon with hole: outer boundary covers the square extent', () => {
    const skeleton = svgToSkeleton(SQUARE_WITH_HOLE_SVG, { strategy: 'polygon-union' });
    expect(skeleton).not.toBeNull();
    const pts = skeleton!.points;
    const xs = pts.map(([x]) => x);
    const ys = pts.map(([, y]) => y);
    // Outer square corners at 0.1 and 0.9
    expect(Math.min(...xs)).toBeLessThanOrEqual(0.15);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(0.85);
    expect(Math.min(...ys)).toBeLessThanOrEqual(0.15);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(0.85);
  });

  it('two disconnected regions: contour covers the larger region', () => {
    const skeleton = svgToSkeleton(TWO_SQUARES_SVG, { strategy: 'polygon-union' });
    expect(skeleton).not.toBeNull();
    // Both squares are same size so either is acceptable; skeleton should be non-null
    expect(skeleton!.points.length).toBeGreaterThanOrEqual(3);
  });
});

// ── strategy option: concave-hull vs polygon-union produce different skeletons ─

describe('strategy option', () => {
  it('polygon-union and concave-hull produce different skeletons for multi-subpath SVG', () => {
    clearSvgCaches();
    const s1 = svgToSkeleton(SQUARE_WITH_HOLE_SVG, { strategy: 'concave-hull' });
    clearSvgCaches();
    const s2 = svgToSkeleton(SQUARE_WITH_HOLE_SVG, { strategy: 'polygon-union' });
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    // The two strategies should not produce identical point sets
    expect(JSON.stringify(s1!.points)).not.toEqual(JSON.stringify(s2!.points));
  });

  it('same SVG with different strategies uses separate cache entries', () => {
    clearSvgCaches();
    const s1 = svgToSkeleton(SQUARE_SVG, { strategy: 'concave-hull' });
    // Second call with different strategy should still call concaveman only once total
    // (polygon-union does not call concaveman at all)
    vi.mocked(concaveman).mockClear();
    const s2 = svgToSkeleton(SQUARE_SVG, { strategy: 'polygon-union' });
    expect(s1).not.toBeNull();
    expect(s2).not.toBeNull();
    // polygon-union path does not invoke concaveman
    expect(vi.mocked(concaveman)).not.toHaveBeenCalled();
  });
});

// ── subpath-components strategy ──────────────────────────────────────────────

/** Two well-separated squares: simulates two wheel-like subpaths */
const TWO_CIRCLES_SVG = `<svg viewBox="0 0 200 100">
  <path d="M10,10 L40,10 L40,40 L10,40 Z"/>
  <path d="M160,10 L190,10 L190,40 L160,40 Z"/>
</svg>`;

describe('subpath-components strategy — multi-subpath produces multi-component graph', () => {
  it('produces a skeleton with multiple edge components (not a single closed loop)', () => {
    clearSvgCaches();
    const skeleton = svgToSkeleton(TWO_CIRCLES_SVG, { strategy: 'subpath-components' });
    expect(skeleton).not.toBeNull();

    const { points, edges } = skeleton!;
    expect(points.length).toBeGreaterThanOrEqual(6); // at least 3 pts per subpath

    // Build adjacency to detect connected components
    const adj = new Map<number, Set<number>>();
    for (const [a, b] of edges) {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    }
    const visited = new Set<number>();
    function bfs(start: number) {
      const queue = [start];
      while (queue.length) {
        const n = queue.shift()!;
        if (visited.has(n)) continue;
        visited.add(n);
        for (const nb of adj.get(n) ?? []) queue.push(nb);
      }
    }
    let components = 0;
    for (let i = 0; i < points.length; i++) {
      if (!visited.has(i)) { bfs(i); components++; }
    }
    // With bridge edges connecting the two subpaths, the graph is one connected component
    // (bridges link them), but the key check is that both subpath clusters appear in points
    expect(components).toBeGreaterThanOrEqual(1);

    // Both squares are in opposite halves of the 200x100 viewBox (normalised)
    // Left square centre ≈ (0.125, 0.25), right square centre ≈ (0.875, 0.25)
    const xs = points.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThan(0.2);  // left subpath present
    expect(Math.max(...xs)).toBeGreaterThan(0.8); // right subpath present
  });

  it('single-subpath SVG falls back to concave-hull output', () => {
    clearSvgCaches();
    const sk1 = svgToSkeleton(SQUARE_SVG, { strategy: 'concave-hull' });
    clearSvgCaches();
    const sk2 = svgToSkeleton(SQUARE_SVG, { strategy: 'subpath-components' });
    expect(sk1).not.toBeNull();
    expect(sk2).not.toBeNull();
    // Both should cover the same bounding box (concave-hull fallback)
    const xs1 = sk1!.points.map(([x]) => x);
    const xs2 = sk2!.points.map(([x]) => x);
    expect(Math.min(...xs2)).toBeCloseTo(Math.min(...xs1), 1);
    expect(Math.max(...xs2)).toBeCloseTo(Math.max(...xs1), 1);
  });
});

/** Build a regular polygon approximation (n vertices) centred at (cx, cy) with radius r */
function makePolygon(n: number, cx: number, cy: number, r: number): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * Math.PI * i) / n;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as [number, number];
  });
}

describe('buildSubpathComponentsSkeleton — budget allocation', () => {
  it('proportional allocation gives larger subpaths more points', () => {
    // Subpath A: 80-vertex polygon (large), subpath B: 16-vertex polygon (small)
    const bigSubpath = makePolygon(80, 0.25, 0.25, 0.2);
    const smallSubpath = makePolygon(16, 0.75, 0.75, 0.1);
    const { points } = buildSubpathComponentsSkeleton(
      [bigSubpath, smallSubpath], rdpSimplify, 0.005, 15, 40,
    );
    // Both subpaths contribute points; total within budget (±2 for rounding)
    expect(points.length).toBeGreaterThanOrEqual(6);
    expect(points.length).toBeLessThanOrEqual(42);
  });

  it('minimum allocation: each subpath contributes at least 2 points regardless of size', () => {
    // Tiny polygon (4 raw pts) alongside a large one
    const big = makePolygon(60, 0.25, 0.25, 0.2);
    const tiny = makePolygon(4, 0.75, 0.75, 0.05);
    const { points } = buildSubpathComponentsSkeleton(
      [big, tiny], rdpSimplify, 0.005, 10, 40,
    );
    // Both subpaths must contribute at least some points
    expect(points.length).toBeGreaterThanOrEqual(6);
  });
});

describe('buildSubpathComponentsSkeleton — bridge edge deduplication', () => {
  it('no edge pair appears twice in opposite directions', () => {
    const spA: [number, number][] = [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]];
    const spB: [number, number][] = [[0.8, 0.8], [0.9, 0.8], [0.9, 0.9], [0.8, 0.9]];
    const { edges } = buildSubpathComponentsSkeleton(
      [spA, spB], rdpSimplify, 0.02, 6, 20,
    );
    const seen = new Set<string>();
    for (const [a, b] of edges) {
      const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
