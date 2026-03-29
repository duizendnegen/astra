import type { Star, Skeleton, MatchResult } from './types';

const PATCH_RADIUS_DEG = 20;
const COVERAGE_THRESHOLD = 0.60;
const MIN_MATCHED_STARS = 6;
const MAX_ATTEMPTS = 60;
const ROTATION_STEPS = 12; // test every 30°
const DISTANCE_THRESHOLD = 0.10; // normalised unit space
const CANDIDATE_COUNT = 12; // fixed pool size, independent of skeleton size

// ── Haversine distance ────────────────────────────────────────────────────

function distanceDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  const dRa = ((ra2 - ra1) * Math.PI) / 180;
  const dDec = ((dec2 - dec1) * Math.PI) / 180;
  const a =
    Math.sin(dDec / 2) ** 2 +
    Math.cos((dec1 * Math.PI) / 180) *
      Math.cos((dec2 * Math.PI) / 180) *
      Math.sin(dRa / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180) / Math.PI;
}

// ── Patch extraction ──────────────────────────────────────────────────────

function starsInPatch(catalogue: Star[], ra: number, dec: number, count: number): Star[] {
  return catalogue
    .filter((s) => distanceDeg(s.ra, s.dec, ra, dec) <= PATCH_RADIUS_DEG)
    .sort((a, b) => a.mag - b.mag) // brightest first
    .slice(0, count);
}

// ── Normalisation ─────────────────────────────────────────────────────────

export type Point2D = [number, number];

export function normalise(points: Point2D[]): Point2D[] {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const range = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map(([x, y]) => [(x - cx) / range, (y - cy) / range]);
}

export function rotate(points: Point2D[], angleDeg: number): Point2D[] {
  const a = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return points.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

// ── Hungarian algorithm (Munkres) ────────────────────────────────────────
// Minimises total assignment cost for an n×n cost matrix.

export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);

    do {
      used[j0] = true;
      let i0 = p[j0], delta = Infinity, j1 = -1;

      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minVal[j]) { minVal[j] = cur; way[j] = j0; }
          if (minVal[j] < delta) { delta = minVal[j]; j1 = j; }
        }
      }

      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minVal[j] -= delta; }
      }
      j0 = j1!;
    } while (p[j0] !== 0);

    do {
      p[j0] = p[way[j0]];
      j0 = way[j0];
    } while (j0);
  }

  // Build assignment: result[i] = j (0-indexed), star j assigned to skeleton point i
  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] !== 0) assignment[p[j] - 1] = j - 1;
  }
  return assignment;
}

// ── Matching ──────────────────────────────────────────────────────────────

function scoreAssignment(
  skelNorm: Point2D[],
  starNorm: Point2D[],
  assignment: number[],
): number {
  let matched = 0;
  for (let i = 0; i < skelNorm.length; i++) {
    const j = assignment[i];
    if (j < 0 || j >= starNorm.length) continue;
    const dx = skelNorm[i][0] - starNorm[j][0];
    const dy = skelNorm[i][1] - starNorm[j][1];
    if (Math.sqrt(dx * dx + dy * dy) <= DISTANCE_THRESHOLD) matched++;
  }
  return matched / skelNorm.length;
}

interface TryMatchResult {
  assignment: number[];
  score: number;
  skeletonRaDec: { ra: number; dec: number }[];
}

