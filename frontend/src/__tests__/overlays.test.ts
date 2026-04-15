import { describe, it, expect } from 'vitest';
import { bboxIntersects } from '../renderer';
import type { ConstellationLines } from '../types';

// ── FOV culling ───────────────────────────────────────────────────────────

function makeBbox(minRA: number, maxRA: number, minDec: number, maxDec: number, wraps = false): ConstellationLines['bbox'] {
  return { minRA, maxRA, minDec, maxDec, wraps };
}

describe('bboxIntersects', () => {
  const fov = { minRA: 70, maxRA: 100, minDec: -15, maxDec: 25 }; // roughly Orion region

  it('returns true for constellation fully inside FOV', () => {
    expect(bboxIntersects(makeBbox(75, 90, -5, 20), fov)).toBe(true);
  });

  it('returns true for constellation partially overlapping FOV', () => {
    expect(bboxIntersects(makeBbox(60, 80, -5, 20), fov)).toBe(true);
  });

  it('returns false for constellation entirely outside FOV (RA)', () => {
    expect(bboxIntersects(makeBbox(110, 140, -5, 20), fov)).toBe(false);
  });

  it('returns false for constellation entirely outside FOV (Dec)', () => {
    expect(bboxIntersects(makeBbox(75, 90, 30, 50), fov)).toBe(false);
  });

  it('returns true for wrapping constellation when FOV overlaps high-RA end', () => {
    // Constellation wraps: covers [340,360] ∪ [0,20]
    const wrapping = makeBbox(340, 20, -30, 10, true);
    const highRAFov = { minRA: 330, maxRA: 360, minDec: -40, maxDec: 20 };
    expect(bboxIntersects(wrapping, highRAFov)).toBe(true);
  });

  it('returns true for wrapping constellation when FOV overlaps low-RA end', () => {
    const wrapping = makeBbox(340, 20, -30, 10, true);
    const lowRAFov = { minRA: 0, maxRA: 30, minDec: -40, maxDec: 20 };
    expect(bboxIntersects(wrapping, lowRAFov)).toBe(true);
  });

  it('returns false for wrapping constellation when FOV is in the middle gap', () => {
    const wrapping = makeBbox(340, 20, -30, 10, true);
    const midFov = { minRA: 100, maxRA: 200, minDec: -40, maxDec: 20 };
    expect(bboxIntersects(wrapping, midFov)).toBe(false);
  });
});
