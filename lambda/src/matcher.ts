import type { Star, Skeleton, MatchResult } from './types';
import { createLogger } from './logger.js';

const log = createLogger('matcher');

// ── Public config types ───────────────────────────────────────────────────

export type ModelName = 'vertex-penalty' | 'skeleton-shape';

/** Pass as the optional fourth argument to match() to select a model and/or
 *  override individual constants. All fields except `model` are optional —
 *  omitted fields fall back to the named model's defaults. */
export interface MatcherConfig {
  model: ModelName;
  // Search strategy
  seedMaxMag?: number;
  patchRadius?: number;
  maxPatchRadius?: number;
  patchRadiusStep?: number;
  qualityThreshold?: number;
  coverageThreshold?: number;
  minMatchedStars?: number;
  rotationSteps?: number;
  skeletonFillRatio?: number;
  // Scoring
  distanceThreshold?: number;
  vertexBonusEndpoint?: number;
  vertexBonusJoint?: number;
  vertexSigma?: number;
  brightnessWeight?: number;
  maxConstellationStars?: number;
  penaltyWeight?: number;
  chamferCap?: number;
  skeletonShapeRefine?: boolean;
  assignmentAlgorithm?: 'greedy' | 'hungarian';
}

// ── Internal types ────────────────────────────────────────────────────────

interface ModelDefaults {
  seedMaxMag: number;
  patchRadius: number;
  maxPatchRadius: number;
  patchRadiusStep: number;
  qualityThreshold: number;
  coverageThreshold: number;
  minMatchedStars: number;
  rotationSteps: number;
  skeletonFillRatio: number;
  distanceThreshold: number;
  vertexBonusEndpoint: number;
  vertexBonusJoint: number;
  vertexSigma: number;
  brightnessWeight: number;
  maxConstellationStars: number;
  penaltyWeight: number;
  chamferCap: number;
  skeletonShapeRefine: boolean;
  assignmentAlgorithm: 'greedy' | 'hungarian';
}

interface ResolvedConfig extends ModelDefaults {
  model: ModelName;
}

interface ScoringModel {
  defaults: ModelDefaults;
  starLoss(d: number): number;
  vertexBonus(dVtx: number, degree: number, cfg: ResolvedConfig): number;
  penaltyScore(matchedNorm: Point2D[], skelNorm: Point2D[], cfg: ResolvedConfig): number;
}

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

/** Legacy utility — kept for unit tests. Not used in the matching hot path
 *  since fix-normalization replaced it with a seed-anchored physical frame. */
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

// ── Model definitions ─────────────────────────────────────────────────────

// Shared defaults — all three models start from these values.
// Constants are in units of "fraction of patchRadius" (physical frame from fix-normalization).
// At the default 10° patch: distanceThreshold=0.15 → 1.5°, vertexSigma=0.12 → 1.2°.
// Validated empirically against 42-word test suite (see test-harness/).
const BASE_DEFAULTS: ModelDefaults = {
  seedMaxMag: 3,
  patchRadius: 10,        // degrees
  maxPatchRadius: 15,     // degrees
  patchRadiusStep: 2.5,   // degrees
  qualityThreshold: 0.70,
  coverageThreshold: 0.99,
  minMatchedStars: 6,
  rotationSteps: 24,      // every 15°
  skeletonFillRatio: 0.8, // skeleton longest axis = 80% of patch diameter
  distanceThreshold: 0.15, // 1.5° at default patch
  vertexBonusEndpoint: 2.0,
  vertexBonusJoint: 0.4,
  vertexSigma: 0.12,      // 1.2° at default patch
  brightnessWeight: 0.3,
  maxConstellationStars: 8,
  penaltyWeight: 0.3,
  chamferCap: 1.0,
  skeletonShapeRefine: false,
  assignmentAlgorithm: 'hungarian',
};

const VERTEX_PENALTY_MODEL: ScoringModel = {
  defaults: { ...BASE_DEFAULTS },
  starLoss: (d) => d,
  vertexBonus: (dVtx, degree, cfg) => {
    const bonus = degree === 1 ? cfg.vertexBonusEndpoint : cfg.vertexBonusJoint;
    return bonus * Math.exp(-(dVtx * dVtx) / (cfg.vertexSigma * cfg.vertexSigma));
  },
  penaltyScore: (matchedNorm, skelNorm, cfg) => {
    const uncovered = skelNorm.filter(([vx, vy]) =>
      !matchedNorm.some(([mx, my]) => {
        const dx = mx - vx, dy = my - vy;
        return Math.sqrt(dx * dx + dy * dy) < cfg.distanceThreshold;
      }),
    ).length;
    return cfg.penaltyWeight * uncovered / Math.max(1, skelNorm.length);
  },
};