function tryMatch(skelPoints: Point2D[], candidates: Star[], rotDeg: number): TryMatchResult {
  const n = Math.max(skelPoints.length, candidates.length);

  // Normalise skeleton (rotated) — save real points before padding
  const skelNorm = normalise(rotate(skelPoints, rotDeg));
  const realSkelNorm = skelNorm.slice(); // snapshot before padding

  // Normalise candidate star positions using flat-sky approx
  const starFlat: Point2D[] = candidates.map((s) => [s.ra, s.dec]);
  const starNorm = normalise(starFlat);

  // Compute star bounding box params for inverse transform (skelNorm → RA/Dec)
  const starXs = starFlat.map((p) => p[0]);
  const starYs = starFlat.map((p) => p[1]);
  const starMinX = Math.min(...starXs), starMaxX = Math.max(...starXs);
  const starMinY = Math.min(...starYs), starMaxY = Math.max(...starYs);
  const starRange = Math.max(starMaxX - starMinX, starMaxY - starMinY) || 1;
  const starCx = (starMinX + starMaxX) / 2;
  const starCy = (starMinY + starMaxY) / 2;

  // Pad smaller set to n×n
  while (skelNorm.length < n) skelNorm.push([999, 999]);
  while (starNorm.length < n) starNorm.push([999, 999]);

  // Build cost matrix using squared distance — penalises outlier pairings more heavily
  const cost: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      const dx = skelNorm[i][0] - starNorm[j][0];
      const dy = skelNorm[i][1] - starNorm[j][1];
      return dx * dx + dy * dy;
    }),
  );

  const assignment = hungarian(cost);
  const score = scoreAssignment(
    skelNorm.slice(0, skelPoints.length),
    starNorm,
    assignment.slice(0, skelPoints.length),
  );

  // Convert skeleton normalised coords to RA/Dec using star bounding box
  const skeletonRaDec = realSkelNorm.map(([nx, ny]) => ({
    ra: nx * starRange + starCx,
    dec: ny * starRange + starCy,
  }));

  return { assignment: assignment.slice(0, skelPoints.length), score, skeletonRaDec };
}

// ── Random patch centre ───────────────────────────────────────────────────

function randomPatchCentre(exclude: Set<string>): { ra: number; dec: number } {
  for (let i = 0; i < 100; i++) {
    const ra = Math.random() * 360;
    const dec = Math.asin(Math.random() * 2 - 1) * (180 / Math.PI);
    const key = `${Math.round(ra)},${Math.round(dec)}`;
    if (!exclude.has(key)) {
      exclude.add(key);
      return { ra, dec };
    }
  }
  return { ra: Math.random() * 360, dec: (Math.random() - 0.5) * 160 };
}

// ── Public API ────────────────────────────────────────────────────────────

export function match(
  catalogue: Star[],
  skeleton: Skeleton,
  excludePatches: Set<string> = new Set(),
): MatchResult | null {
  const { points, edges } = skeleton;
  const targetCount = points.length;

  let globalBest: {
    assignment: number[];
    score: number;
    skeletonRaDec: { ra: number; dec: number }[];
    ra: number;
    dec: number;
    candidates: Star[];
  } | null = null;

  let attempt = 0;
  for (; attempt < MAX_ATTEMPTS; attempt++) {
    const { ra, dec } = randomPatchCentre(excludePatches);
    const candidates = starsInPatch(catalogue, ra, dec, CANDIDATE_COUNT);
    if (candidates.length < MIN_MATCHED_STARS) continue;

    let best: TryMatchResult & { score: number } = { assignment: [], score: 0, skeletonRaDec: [] };

    for (let r = 0; r < ROTATION_STEPS; r++) {
      const rotDeg = (r * 360) / ROTATION_STEPS;
      const result = tryMatch(points, candidates, rotDeg);
      if (result.score > best.score) best = result;
    }

    const matchedCount = Math.round(best.score * points.length);
    if (best.score >= COVERAGE_THRESHOLD && matchedCount >= MIN_MATCHED_STARS) {
      console.log(`[matcher] hit ${(best.score * 100).toFixed(0)}% (${matchedCount}/${points.length} stars) on attempt ${attempt + 1}/${MAX_ATTEMPTS}`);
      const matchedStars = best.assignment.map((j) => candidates[j] ?? candidates[0]);
      return { stars: matchedStars, edges, patchRA: ra, patchDec: dec, skeletonPoints: best.skeletonRaDec };
    }

    if (!globalBest || best.score > globalBest.score) {
      globalBest = { ...best, ra, dec, candidates };
    }
  }

  // No patch hit threshold — return the best match found across all attempts
  console.log(`[matcher] exhausted ${attempt} attempts, best score: ${((globalBest?.score ?? 0) * 100).toFixed(0)}%`);
  if (globalBest && globalBest.score > 0) {
    const matchedStars = globalBest.assignment.map((j) => globalBest!.candidates[j] ?? globalBest!.candidates[0]);
    return { stars: matchedStars, edges, patchRA: globalBest.ra, patchDec: globalBest.dec, skeletonPoints: globalBest.skeletonRaDec };
  }

  return null;
}
