import type { Star, Skeleton, MatchResult } from './types';

const SEED_MAX_MAG = 3;
const PATCH_RADIUS_DEG = 10;
const MAX_PATCH_RADIUS_DEG = 15;
const PATCH_RADIUS_STEP = 2.5;
const QUALITY_THRESHOLD = 0.80;
const COVERAGE_THRESHOLD = 0.60;
const MIN_MATCHED_STARS = 6;
const ROTATION_STEPS = 12; // test every 30°
const DISTANCE_THRESHOLD = 0.10; // normalised unit space
const VERTEX_BONUS_ENDPOINT = 0.6;
const VERTEX_BONUS_JOINT = 0.1;
const VERTEX_SIGMA = 0.08;
const ORION_SPAN_DEG = 25;
const BRIGHTNESS_WEIGHT = 0.3;
const MAX_MAG = 6.0;
const MAX_CONSTELLATION_STARS = 8;

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

// ── Normalisation & rotation ──────────────────────────────────────────────

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

// ── Geometry utilities ────────────────────────────────────────────────────

export function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = p[0] - a[0];
    const ey = p[1] - a[1];
    return Math.sqrt(ex * ex + ey * ey);
  }
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq));
  const cx = a[0] + t * dx;
  const cy = a[1] + t * dy;
  const ex = p[0] - cx;
  const ey = p[1] - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

export function vertexDegrees(edges: [number, number][], pointCount: number): number[] {
  const degrees = new Array<number>(pointCount).fill(0);
  for (const [i, j] of edges) {
    degrees[i]++;
    degrees[j]++;
  }
  return degrees;
}

export function effectiveDist(
  starNorm: Point2D,
  skelNorm: Point2D[],
  edges: [number, number][],
  degrees: number[],
): number {
  let dSeg = Infinity;
  for (const [i, j] of edges) {
    const d = pointToSegmentDist(starNorm, skelNorm[i], skelNorm[j]);
    if (d < dSeg) dSeg = d;
  }

  let dVtx = Infinity;
  let bestBonus = VERTEX_BONUS_JOINT;
  for (let k = 0; k < skelNorm.length; k++) {
    const dx = starNorm[0] - skelNorm[k][0];
    const dy = starNorm[1] - skelNorm[k][1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < dVtx) {
      dVtx = d;
      bestBonus = degrees[k] === 1 ? VERTEX_BONUS_ENDPOINT : VERTEX_BONUS_JOINT;
    }
  }

  const gaussian = bestBonus * Math.exp(-(dVtx * dVtx) / (VERTEX_SIGMA * VERTEX_SIGMA));
  return dSeg * (1 - gaussian);
}

export function maxPairwiseAngularDist(stars: Star[]): number {
  let max = 0;
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const d = distanceDeg(stars[i].ra, stars[i].dec, stars[j].ra, stars[j].dec);
      if (d > max) max = d;
    }
  }
  return max;
}

// ── Constellation star selection ──────────────────────────────────────────

export function selectConstellationStars(
  skelNorm: Point2D[],
  edges: [number, number][],
  degrees: number[],
  matchedStars: Star[],
  matchedNorm: Point2D[],
): Star[] {
  // Process vertices degree-1 (endpoints) first, then higher degrees
  const vertexOrder = skelNorm
    .map((_, i) => i)
    .sort((a, b) => (degrees[a] === 1 ? 0 : 1) - (degrees[b] === 1 ? 0 : 1));

  const claimed = new Set<number>();
  const result: Star[] = [];

  for (const vi of vertexOrder) {
    if (result.length >= MAX_CONSTELLATION_STARS) break;

    const [vx, vy] = skelNorm[vi];
    let bestScore = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < matchedStars.length; j++) {
      if (claimed.has(j)) continue;
      const dx = matchedNorm[j][0] - vx;
      const dy = matchedNorm[j][1] - vy;
      const dVtx = Math.sqrt(dx * dx + dy * dy);
      const score = dVtx + BRIGHTNESS_WEIGHT * (matchedStars[j].mag / MAX_MAG);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      claimed.add(bestIdx);
      result.push(matchedStars[bestIdx]);
    }
  }

  return result;
}

// ── Core matching ─────────────────────────────────────────────────────────

interface ScoreResult {
  score: number;
  stars: Star[];
  constellationStars: Star[];
  skeletonRaDec: { ra: number; dec: number }[];
}

