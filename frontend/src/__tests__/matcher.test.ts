import { describe, it, expect } from 'vitest';
import {
  normalise,
  rotate,
  pointToSegmentDist,
  vertexDegrees,
  effectiveDist,
  maxPairwiseAngularDist,
  selectConstellationStars,
  type Point2D,
} from '../matcher';
import type { Star } from '../types';

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

describe('pointToSegmentDist', () => {
  it('returns 0 for a point exactly on the segment interior', () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const p: Point2D = [0.5, 0]; // midpoint
    expect(pointToSegmentDist(p, a, b)).toBeCloseTo(0, 5);
  });

  it('returns perpendicular distance for a point above the segment interior', () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const p: Point2D = [0.5, 0.3];
    expect(pointToSegmentDist(p, a, b)).toBeCloseTo(0.3, 5);
  });

  it('returns distance to nearest endpoint when point is past the end', () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const p: Point2D = [2, 0]; // past b
    expect(pointToSegmentDist(p, a, b)).toBeCloseTo(1.0, 5);
  });

  it('returns distance to nearest endpoint when point is before the start', () => {
    const a: Point2D = [0, 0];
    const b: Point2D = [1, 0];
    const p: Point2D = [-1, 0]; // before a
    expect(pointToSegmentDist(p, a, b)).toBeCloseTo(1.0, 5);
  });

  it('handles degenerate zero-length segment (returns point-to-point distance)', () => {
    const a: Point2D = [0.5, 0.5];
    const p: Point2D = [0.5, 0.8];
    expect(pointToSegmentDist(p, a, a)).toBeCloseTo(0.3, 5);
  });
});

describe('vertexDegrees', () => {
  it('computes degree-1 for endpoints, degree-2 for joints in a path', () => {
    // path: 0 — 1 — 2
    const edges: [number, number][] = [[0, 1], [1, 2]];
    const deg = vertexDegrees(edges, 3);
    expect(deg[0]).toBe(1); // endpoint
    expect(deg[1]).toBe(2); // joint
    expect(deg[2]).toBe(1); // endpoint
  });

  it('computes degree-0 for isolated vertices', () => {
    const edges: [number, number][] = [[0, 1]];
    const deg = vertexDegrees(edges, 3);
    expect(deg[2]).toBe(0);
  });

  it('computes degree-3 for a fork vertex', () => {
    // 0 — 1, 1 — 2, 1 — 3
    const edges: [number, number][] = [[0, 1], [1, 2], [1, 3]];
    const deg = vertexDegrees(edges, 4);
    expect(deg[1]).toBe(3);
  });
});

describe('effectiveDist', () => {
  // Simple skeleton: two vertices (endpoints) connected by one edge
  // P0 = [-0.5, 0], P1 = [0.5, 0]  (horizontal segment in normalised space)
  const skelNorm: Point2D[] = [[-0.5, 0], [0.5, 0]];
  const edges: [number, number][] = [[0, 1]];
  const degreesEndpointOnly = vertexDegrees(edges, 2); // both degree-1

  it('returns near-zero for a point exactly on the segment', () => {
    const starOnSeg: Point2D = [0, 0]; // midpoint
    const d = effectiveDist(starOnSeg, skelNorm, edges, degreesEndpointOnly);
    expect(d).toBeCloseTo(0, 5);
  });

  it('endpoint vertex bonus reduces effective distance vs a joint bonus', () => {
    // Place a star at distance ~0.2 from vertex P0 = [-0.5, 0]
    // (close enough for the Gaussian bonus to differ between endpoint/joint,
    //  but far enough that the larger endpoint bonus doesn't clamp both to 0)
    const starNearEndpoint: Point2D = [-0.5, 0.2];

    // Skeleton with endpoint-only degrees (degree-1 for both)
    const dEndpoint = effectiveDist(starNearEndpoint, skelNorm, edges, [1, 1]);

    // Same geometry but mark both vertices as joints (degree-2)
    const dJoint = effectiveDist(starNearEndpoint, skelNorm, edges, [2, 2]);

    // Endpoint bonus should give a lower effective distance (easier to match)
    expect(dEndpoint).toBeLessThan(dJoint);
  });

  it('returns high distance for a point far from all edges', () => {
    const starFarAway: Point2D = [0, 0.8];
    const d = effectiveDist(starFarAway, skelNorm, edges, degreesEndpointOnly);
    expect(d).toBeGreaterThan(0.5);
  });
});

describe('maxPairwiseAngularDist', () => {
  it('returns 0 for a single star', () => {
    const stars: Star[] = [{ id: 1, ra: 80, dec: 0, mag: 1 }];
    expect(maxPairwiseAngularDist(stars)).toBe(0);
  });

  it('returns 0 for an empty array', () => {
    expect(maxPairwiseAngularDist([])).toBe(0);
  });

  it('returns correct angular separation for two stars on the equator', () => {
    const stars: Star[] = [
      { id: 1, ra: 0, dec: 0, mag: 1 },
      { id: 2, ra: 10, dec: 0, mag: 2 },
    ];
    expect(maxPairwiseAngularDist(stars)).toBeCloseTo(10, 2);
  });

  it('returns the maximum of multiple pairs', () => {
    const stars: Star[] = [
      { id: 1, ra: 0, dec: 0, mag: 1 },
      { id: 2, ra: 5, dec: 0, mag: 2 },
      { id: 3, ra: 20, dec: 0, mag: 3 },
    ];
    // Largest pair is star1↔star3 = 20°
    expect(maxPairwiseAngularDist(stars)).toBeCloseTo(20, 2);
  });
});

