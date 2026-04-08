import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spy on concaveman while preserving real implementation for hull behaviour tests
vi.mock('concaveman', async (importOriginal) => {
  const mod = await importOriginal<typeof import('concaveman')>();
  return { default: vi.fn(mod.default) };
});

import concaveman from 'concaveman';
import { svgToSkeleton, concaveHullContour, clearSvgCaches } from '../svg-to-skeleton.js';

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
  it('default concavity 3.0 is forwarded to concaveman', () => {
    svgToSkeleton(SQUARE_SVG);
    expect(vi.mocked(concaveman)).toHaveBeenCalled();
    const [, concavityArg] = vi.mocked(concaveman).mock.calls[0];
    expect(concavityArg).toBe(3.0);
  });

  it('custom concavity is forwarded to concaveman', () => {
    svgToSkeleton(SQUARE_SVG, { concavity: 1.5 });
    expect(vi.mocked(concaveman)).toHaveBeenCalled();
    const [, concavityArg] = vi.mocked(concaveman).mock.calls[0];
    expect(concavityArg).toBe(1.5);
  });
});