// skeleton-shape model — scoring is handled as a special path in scoreAndMatch;
// these interface methods are not called for this model.
const SKELETON_SHAPE_MODEL: ScoringModel = {
  defaults: { ...BASE_DEFAULTS },
  starLoss: (d) => d,
  vertexBonus: () => 0,
  penaltyScore: () => 0,
};

const MODELS: Record<ModelName, ScoringModel> = {
  'vertex-penalty': VERTEX_PENALTY_MODEL,
  'skeleton-shape': SKELETON_SHAPE_MODEL,
};

function resolveConfig(config?: MatcherConfig): ResolvedConfig {
  const modelName = config?.model ?? 'vertex-penalty';
  const model = MODELS[modelName];
  return { ...model.defaults, ...config, model: modelName };
}

// ── Scoring ───────────────────────────────────────────────────────────────

export function effectiveDist(
  starNorm: Point2D,
  skelNorm: Point2D[],
  edges: [number, number][],
  degrees: number[],
  cfg: ResolvedConfig = resolveConfig(),
): number {
  let dSeg = Infinity;
  for (const [i, j] of edges) {
    const d = pointToSegmentDist(starNorm, skelNorm[i], skelNorm[j]);
    if (d < dSeg) dSeg = d;
  }

  let dVtx = Infinity;
  let bestDegree = 2;
  for (let k = 0; k < skelNorm.length; k++) {
    const dx = starNorm[0] - skelNorm[k][0];
    const dy = starNorm[1] - skelNorm[k][1];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < dVtx) {
      dVtx = d;
      bestDegree = degrees[k];
    }
  }

  const bonusValue = MODELS[cfg.model].vertexBonus(dVtx, bestDegree, cfg);
  return Math.max(0, dSeg - bonusValue);
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

// ── Hungarian algorithm (min-cost bipartite matching) ─────────────────────

/** Jonker-Volgenant style Hungarian algorithm on an n×m cost matrix (n ≤ m).
 *  Returns result[i] = column index assigned to row i, minimising total cost. */
function hungarianAssign(cost: number[][]): number[] {
  const n = cost.length;
  const m = cost[0].length;
  // u[i] row potential (1-indexed), v[j] col potential (1-indexed)
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0); // p[j] = row matched to col j (0 = none)
  const way = new Array<number>(m + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minVal = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);

    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minVal[j]) { minVal[j] = cur; way[j] = j0; }
          if (minVal[j] < delta) { delta = minVal[j]; j1 = j; }
        }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
        else { minVal[j] -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);

    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0 !== 0);
  }

  const result = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) {
    if (p[j] !== 0) result[p[j] - 1] = j - 1;
  }
  return result;
}

// ── Territory-based star selection helpers ────────────────────────────────

/** Build DFS Euler tour from adj starting at root, returning the sequence of vertices
 *  visited including backtracks (each edge traversed twice for a tree). */
function eulerTour(adj: number[][], root: number): number[] {
  const tour: number[] = [];
  const visited = new Set<number>();
  function dfs(v: number): void {
    tour.push(v);
    visited.add(v);
    for (const u of adj[v]) {
      if (!visited.has(u)) {
        dfs(u);
        tour.push(v);
      }
    }
  }
  dfs(root);
  return tour;
}

/** For each skeleton vertex, compute [lo, hi] arc-length territory along the DFS Euler tour.
 *  Territory boundaries are midpoints between consecutive first-visit arc-length positions. */