describe('selectConstellationStars', () => {
  // Simple T-shaped skeleton:
  //   P0 (top-left endpoint) ── P1 (centre joint) ── P2 (top-right endpoint)
  //                                 |
  //                                P3 (bottom endpoint)
  const skelNorm: Point2D[] = [[-0.5, -0.5], [0, -0.5], [0.5, -0.5], [0, 0.5]];
  const edges: [number, number][] = [[0, 1], [1, 2], [1, 3]];
  // degrees: P0=1, P1=3, P2=1, P3=1
  const degrees = vertexDegrees(edges, 4);

  const makeStars = (positions: Point2D[]): { stars: Star[]; norms: Point2D[] } => ({
    stars: positions.map(([x, y], i) => ({ id: i, ra: x * 10 + 100, dec: y * 10, mag: 3 })),
    norms: positions,
  });

  it('fills endpoint vertices before joint vertices', () => {
    // Place stars near each vertex — one near P1 (joint), one near each endpoint
    const { stars, norms } = makeStars([[-0.5, -0.5], [0, -0.5], [0.5, -0.5], [0, 0.5]]);
    const result = selectConstellationStars(skelNorm, edges, degrees, stars, norms);
    // P0, P2, P3 are degree-1 endpoints — their stars should be in result
    const ids = new Set(result.map((s) => s.id));
    // Stars 0,2,3 are near endpoints (P0, P2, P3); star 1 is near joint P1
    expect(ids.has(0)).toBe(true); // near P0 (endpoint)
    expect(ids.has(2)).toBe(true); // near P2 (endpoint)
    expect(ids.has(3)).toBe(true); // near P3 (endpoint)
  });

  it('enforces uniqueness — each star claimed at most once', () => {
    // Only one star available for all vertices to compete over
    const { stars, norms } = makeStars([[0, -0.5]]); // near P1 (joint/centre)
    const result = selectConstellationStars(skelNorm, edges, degrees, stars, norms);
    expect(result.length).toBe(1);
    const ids = result.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicates
  });

  it('caps result at MAX_CONSTELLATION_STARS (8)', () => {
    // Create a 10-vertex path to exceed the cap
    const bigSkel: Point2D[] = Array.from({ length: 10 }, (_, i) => [i / 9 - 0.5, 0]);
    const bigEdges: [number, number][] = Array.from({ length: 9 }, (_, i) => [i, i + 1] as [number, number]);
    const bigDegrees = vertexDegrees(bigEdges, 10);
    const { stars, norms } = makeStars(
      Array.from({ length: 10 }, (_, i) => [i / 9 - 0.5, 0]),
    );
    const result = selectConstellationStars(bigSkel, bigEdges, bigDegrees, stars, norms);
    expect(result.length).toBeLessThanOrEqual(8);
  });

  it('prefers a brighter star at moderate distance over a dim star right on vertex', () => {
    const skelNorm2: Point2D[] = [[-0.5, 0], [0.5, 0]];
    const edges2: [number, number][] = [[0, 1]];
    const degrees2 = vertexDegrees(edges2, 2);

    // Near vertex P0=[-0.5,0]: dim star exactly at vertex, bright star slightly off
    const dimOnVertex: Star = { id: 1, ra: 100, dec: 0, mag: 5.5 };
    const brightNearby: Star = { id: 2, ra: 100, dec: 1, mag: 1.0 };
    const norms2: Point2D[] = [[-0.5, 0], [-0.45, 0.02]]; // dim exactly at vtx, bright slightly off

    const result = selectConstellationStars(
      skelNorm2, edges2, degrees2,
      [dimOnVertex, brightNearby],
      norms2,
    );
    // With BRIGHTNESS_WEIGHT=0.3, bright star's lower mag compensates the small distance offset
    expect(result[0].id).toBe(2); // brighter star selected
  });
});

describe('y-flip: skeleton orientation', () => {
  it('negating y means LLM top (y=0) maps to higher normalised y than LLM bottom (y=1)', () => {
    // After y-flip: y=0 → -0, y=1 → -1
    // After normalise of [−0, −1]: top is at +0.5, bottom at −0.5
    // i.e. LLM top (y=0) ends up at normalised y=+0.5 (higher Dec), bottom at −0.5
    const skelPoints: Point2D[] = [[0.5, 0.0], [0.5, 1.0]]; // head=top, feet=bottom
    const flipped: Point2D[] = skelPoints.map(([x, y]) => [x, -y]);
    const normed = normalise(flipped);
    const headY = normed[0][1]; // originally y=0 (top in LLM space)
    const feetY = normed[1][1]; // originally y=1 (bottom in LLM space)
    expect(headY).toBeGreaterThan(feetY); // head should be at higher y (higher Dec)
  });
});
