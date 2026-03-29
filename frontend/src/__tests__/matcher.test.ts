import { describe, it, expect } from 'vitest';
import { normalise, rotate, hungarian, type Point2D } from '../matcher';

describe('normalise', () => {
  it('centres bounding box around origin', () => {
    const pts: Point2D[] = [[0, 0], [2, 0], [1, 2]];
    const norm = normalise(pts);
    const xs = norm.map(p => p[0]);
    const ys = norm.map(p => p[1]);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(midX).toBeCloseTo(0, 5);
    expect(midY).toBeCloseTo(0, 5);
  });

  it('scales range to ≤ 1', () => {
    const pts: Point2D[] = [[0, 0], [10, 0], [5, 8]];
    const norm = normalise(pts);
    for (const [x, y] of norm) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.51);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.51);
    }
  });

  it('handles single point without throwing', () => {
    expect(() => normalise([[0.5, 0.5]])).not.toThrow();
  });
});

describe('rotate', () => {
  it('rotating by 0° is a no-op', () => {
    const pts: Point2D[] = [[1, 0], [0, 1]];
    const result = rotate(pts, 0);
    expect(result[0][0]).toBeCloseTo(1);
    expect(result[0][1]).toBeCloseTo(0);
  });

  it('rotating by 90° maps [1,0] → [0,1]', () => {
    const result = rotate([[1, 0]], 90);
    expect(result[0][0]).toBeCloseTo(0, 5);
    expect(result[0][1]).toBeCloseTo(1, 5);
  });

  it('rotating by 180° negates both coordinates', () => {
    const result = rotate([[1, 0.5]], 180);
    expect(result[0][0]).toBeCloseTo(-1, 5);
    expect(result[0][1]).toBeCloseTo(-0.5, 5);
  });

  it('rotating by 360° returns to original', () => {
    const pts: Point2D[] = [[0.3, 0.7], [-0.2, 0.1]];
    const result = rotate(pts, 360);
    for (let i = 0; i < pts.length; i++) {
      expect(result[i][0]).toBeCloseTo(pts[i][0], 5);
      expect(result[i][1]).toBeCloseTo(pts[i][1], 5);
    }
  });
});

describe('hungarian', () => {
  it('solves a trivial 1×1 cost matrix', () => {
    expect(hungarian([[5]])).toEqual([0]);
  });

  it('assigns optimal 1-to-1 matching for 2×2', () => {
    // cost[0][1]=1 and cost[1][0]=1 is cheaper than diagonal (10+10)
    const cost = [[10, 1], [1, 10]];
    const assignment = hungarian(cost);
    expect(assignment[0]).toBe(1);
    expect(assignment[1]).toBe(0);
  });

  it('solves a known 3×3 case', () => {
    // Optimal: 0→2 (cost 1), 1→0 (cost 2), 2→1 (cost 3), total=6
    const cost = [
      [9, 9, 1],
      [2, 9, 9],
      [9, 3, 9],
    ];
    const assignment = hungarian(cost);
    expect(assignment[0]).toBe(2);
    expect(assignment[1]).toBe(0);
    expect(assignment[2]).toBe(1);
  });

  it('produces a valid permutation (no duplicate assignments)', () => {
    const n = 4;
    const cost = Array.from({ length: n }, () =>
      Array.from({ length: n }, () => Math.random() * 10),
    );
    const assignment = hungarian(cost);
    const assigned = new Set(assignment);
    expect(assigned.size).toBe(n);
  });
});