export function buildSkeletonTerritories(
  skelNorm: Point2D[],
  edges: [number, number][],
): { territories: { lo: number; hi: number }[]; tourPath: Point2D[]; tourArcLens: number[] } {
  const n = skelNorm.length;
  const fallback = skelNorm.map(() => ({ lo: 0, hi: 0 }));

  if (n === 0) return { territories: fallback, tourPath: [], tourArcLens: [] };

  // Build adjacency list
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [i, j] of edges) {
    adj[i].push(j);
    adj[j].push(i);
  }

  // Find highest-degree vertex as DFS root
  let startVertex = 0;
  for (let i = 1; i < n; i++) {
    if (adj[i].length > adj[startVertex].length) startVertex = i;
  }

  // Build Euler tour (DFS with backtracking)
  const tour = eulerTour(adj, startVertex);

  // Compute arc-lengths along the tour polyline
  const tourArcLens: number[] = [0];
  for (let i = 1; i < tour.length; i++) {
    const [ax, ay] = skelNorm[tour[i - 1]];
    const [bx, by] = skelNorm[tour[i]];
    tourArcLens.push(tourArcLens[i - 1] + Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2));
  }
  const totalLen = tourArcLens[tourArcLens.length - 1];
  const tourPath: Point2D[] = tour.map(v => skelNorm[v]);

  // Record first-visit arc-length for each vertex and the DFS first-visit order
  const firstVisitArcLen = new Array<number>(n).fill(-1);
  const firstVisitOrder: number[] = [];
  for (let i = 0; i < tour.length; i++) {
    const v = tour[i];
    if (firstVisitArcLen[v] < 0) {
      firstVisitArcLen[v] = tourArcLens[i];
      firstVisitOrder.push(v);
    }
  }

  // Sort first-visit order by arc-length (ascending)
  firstVisitOrder.sort((a, b) => firstVisitArcLen[a] - firstVisitArcLen[b]);
  const sortedArcLens = firstVisitOrder.map(v => firstVisitArcLen[v]);

  // Build territories: midpoints between consecutive first-visit arc-lengths
  const territories: { lo: number; hi: number }[] = Array.from({ length: n }, () => ({ lo: 0, hi: 0 }));
  for (let i = 0; i < firstVisitOrder.length; i++) {
    const v = firstVisitOrder[i];
    const t = sortedArcLens[i];
    const lo = i === 0 ? 0 : (sortedArcLens[i - 1] + t) / 2;
    const hi = i === firstVisitOrder.length - 1 ? totalLen : (t + sortedArcLens[i + 1]) / 2;
    territories[v] = { lo, hi };
  }

  return { territories, tourPath, tourArcLens };
}

/** Project a star's normalised position onto the DFS traversal polyline.
 *  Returns the arc-length parameter t of the closest point on the polyline. */
