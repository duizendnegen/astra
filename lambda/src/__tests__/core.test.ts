import { describe, it, expect } from 'vitest';
import { isValidSkeleton } from '../core';

describe('isValidSkeleton', () => {
  it('accepts a valid skeleton', () => {
    expect(isValidSkeleton({
      points: [[0, 0], [0.5, 1], [1, 0]],
      edges: [[0, 1], [1, 2]],
    })).toBe(true);
  });

  it('rejects null', () => {
    expect(isValidSkeleton(null)).toBe(false);
  });

  it('rejects fewer than 3 points', () => {
    expect(isValidSkeleton({
      points: [[0, 0], [1, 1]],
      edges: [[0, 1]],
    })).toBe(false);
  });

  it('rejects more than 15 points', () => {
    const points = Array.from({ length: 16 }, (_, i) => [i / 15, i / 15] as [number, number]);
    expect(isValidSkeleton({ points, edges: [[0, 1]] })).toBe(false);
  });

  it('rejects points outside 0–1 range', () => {
    expect(isValidSkeleton({
      points: [[0, 0], [1.1, 0.5], [0.5, 0.5]],
      edges: [[0, 1]],
    })).toBe(false);
  });

  it('rejects edges referencing out-of-bounds indices', () => {
    expect(isValidSkeleton({
      points: [[0, 0], [0.5, 1], [1, 0]],
      edges: [[0, 5]],
    })).toBe(false);
  });

  it('rejects fewer than 2 edges', () => {
    expect(isValidSkeleton({
      points: [[0, 0], [0.5, 1], [1, 0]],
      edges: [[0, 1]],
    })).toBe(false);
  });
});