function scoreAndMatch(
  skelPoints: Point2D[],
  edges: [number, number][],
  candidates: Star[],
  rotDeg: number,
): ScoreResult {
  // y-flip: LLM uses y=0 top, sky uses Dec increasing upward
  const flipped: Point2D[] = skelPoints.map(([x, y]) => [x, -y]);

  // Normalise skeleton (rotated)
  const skelNorm = normalise(rotate(flipped, rotDeg));

  // Normalise candidate star positions using flat-sky approx
  const starFlat: Point2D[] = candidates.map((s) => [s.ra, s.dec]);
  const starNorm = normalise(starFlat);

  // Star bounding box params for inverse transform (skelNorm → RA/Dec)
  const starXs = starFlat.map((p) => p[0]);
  const starYs = starFlat.map((p) => p[1]);
  const starMinX = Math.min(...starXs), starMaxX = Math.max(...starXs);
  const starMinY = Math.min(...starYs), starMaxY = Math.max(...starYs);
  const starRange = Math.max(starMaxX - starMinX, starMaxY - starMinY) || 1;
  const starCx = (starMinX + starMaxX) / 2;
  const starCy = (starMinY + starMaxY) / 2;

  const degrees = vertexDegrees(edges, skelPoints.length);

  // Score each candidate star, tracking its normalised position
  const matched: Array<{ star: Star; norm: Point2D; d: number }> = [];
  for (let j = 0; j < candidates.length; j++) {
    const d = effectiveDist(starNorm[j], skelNorm, edges, degrees);
    if (d < DISTANCE_THRESHOLD) {
      matched.push({ star: candidates[j], norm: starNorm[j], d });
    }
  }

  matched.sort((a, b) => a.d - b.d);

  const score = candidates.length > 0 ? matched.length / candidates.length : 0;

  const constellationStars = selectConstellationStars(
    skelNorm,
    edges,
    degrees,
    matched.map((m) => m.star),
    matched.map((m) => m.norm),
  );

  // Convert skeleton normalised coords to RA/Dec using star bounding box
  const skeletonRaDec = skelNorm.map(([nx, ny]) => ({
    ra: nx * starRange + starCx,
    dec: ny * starRange + starCy,
  }));

  return { score, stars: matched.map((m) => m.star), constellationStars, skeletonRaDec };
}

// ── Seed sweep (single skeleton) ──────────────────────────────────────────

function runSeedSweep(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  patchRadius: number,
): (ScoreResult & { seed: Star }) | null {
  const { points, edges } = skeleton;

  const seeds = catalogue
    .filter((s) => s.mag <= SEED_MAX_MAG && !excludeSeeds.has(s.id))
    .sort((a, b) => a.mag - b.mag);

  let globalBest: (ScoreResult & { seed: Star }) | null = null;

  for (const seed of seeds) {
    const candidates = catalogue.filter(
      (s) => distanceDeg(s.ra, s.dec, seed.ra, seed.dec) <= patchRadius,
    );
    if (candidates.length < MIN_MATCHED_STARS) continue;

    let best: ScoreResult = { score: 0, stars: [], constellationStars: [], skeletonRaDec: [] };

    for (let r = 0; r < ROTATION_STEPS; r++) {
      const rotDeg = (r * 360) / ROTATION_STEPS;
      const result = scoreAndMatch(points, edges, candidates, rotDeg);
      if (result.score > best.score) best = result;
    }

    if (!globalBest || best.score > globalBest.score) {
      globalBest = { ...best, seed };
    }

    if (best.score >= COVERAGE_THRESHOLD && best.stars.length >= MIN_MATCHED_STARS) {
      console.log(
        `[matcher] hit ${(best.score * 100).toFixed(0)}% (${best.stars.length} stars) on seed ${seed.id} mag ${seed.mag.toFixed(2)}`,
      );
      break;
    }
  }

  return globalBest;
}

// ── Public API ────────────────────────────────────────────────────────────

export function match(
  catalogue: Star[],
  skeletons: Skeleton[],
  excludeSeeds: Set<number> = new Set(),
): MatchResult | null {
  let globalBest: (ScoreResult & { seed: Star; variantIndex: number }) | null = null;
  let currentRadius = PATCH_RADIUS_DEG;

  while (true) {
    for (let i = 0; i < skeletons.length; i++) {
      const result = runSeedSweep(skeletons[i], catalogue, excludeSeeds, currentRadius);
      if (!result) continue;
      if (!globalBest || result.score > globalBest.score) {
        globalBest = { ...result, variantIndex: i };
      }
    }

    if (globalBest && globalBest.score >= QUALITY_THRESHOLD) break;
    if (currentRadius >= MAX_PATCH_RADIUS_DEG) break;
    const next = Math.min(currentRadius + PATCH_RADIUS_STEP, MAX_PATCH_RADIUS_DEG);
    console.log(
      `[matcher] score ${globalBest ? (globalBest.score * 100).toFixed(0) + '%' : 'none'} below ${(QUALITY_THRESHOLD * 100).toFixed(0)}%, expanding radius ${currentRadius}° → ${next}°`,
    );
    currentRadius = next;
  }

  if (!globalBest || globalBest.stars.length === 0) return null;

  excludeSeeds.add(globalBest.seed.id);

  console.log(
    `[matcher] variant ${globalBest.variantIndex} won with ${(globalBest.score * 100).toFixed(0)}%`,
  );

  const span = maxPairwiseAngularDist(globalBest.stars);
  console.log(
    `[matcher] pattern size: ${span.toFixed(1)}° (${Math.round((span / ORION_SPAN_DEG) * 100)}% of Orion)`,
  );

  return {
    stars: globalBest.stars,
    constellationStars: globalBest.constellationStars,
    edges: skeletons[globalBest.variantIndex].edges,
    patchRA: globalBest.seed.ra,
    patchDec: globalBest.seed.dec,
    skeletonPoints: globalBest.skeletonRaDec,
    variantIndex: globalBest.variantIndex,
  };
}