export function projectOntoPath(
  starNorm: Point2D,
  tourPath: Point2D[],
  tourArcLens: number[],
): number {
  let bestT = 0;
  let bestDistSq = Infinity;
  const [sx, sy] = starNorm;

  for (let i = 0; i + 1 < tourPath.length; i++) {
    const [ax, ay] = tourPath[i];
    const [bx, by] = tourPath[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;

    let proj: [number, number];
    let t01: number;
    if (lenSq === 0) {
      proj = [ax, ay];
      t01 = 0;
    } else {
      t01 = Math.max(0, Math.min(1, ((sx - ax) * dx + (sy - ay) * dy) / lenSq));
      proj = [ax + t01 * dx, ay + t01 * dy];
    }

    const ex = sx - proj[0];
    const ey = sy - proj[1];
    const distSq = ex * ex + ey * ey;

    if (distSq < bestDistSq) {
      bestDistSq = distSq;
      bestT = tourArcLens[i] + t01 * (tourArcLens[i + 1] - tourArcLens[i]);
    }
  }

  return bestT;
}

// ── Constellation star selection ──────────────────────────────────────────

export function selectConstellationStars(
  skelNorm: Point2D[],
  edges: [number, number][],
  _degrees: number[],
  matchedStars: Star[],
  matchedNorm: Point2D[],
  cfg: ResolvedConfig = resolveConfig(),
): Star[] {
  const nVtx = Math.min(skelNorm.length, cfg.maxConstellationStars);
  const nStars = matchedStars.length;
  if (nStars === 0) return [];

  if (cfg.assignmentAlgorithm === 'hungarian' && nVtx <= nStars) {
    // Build n×m cost matrix (n = capped vertices, m = matched stars)
    const cost: number[][] = [];
    for (let i = 0; i < nVtx; i++) {
      const [vx, vy] = skelNorm[i];
      cost.push(matchedStars.map((s, j) => {
        const dx = matchedNorm[j][0] - vx;
        const dy = matchedNorm[j][1] - vy;
        return Math.sqrt(dx * dx + dy * dy) + cfg.brightnessWeight * (s.mag / 6.0);
      }));
    }
    const assignment = hungarianAssign(cost);
    return assignment.map((j) => matchedStars[j]);
  }

  // Territory-based allocation: assign stars to vertices in skeleton index order
  // so that constellationStars[i] is the star for vertex i.
  const { territories, tourPath, tourArcLens } = buildSkeletonTerritories(skelNorm, edges);

  // Precompute DFS path projection for each matched star
  const starProjections = matchedNorm.map(
    snorm => projectOntoPath(snorm, tourPath, tourArcLens),
  );

  const claimed = new Set<number>();
  const result: Star[] = [];

  for (let vi = 0; vi < nVtx; vi++) {
    if (claimed.size >= nStars) break;

    const { lo, hi } = territories[vi];
    const [vx, vy] = skelNorm[vi];

    // Find best star within territory by composite score
    let bestScore = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < nStars; j++) {
      if (claimed.has(j)) continue;
      if (starProjections[j] < lo || starProjections[j] > hi) continue;
      const dx = matchedNorm[j][0] - vx;
      const dy = matchedNorm[j][1] - vy;
      const dVtx = Math.sqrt(dx * dx + dy * dy);
      const score = dVtx + cfg.brightnessWeight * (matchedStars[j].mag / 6.0);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    // Fallback: nearest unclaimed star globally
    if (bestIdx === -1) {
      bestScore = Infinity;
      for (let j = 0; j < nStars; j++) {
        if (claimed.has(j)) continue;
        const dx = matchedNorm[j][0] - vx;
        const dy = matchedNorm[j][1] - vy;
        const dVtx = Math.sqrt(dx * dx + dy * dy);
        const score = dVtx + cfg.brightnessWeight * (matchedStars[j].mag / 6.0);
        if (score < bestScore) {
          bestScore = score;
          bestIdx = j;
        }
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
  edgeStarChains?: Star[][];
}

function scoreAndMatch(
  skelPoints: Point2D[],
  edges: [number, number][],
  candidates: Star[],
  rotDeg: number,
  seed: Star,
  cfg: ResolvedConfig,
  anchorVertex: number = -1,
): ScoreResult {
  let anchored: Point2D[];
  if (anchorVertex >= 0 && anchorVertex < skelPoints.length) {
    const [ax, ay] = skelPoints[anchorVertex];
    anchored = skelPoints.map(([x, y]) => [x - ax, ay - y]);
  } else {
    anchored = skelPoints.map(([x, y]) => [x - 0.5, 0.5 - y]);
  }
  const scale = cfg.skeletonFillRatio * 2;
  const skelNorm: Point2D[] = rotate(anchored, rotDeg).map(([x, y]) => [x * scale, y * scale]);

  const starNorm: Point2D[] = candidates.map((s) => [
    (s.ra - seed.ra) / cfg.patchRadius,
    (s.dec - seed.dec) / cfg.patchRadius,
  ]);

  const degrees = vertexDegrees(edges, skelPoints.length);

  // ── skeleton-shape model: edge-length scoring ──────────────────────────
  if (cfg.model === 'skeleton-shape') {
    // NN assignment: map each skeleton vertex to the nearest unassigned candidate
    const assignment = new Array<number>(skelNorm.length).fill(-1);
    const used = new Set<number>();
    for (let k = 0; k < skelNorm.length; k++) {
      let bestDist = Infinity;
      let bestStar = -1;
      for (let j = 0; j < starNorm.length; j++) {
        if (used.has(j)) continue;
        const dx = starNorm[j][0] - skelNorm[k][0];
        const dy = starNorm[j][1] - skelNorm[k][1];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; bestStar = j; }
      }
      if (bestStar >= 0) { assignment[k] = bestStar; used.add(bestStar); }
    }

    // Optional hill-climbing: swap vertex assignments to reduce edge-length mismatch
    if (cfg.skeletonShapeRefine) {
      function totalMismatch(asgn: number[]): number {
        let total = 0;
        for (const [i, j] of edges) {
          if (asgn[i] < 0 || asgn[j] < 0) continue;
          const si = starNorm[asgn[i]], sj = starNorm[asgn[j]];
          const starLen = Math.sqrt((si[0] - sj[0]) ** 2 + (si[1] - sj[1]) ** 2);
          const vi = skelNorm[i], vj = skelNorm[j];
          const skelLen = Math.sqrt((vi[0] - vj[0]) ** 2 + (vi[1] - vj[1]) ** 2);
          total += Math.abs(starLen - skelLen);
        }
        return total;
      }
      let current = totalMismatch(assignment);
      for (let iter = 0; iter < 50; iter++) {
        let improved = false;
        for (let a = 0; a < assignment.length; a++) {
          for (let b = a + 1; b < assignment.length; b++) {
            const tmp = assignment[a];
            assignment[a] = assignment[b];
            assignment[b] = tmp;
            const next = totalMismatch(assignment);
            if (next < current) {
              current = next;
              improved = true;
            } else {
              assignment[b] = assignment[a];
              assignment[a] = tmp;
            }
          }
        }
        if (!improved) break;
      }
    }

    // Score = 1 / (1 + mean(|starEdgeLen - skelEdgeLen|))
    let totalMismatchVal = 0;
    let edgeCount = 0;
    for (const [i, j] of edges) {
      if (assignment[i] < 0 || assignment[j] < 0) continue;
      const si = starNorm[assignment[i]], sj = starNorm[assignment[j]];
      const starLen = Math.sqrt((si[0] - sj[0]) ** 2 + (si[1] - sj[1]) ** 2);
      const vi = skelNorm[i], vj = skelNorm[j];
      const skelLen = Math.sqrt((vi[0] - vj[0]) ** 2 + (vi[1] - vj[1]) ** 2);
      totalMismatchVal += Math.abs(starLen - skelLen);
      edgeCount++;
    }
    const shapeScore = edgeCount > 0 ? 1 / (1 + totalMismatchVal / edgeCount) : 0;

    // Constellation stars are those assigned to skeleton vertices (in vertex order, no cap)
    const constellationStars: Star[] = [];
    for (let k = 0; k < skelNorm.length; k++) {
      if (assignment[k] >= 0) constellationStars.push(candidates[assignment[k]]);
    }

    const matchedStars = [...used].map((idx) => candidates[idx]);
    const skeletonRaDec = skelNorm.map(([nx, ny]) => ({
      ra: nx * cfg.patchRadius + seed.ra,
      dec: ny * cfg.patchRadius + seed.dec,
    }));

    return { score: shapeScore, stars: matchedStars, constellationStars, skeletonRaDec };
  }

  const matched: Array<{ star: Star; norm: Point2D; d: number }> = [];
  for (let j = 0; j < candidates.length; j++) {
    const d = effectiveDist(starNorm[j], skelNorm, edges, degrees, cfg);
    if (d < cfg.distanceThreshold) {
      matched.push({ star: candidates[j], norm: starNorm[j], d });
    }
  }

  matched.sort((a, b) => a.d - b.d);

  let score: number;
  if (matched.length === 0) {
    score = 0;
  } else {
    // Forward: mean min-distance from each skeleton vertex to nearest matched star, capped at chamferCap
    let sumForward = 0;
    for (const [vx, vy] of skelNorm) {
      let minDist = cfg.chamferCap;
      for (const m of matched) {
        const dx = m.norm[0] - vx;
        const dy = m.norm[1] - vy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < minDist) minDist = d;
      }
      sumForward += minDist;
    }
    const meanForward = sumForward / Math.max(1, skelNorm.length);

    // Reverse: mean effective distance of matched stars (already computed during matching)
    const meanReverse = matched.reduce((sum, m) => sum + m.d, 0) / matched.length;

    score = 1 / (1 + meanForward + meanReverse);
  }

  const constellationStars = selectConstellationStars(
    skelNorm,
    edges,
    degrees,
    candidates,
    starNorm,
    cfg,
  );

  const skeletonRaDec = skelNorm.map(([nx, ny]) => ({
    ra: nx * cfg.patchRadius + seed.ra,
    dec: ny * cfg.patchRadius + seed.dec,
  }));

  return { score, stars: matched.map((m) => m.star), constellationStars, skeletonRaDec };
}

// ── Spatial grid for fast nearest-star queries ───────────────────────────

class SpatialGrid {
  private readonly cells: Map<number, Star[]> = new Map();
  private readonly cellDeg: number;
  private readonly nCols: number;
  private readonly nRows: number;

  constructor(stars: Star[], cellDeg = 2) {
    this.cellDeg = cellDeg;
    this.nCols = Math.ceil(360 / cellDeg);
    this.nRows = Math.ceil(180 / cellDeg);
    for (const s of stars) {
      const k = this.key(s.ra, s.dec);
      let cell = this.cells.get(k);
      if (!cell) { cell = []; this.cells.set(k, cell); }
      cell.push(s);
    }
  }

  private key(ra: number, dec: number): number {
    const col = Math.floor(((ra % 360) + 360) % 360 / this.cellDeg) % this.nCols;
    const row = Math.max(0, Math.min(this.nRows - 1, Math.floor((dec + 90) / this.cellDeg)));
    return row * this.nCols + col;
  }

  inRadius(ra: number, dec: number, radius: number): Star[] {
    const span = Math.ceil(radius / this.cellDeg) + 1;
    const col0 = Math.floor(((ra % 360) + 360) % 360 / this.cellDeg);
    const row0 = Math.floor((dec + 90) / this.cellDeg);
    const result: Star[] = [];
    for (let dr = -span; dr <= span; dr++) {
      const row = row0 + dr;
      if (row < 0 || row >= this.nRows) continue;
      for (let dc = -span; dc <= span; dc++) {
        const col = ((col0 + dc) % this.nCols + this.nCols) % this.nCols;
        const cell = this.cells.get(row * this.nCols + col);
        if (!cell) continue;
        for (const s of cell) {
          if (distanceDeg(ra, dec, s.ra, s.dec) <= radius) result.push(s);
        }
      }
    }
    return result;
  }

  nearest(ra: number, dec: number, maxRadius: number, used: Set<number>): Star | null {
    let best: Star | null = null;
    let bestDist = Infinity;
    for (const s of this.inRadius(ra, dec, maxRadius)) {
      if (used.has(s.id)) continue;
      const d = distanceDeg(ra, dec, s.ra, s.dec);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  }

  /** O(1) check: does any star exist within ~cellDeg of (ra, dec)? */
  hasStarNear(ra: number, dec: number): boolean {
    return (this.cells.get(this.key(ra, dec))?.length ?? 0) > 0;
  }
}

// ── Pairwise anchor search ────────────────────────────────────────────────

interface AnchorCandidate {
  score: number;
  anchorStar: Star;
  physVerts: [number, number][];
}

function pairwiseAnchorSearch(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  cfg: ResolvedConfig,
  grid: SpatialGrid,
): (ScoreResult & { seed: Star }) | null {
  const { points, edges } = skeleton;
  const nVtx = points.length;
  const capped = Math.min(nVtx, cfg.maxConstellationStars);

  // Normalise skeleton to ~[-0.5, 0.5]; flip y for sky convention (north = up)
  const normPts: Point2D[] = normalise(points).map(([x, y]) => [x, -y]);

  // Find the principal axis: the pair of vertices with maximum pairwise distance.
  // Using all-pairs (not just leaves) makes this robust to any skeleton topology.
  let axisU = 0, axisV = 1, maxAxisDist = -1;
  for (let a = 0; a < normPts.length; a++) {
    for (let b = a + 1; b < normPts.length; b++) {
      const dx = normPts[b][0] - normPts[a][0], dy = normPts[b][1] - normPts[a][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxAxisDist) { maxAxisDist = d; axisU = a; axisV = b; }
    }
  }
  if (maxAxisDist < 0.01) return null; // degenerate skeleton

  // Physical span range for the anchor pair
  const MIN_SPAN = 2;   // degrees
  const MAX_SPAN = 25;  // degrees

  // Phase 1 prescreen: cell-coverage score (O(1) per vertex — no distance computation)
  // Phase 2 greedy: keep top GREEDY_K from phase 1, run greedy NN, compute edge-length score
  // Phase 3 Hungarian: refine top HUNGARIAN_K with full optimal assignment
  const PRESCREEN_K = 500;
  const GREEDY_K = 50;
  const HUNGARIAN_K = 20;

  const prescreenTop: { score: number; anchorStar: Star; physVerts: [number, number][] }[] = [];
  let prescreenMin = -1;

  const anchors = catalogue.filter(s => s.mag <= cfg.seedMaxMag && !excludeSeeds.has(s.id));
  // Secondary anchor mag limit — controls search breadth vs. speed.
  // mag ≤ 5 covers all naked-eye stars (~5000 total); refine later if needed.
  const SECONDARY_MAG = 5.0;
  const t0 = performance.now();
  log.debug({ nVtx, capped, anchors: anchors.length, axisU, axisV, maxAxisDist: maxAxisDist.toFixed(3) }, 'pairwise start');

  // Single reusable buffer — allocated once, mutated per iteration (zero alloc in hot path)
  const buf: [number, number][] = normPts.map(() => [0, 0] as [number, number]);

  for (const starA of anchors) {
    const neighbors = grid.inRadius(starA.ra, starA.dec, MAX_SPAN)
      .filter(s => s.mag <= SECONDARY_MAG);

    for (const starB of neighbors) {
      if (starB.id === starA.id) continue;
      const physDist = distanceDeg(starA.ra, starA.dec, starB.ra, starB.dec);
      if (physDist < MIN_SPAN) continue;

      const scale = physDist / maxAxisDist;

      for (let ori = 0; ori < 2; ori++) {
        const aS = ori === 0 ? starA : starB;
        const bS = ori === 0 ? starB : starA;
        const uI = axisU, vI = axisV;

        const [ux, uy] = normPts[uI];
        const [vx, vy] = normPts[vI];
        const skelDX = vx - ux, skelDY = vy - uy;
        const skelLen = Math.sqrt(skelDX * skelDX + skelDY * skelDY);
        const skyDX = bS.ra - aS.ra, skyDY = bS.dec - aS.dec;
        const skyLen = Math.sqrt(skyDX * skyDX + skyDY * skyDY);
        if (skyLen === 0 || skelLen === 0) continue;

        const cosR = (skelDX * skyDX + skelDY * skyDY) / (skelLen * skyLen);
        const sinR = (skelDX * skyDY - skelDY * skyDX) / (skelLen * skyLen);

        // Fill the reusable buffer — zero allocation in the hot path
        for (let k = 0; k < normPts.length; k++) {
          const [nx, ny] = normPts[k];
          const rx = nx - ux, ry = ny - uy;
          buf[k][0] = aS.ra + (rx * cosR - ry * sinR) * scale;
          buf[k][1] = aS.dec + (rx * sinR + ry * cosR) * scale;
        }

        // Phase 1: count vertices with a star in their spatial cell (O(capped) cell lookups)
        let covered = 0;
        for (let k = 0; k < capped; k++) {
          if (grid.hasStarNear(buf[k][0], buf[k][1])) covered++;
        }
        const score = covered / capped;

        if (score > prescreenMin) {
          // Only copy the buffer when it makes the cut
          const physVerts = buf.map(v => [v[0], v[1]] as [number, number]);
          prescreenTop.push({ score, anchorStar: aS, physVerts });
          // Batch-trim: only sort+trim when buffer doubles, amortising cost to O(N log K)
          if (prescreenTop.length >= PRESCREEN_K * 2) {
            prescreenTop.sort((a, b) => b.score - a.score);
            prescreenTop.length = PRESCREEN_K;
            prescreenMin = prescreenTop[prescreenTop.length - 1].score;
          } else if (prescreenTop.length === 1) {
            prescreenMin = 0; // allow everything until we have K items
          }
        }
      }
    }
  }

  const tPrescreen = performance.now() - t0;
  log.debug({ candidates: prescreenTop.length, durationMs: tPrescreen.toFixed(0), prescreenMin: prescreenMin.toFixed(2) }, 'prescreen done');
  if (prescreenTop.length === 0) { log.debug('prescreenTop empty → null'); return null; }
  prescreenTop.sort((a, b) => b.score - a.score);
  log.debug({ topScore: prescreenTop[0].score.toFixed(2), anchor: prescreenTop[0].anchorStar.id }, 'prescreen top');

  // Phase 2: greedy NN assignment → edge-length ratio score
  const greedyTop: { score: number; anchorStar: Star; physVerts: [number, number][] }[] = [];
  const GREEDY_SEARCH_R = 3; // degrees — fixed, reasonable for any scale

  for (const cand of prescreenTop.slice(0, Math.min(GREEDY_K * 10, prescreenTop.length))) {
    const { physVerts, anchorStar } = cand;
    const used = new Set<number>();
    const greedyStars: (Star | null)[] = [];
    for (let k = 0; k < capped; k++) {
      const star = grid.nearest(physVerts[k][0], physVerts[k][1], GREEDY_SEARCH_R, used);
      greedyStars.push(star);
      if (star) used.add(star.id);
    }

    let total = 0, cnt = 0;
    for (const [i, j] of edges) {
      if (i >= capped || j >= capped) continue;
      const si = greedyStars[i], sj = greedyStars[j];
      if (!si || !sj) { total += 1; cnt++; continue; }
      const starLen = distanceDeg(si.ra, si.dec, sj.ra, sj.dec);
      const skelEdgeLen = distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]);
      if (skelEdgeLen > 0) total += Math.abs(starLen / skelEdgeLen - 1);
      cnt++;
    }
    const score = cnt > 0 ? 1 / (1 + total / cnt) : 0;
    greedyTop.push({ score, anchorStar, physVerts });
  }
  greedyTop.sort((a, b) => b.score - a.score);
  const tGreedy = performance.now() - t0 - tPrescreen;
  log.debug({ candidates: greedyTop.length, durationMs: tGreedy.toFixed(0), topScore: greedyTop[0]?.score.toFixed(3) ?? 'n/a' }, 'greedy done');

  // Phase 3: Hungarian refinement on top candidates
  let bestResult: (ScoreResult & { seed: Star }) | null = null;

  for (const cand of greedyTop.slice(0, HUNGARIAN_K)) {
    const { physVerts, anchorStar } = cand;

    // Gather the K-nearest stars per vertex, union them — keeps Hungarian matrix small
    const K_PER_VERTEX = 20;
    const nearbyMap = new Map<number, Star>();
    for (let k = 0; k < capped; k++) {
      const [ra, dec] = physVerts[k];
      let stars = grid.inRadius(ra, dec, 3);
      if (stars.length < K_PER_VERTEX) stars = grid.inRadius(ra, dec, 6);
      stars.sort((a, b) =>
        distanceDeg(ra, dec, a.ra, a.dec) - distanceDeg(ra, dec, b.ra, b.dec),
      );
      for (const s of stars.slice(0, K_PER_VERTEX)) nearbyMap.set(s.id, s);
    }
    const nearby = [...nearbyMap.values()];
    if (nearby.length < cfg.minMatchedStars) continue;

    const cost: number[][] = physVerts.slice(0, capped).map(([ra, dec]) =>
      nearby.map(s => distanceDeg(ra, dec, s.ra, s.dec) + cfg.brightnessWeight * (s.mag / 6)),
    );
    const assignment = hungarianAssign(cost);
    const constellationStars = assignment.map(j => nearby[j]);

    let total = 0, cnt = 0;
    for (const [i, j] of edges) {
      if (i >= capped || j >= capped) continue;
      const si = constellationStars[i], sj = constellationStars[j];
      const starLen = distanceDeg(si.ra, si.dec, sj.ra, sj.dec);
      const skelLen = distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]);
      if (skelLen > 0) total += Math.abs(starLen / skelLen - 1);
      cnt++;
    }
    const score = cnt > 0 ? 1 / (1 + total / cnt) : 0;

    if (!bestResult || score > bestResult.score) {
      bestResult = {
        score,
        stars: nearby,
        constellationStars,
        skeletonRaDec: physVerts.map(([ra, dec]) => ({ ra, dec })),
        seed: anchorStar,
      };
    }
  }

  const tHungarian = performance.now() - t0 - tPrescreen - tGreedy;
  log.debug({ durationMs: tHungarian.toFixed(0), bestScore: bestResult?.score.toFixed(3) ?? 'none' }, 'hungarian done');

  return bestResult;
}

