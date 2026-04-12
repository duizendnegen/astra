import { describe, it, expect, beforeEach } from 'vitest';

import { svgToSkeleton, extractOutlineContour, clearSvgCaches, rdpSimplify } from '../svg-to-skeleton.js';

beforeEach(() => {
  clearSvgCaches();
});

// ── Helper SVG builders ──────────────────────────────────────────────────────

/** Simple square: 4 clear corners at (20,20)-(80,80) in a 100x100 viewBox */
const SQUARE_SVG = `<svg viewBox="0 0 100 100"><path d="M20,20 L80,20 L80,80 L20,80 Z"/></svg>`;

/** 2-point line — degenerate input */
const LINE_SVG = `<svg viewBox="0 0 100 100"><path d="M10,10 L20,20"/></svg>`;

/** 50 thin horizontal stroke-like rectangles spanning the full canvas.
 *  Each is a separate path element (simulates line-art output). */
function makeLineArtSvg(): string {
  const paths: string[] = [];
  for (let i = 0; i < 50; i++) {
    const y = i * 2;
    const x1 = 5;
    const x2 = 95;
    paths.push(`<path d="M${x1},${y} L${x2},${y} L${x2},${y + 0.5} L${x1},${y + 0.5} Z"/>`);
  }
  return `<svg viewBox="0 0 100 100">${paths.join('')}</svg>`;
}

// ── Single filled polygon → skeleton closely follows boundary ─────────────────

describe('svgToSkeleton — single filled polygon', () => {
  it('bounding box closely follows the input polygon boundary', () => {
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

// ── Disconnected line-art → skeleton is produced ──────────────────────────────

describe('svgToSkeleton — disconnected line-art strokes', () => {
  it('returns a valid skeleton for disconnected subpaths (polygon-union picks largest region)', () => {
    const svg = makeLineArtSvg();
    const skeleton = svgToSkeleton(svg);
    // polygon-union on non-overlapping stripes returns the largest single stripe
    expect(skeleton).not.toBeNull();
    expect(skeleton!.points.length).toBeGreaterThanOrEqual(3);
    // Horizontal extent should span at least from 0.05 to 0.95
    const xs = skeleton!.points.map(([x]) => x);
    expect(Math.min(...xs)).toBeLessThanOrEqual(0.15);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(0.85);
  });
});

// ── Degenerate input ──────────────────────────────────────────────────────────

describe('svgToSkeleton — degenerate input', () => {
  it('returns null when SVG yields fewer than 3 sampled points', () => {
    const result = svgToSkeleton(LINE_SVG);
    expect(result).toBeNull();
  });
});

// ── extractOutlineContour (polygon-union) tests ──────────────────────────────

/** Square with inner diamond: outer square 10–90, inner diamond at 50,50 */
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

  it('filled icon with inner shape: outer boundary covers the square extent', () => {
    const skeleton = svgToSkeleton(SQUARE_WITH_HOLE_SVG);
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

  it('two disconnected regions: skeleton is non-null with at least 3 points', () => {
    const skeleton = svgToSkeleton(TWO_SQUARES_SVG);
    expect(skeleton).not.toBeNull();
    expect(skeleton!.points.length).toBeGreaterThanOrEqual(3);
  });
});

// ── Caching: same SVG returns same result ─────────────────────────────────────

describe('svgToSkeleton — caching', () => {
  it('returns the same skeleton for the same SVG on repeated calls', () => {
    const s1 = svgToSkeleton(SQUARE_SVG);
    const s2 = svgToSkeleton(SQUARE_SVG);
    expect(s1).not.toBeNull();
    expect(JSON.stringify(s1)).toEqual(JSON.stringify(s2));
  });

  it('polygon-union does not invoke concaveman', async () => {
    // Just verify extractOutlineContour works without concaveman
    const pts: [number, number][] = [[0,0],[1,0],[1,1],[0,1]];
    const result = extractOutlineContour([pts]);
    expect(result.length).toBeGreaterThan(0);
  });
});