// ── Public API ────────────────────────────────────────────────────────────

const ORION_SPAN_DEG = 25;

export function match(
  catalogue: Star[],
  skeletons: Skeleton[],
  excludeSeeds: Set<number> = new Set(),
  config?: MatcherConfig,
): MatchResult | null {
  const cfg = resolveConfig(config);
  const grid = new SpatialGrid(catalogue);

  let globalBest: (ScoreResult & { seed: Star; variantIndex: number }) | null = null;

  const tMatch = performance.now();
  log.info({ catalogueSize: catalogue.length, skeletons: skeletons.length }, 'pairwise search start');

  for (let i = 0; i < skeletons.length; i++) {
    try {
      const result = pairwiseAnchorSearch(skeletons[i], catalogue, excludeSeeds, cfg, grid);
      if (!result) { log.debug({ index: i }, 'skeleton returned null'); continue; }
      if (!globalBest || result.score > globalBest.score) {
        globalBest = { ...result, variantIndex: i };
      }
    } catch (e) {
      log.error({ index: i, err: e }, 'error in skeleton');
    }
  }
  const durationMs = (performance.now() - tMatch).toFixed(0);
  log.info({ durationMs }, 'search done');

  if (!globalBest || globalBest.constellationStars.length === 0) return null;

  excludeSeeds.add(globalBest.seed.id);

  log.info({ variantIndex: globalBest.variantIndex, shapeScore: (globalBest.score * 100).toFixed(1) }, 'variant won');

  const span = maxPairwiseAngularDist(globalBest.constellationStars);
  log.debug({ spanDeg: span.toFixed(1), orionPct: Math.round((span / ORION_SPAN_DEG) * 100) }, 'pattern size');

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
