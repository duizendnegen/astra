import type { Star, Skeleton, MatchResult } from './types';
import { createLogger } from './logger.js';

const log = createLogger('matcher');

// ── Public config types ───────────────────────────────────────────────────

export type ModelName = 'vertex-penalty' | 'skeleton-shape';
export type GeneratorName = 'anchor-pair' | 'single-sweep' | 'any-vertex';
export type ScorerName = 'edge-ratio' | 'vertex-fit' | 'procrustes' | 'procrustes-unit-scale';

/** Pass as the optional fourth argument to match() to select a model and/or
 *  override individual constants. All fields except `model` are optional —
 *  omitted fields fall back to the named model's defaults. */
export interface MatcherConfig {
  model: ModelName;
  generator?: GeneratorName;
  scorer?: ScorerName;
  // Search strategy
  seedMaxMag?: number;
  patchRadius?: number;
  maxPatchRadius?: number;
  patchRadiusStep?: number;
  maxSpanDeg?: number;
  qualityThreshold?: number;
  coverageThreshold?: number;
  rotationSteps?: number;
  skeletonFillRatio?: number;
  // Scoring
  distanceThreshold?: number;
  vertexBonusEndpoint?: number;
  vertexBonusJoint?: number;
  vertexSigma?: number;
  brightnessWeight?: number;
  penaltyWeight?: number;
  chamferCap?: number;
  skeletonShapeRefine?: boolean;
  assignmentAlgorithm?: 'greedy' | 'hungarian';
  phase2Cap?: number;
  phase3Cap?: number;
}

// ── Internal types ────────────────────────────────────────────────────────

interface ModelDefaults {
  generator: GeneratorName;
  scorer: ScorerName;
  seedMaxMag: number;
  patchRadius: number;
  maxPatchRadius: number;
  patchRadiusStep: number;
  maxSpanDeg: number;
  qualityThreshold: number;
  coverageThreshold: number;
  rotationSteps: number;
  skeletonFillRatio: number;
  distanceThreshold: number;
  vertexBonusEndpoint: number;
  vertexBonusJoint: number;
  vertexSigma: number;
  brightnessWeight: number;
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
  generator: 'anchor-pair',
  scorer: 'procrustes-unit-scale',
  seedMaxMag: 3,
  patchRadius: 10,        // degrees
  maxPatchRadius: 15,     // degrees
  patchRadiusStep: 2.5,   // degrees
  maxSpanDeg: 40,         // degrees
  qualityThreshold: 0.70,
  coverageThreshold: 0.99,
  rotationSteps: 24,      // every 15°
  skeletonFillRatio: 0.8, // skeleton longest axis = 80% of patch diameter
  distanceThreshold: 0.15, // 1.5° at default patch
  vertexBonusEndpoint: 2.0,
  vertexBonusJoint: 0.4,
  vertexSigma: 0.12,      // 1.2° at default patch
  brightnessWeight: 0.3,
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

// skeleton-shape model — scoring is handled as a special path in scoreAndMatch (legacy);
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
  const nVtx = skelNorm.length;
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

// ── Score helpers ─────────────────────────────────────────────────────────

function computeSpan(physVerts: [number, number][]): number {
  let maxDist = 0;
  for (let i = 0; i < physVerts.length; i++) {
    for (let j = i + 1; j < physVerts.length; j++) {
      const d = distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]);
      if (d > maxDist) maxDist = d;
    }
  }
  return maxDist || 1;
}

function computeShapeScore(
  constellationStars: Star[],
  physVerts: [number, number][],
  edges: [number, number][],
): number {
  const n = constellationStars.length;
  let total = 0, cnt = 0;
  for (const [i, j] of edges) {
    if (i >= n || j >= n) continue;
    const si = constellationStars[i], sj = constellationStars[j];
    const starLen = distanceDeg(si.ra, si.dec, sj.ra, sj.dec);
    const skelLen = distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]);
    if (skelLen > 0) total += Math.abs(starLen / skelLen - 1);
    cnt++;
  }
  return cnt > 0 ? 1 / (1 + total / cnt) : 0;
}

function computeVertexFitScore(
  constellationStars: Star[],
  physVerts: [number, number][],
  span: number,
): number {
  const n = constellationStars.length;
  if (n === 0) return 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    total += distanceDeg(constellationStars[i].ra, constellationStars[i].dec, physVerts[i][0], physVerts[i][1]) / span;
  }
  return 1 / (1 + total / n);
}

function computeProcrustesScore(
  constellationStars: Star[],
  physVerts: [number, number][],
  span: number,
): number {
  // TODO(procrustes-icp): single-pass Procrustes only, no ICP iterations
  const n = constellationStars.length;
  if (n < 2) return 0;

  // Centroids
  let pRa = 0, pDec = 0, qRa = 0, qDec = 0;
  for (let i = 0; i < n; i++) {
    pRa += constellationStars[i].ra; pDec += constellationStars[i].dec;
    qRa += physVerts[i][0]; qDec += physVerts[i][1];
  }
  pRa /= n; pDec /= n; qRa /= n; qDec /= n;

  // Centred arrays: A = target (stars), B = source (vertices)
  const A: [number, number][] = constellationStars.map(s => [s.ra - pRa, s.dec - pDec]);
  const B: [number, number][] = physVerts.slice(0, n).map(v => [v[0] - qRa, v[1] - qDec]);

  // Cross-covariance H = B^T A
  let h00 = 0, h01 = 0, h10 = 0, h11 = 0;
  for (let i = 0; i < n; i++) {
    h00 += B[i][0] * A[i][0]; h01 += B[i][0] * A[i][1];
    h10 += B[i][1] * A[i][0]; h11 += B[i][1] * A[i][1];
  }

  // Optimal rotation angle (Umeyama 2D closed form)
  const angle = Math.atan2(h01 - h10, h00 + h11);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);

  // Rotate B: BR_i = R * B_i
  const BR: [number, number][] = B.map(([x, y]) => [x * cosA - y * sinA, x * sinA + y * cosA]);

  // Optimal scale: s = trace(R^T H) / ||B||_F^2
  const traceRTH = cosA * (h00 + h11) + sinA * (h10 - h01);
  const normBSq = B.reduce((s, b) => s + b[0] * b[0] + b[1] * b[1], 0);
  const scale = normBSq > 0 ? traceRTH / normBSq : 1;

  // Mean Euclidean residual in RA/Dec degree approximation
  let totalResidual = 0;
  for (let i = 0; i < n; i++) {
    const ex = A[i][0] - scale * BR[i][0];
    const ey = A[i][1] - scale * BR[i][1];
    totalResidual += Math.sqrt(ex * ex + ey * ey);
  }
  return 1 / (1 + (totalResidual / n) / span);
}

function computeProcrustesUnitScaleScore(
  constellationStars: Star[],
  physVerts: [number, number][],
): number {
  // Like computeProcrustesScore but scale is forced to 1.0 and residual is
  // normalised by ORION_SPAN_DEG (size-agnostic reference).
  const n = constellationStars.length;
  if (n < 2) return 0;

  // Centroids
  let pRa = 0, pDec = 0, qRa = 0, qDec = 0;
  for (let i = 0; i < n; i++) {
    pRa += constellationStars[i].ra; pDec += constellationStars[i].dec;
    qRa += physVerts[i][0]; qDec += physVerts[i][1];
  }
  pRa /= n; pDec /= n; qRa /= n; qDec /= n;

  const A: [number, number][] = constellationStars.map(s => [s.ra - pRa, s.dec - pDec]);
  const B: [number, number][] = physVerts.slice(0, n).map(v => [v[0] - qRa, v[1] - qDec]);

  // Cross-covariance H = B^T A
  let h00 = 0, h01 = 0, h10 = 0, h11 = 0;
  for (let i = 0; i < n; i++) {
    h00 += B[i][0] * A[i][0]; h01 += B[i][0] * A[i][1];
    h10 += B[i][1] * A[i][0]; h11 += B[i][1] * A[i][1];
  }

  const angle = Math.atan2(h01 - h10, h00 + h11);
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const BR: [number, number][] = B.map(([x, y]) => [x * cosA - y * sinA, x * sinA + y * cosA]);

  // Scale forced to 1.0 — rotation + translation only
  let totalResidual = 0;
  for (let i = 0; i < n; i++) {
    const ex = A[i][0] - BR[i][0];
    const ey = A[i][1] - BR[i][1];
    totalResidual += Math.sqrt(ex * ex + ey * ey);
  }
  return 1 / (1 + (totalResidual / n) / ORION_SPAN_DEG);
}

function computeSpanFactor(physSpan: number): number {
  // Flat zone [20°, 30°]; penalise placements outside with exp(-excess / ORION_SPAN_DEG)
  const excess = Math.max(0, physSpan - 30, 20 - physSpan);
  return Math.exp(-excess / ORION_SPAN_DEG);
}

// ── Core matching ─────────────────────────────────────────────────────────

interface ScoreResult {
  score: number;
  shapeScore: number;
  vertexFitScore: number;
  procrustesScore?: number;
  stars: Star[];
  constellationStars: Star[];
  skeletonRaDec: { ra: number; dec: number }[];
  phase1Candidates: number;
  phase2Candidates: number;
  phase3Candidates: number;
}

// ── Phase helpers ─────────────────────────────────────────────────────────

function medianEdgeLength(physVerts: [number, number][], edges: [number, number][]): number {
  const lengths = edges.map(([i, j]) =>
    distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]),
  );
  if (lengths.length === 0) return 0;
  lengths.sort((a, b) => a - b);
  const mid = Math.floor(lengths.length / 2);
  return lengths.length % 2 === 1 ? lengths[mid] : (lengths[mid - 1] + lengths[mid]) / 2;
}

// ── Shared Phase 2 + 3 helper ─────────────────────────────────────────────

interface PhaseCandidate {
  score: number;
  seed: Star;
  physVerts: [number, number][];
}

// SpatialGrid is defined after this function in the file, but by runtime all module
// code has been executed before match() is called, so this is safe.
function runPhase2And3(
  phase1Top: PhaseCandidate[],
  edges: [number, number][],
  nVtx: number,
  cfg: ResolvedConfig,
  grid: SpatialGrid,
): (ScoreResult & { seed: Star })[] {
  const GREEDY_K = 50;
  const HUNGARIAN_K = cfg.phase3Cap ?? 20;
  const GREEDY_SEARCH_R = 3;
  const K_PER_VERTEX = 20;

  const phase1Count = phase1Top.length;

  // Phase 2: greedy NN → edge-length score to narrow down to HUNGARIAN_K candidates
  const greedyTop: PhaseCandidate[] = [];
  const phase2Limit = cfg.phase2Cap ?? GREEDY_K * 10;
  const phase2Input = phase1Top.slice(0, Math.min(phase2Limit, phase1Top.length));
  const phase2Count = phase2Input.length;
  for (const cand of phase2Input) {
    const { physVerts, seed } = cand;
    const used = new Set<number>();
    const greedyStars: (Star | null)[] = [];
    for (let k = 0; k < nVtx; k++) {
      const star = grid.nearest(physVerts[k][0], physVerts[k][1], GREEDY_SEARCH_R, used);
      greedyStars.push(star);
      if (star) used.add(star.id);
    }
    let total = 0, cnt = 0;
    for (const [i, j] of edges) {
      const si = greedyStars[i], sj = greedyStars[j];
      if (!si || !sj) { total += 1; cnt++; continue; }
      const starLen = distanceDeg(si.ra, si.dec, sj.ra, sj.dec);
      const skelLen = distanceDeg(physVerts[i][0], physVerts[i][1], physVerts[j][0], physVerts[j][1]);
      if (skelLen > 0) total += Math.abs(starLen / skelLen - 1);
      cnt++;
    }
    const score = cnt > 0 ? 1 / (1 + total / cnt) : 0;
    greedyTop.push({ score, seed, physVerts });
  }
  greedyTop.sort((a, b) => b.score - a.score);

  // Phase 3: full Hungarian assignment + multi-score evaluation
  const results: (ScoreResult & { seed: Star })[] = [];

  const phase3Slice = greedyTop.slice(0, HUNGARIAN_K);
  const phase3Count = phase3Slice.length;
  for (const cand of phase3Slice) {
    const { physVerts, seed } = cand;

    const searchR = Math.max(1.5, medianEdgeLength(physVerts, edges) * 1.5);
    const nearbyMap = new Map<number, Star>();
    for (let k = 0; k < nVtx; k++) {
      const [ra, dec] = physVerts[k];
      const stars = grid.inRadius(ra, dec, searchR);
      stars.sort((a, b) =>
        distanceDeg(ra, dec, a.ra, a.dec) - distanceDeg(ra, dec, b.ra, b.dec),
      );
      for (const s of stars.slice(0, K_PER_VERTEX)) nearbyMap.set(s.id, s);
    }
    const nearby = [...nearbyMap.values()];
    if (nearby.length < nVtx) continue;

    const cost: number[][] = physVerts.map(([ra, dec]) =>
      nearby.map(s => distanceDeg(ra, dec, s.ra, s.dec) + cfg.brightnessWeight * (s.mag / 6)),
    );
    const assignment = hungarianAssign(cost);
    const constellationStars = assignment.map(j => nearby[j]);

    const span = computeSpan(physVerts);
    const shapeScore = computeShapeScore(constellationStars, physVerts, edges);
    const vertexFitScore = computeVertexFitScore(constellationStars, physVerts, span);
    const procrustesScore = cfg.scorer === 'procrustes'
      ? computeProcrustesScore(constellationStars, physVerts, span)
      : cfg.scorer === 'procrustes-unit-scale'
        ? computeProcrustesUnitScaleScore(constellationStars, physVerts)
        : undefined;

    let selectionScore: number;
    if (cfg.scorer === 'vertex-fit') {
      selectionScore = vertexFitScore;
    } else if (cfg.scorer === 'procrustes') {
      selectionScore = procrustesScore ?? 0;
    } else if (cfg.scorer === 'procrustes-unit-scale') {
      const procrustesUnitScaleScore = procrustesScore ?? 0;
      selectionScore = procrustesUnitScaleScore * computeSpanFactor(span);
    } else {
      selectionScore = shapeScore;
    }

    results.push({
      score: selectionScore,
      shapeScore,
      vertexFitScore,
      procrustesScore,
      stars: nearby,
      constellationStars,
      skeletonRaDec: physVerts.map(([ra, dec]) => ({ ra, dec })),
      seed,
      phase1Candidates: phase1Count,
      phase2Candidates: phase2Count,
      phase3Candidates: phase3Count,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
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

// ── Generators ───────────────────────────────────────────────────────────

function pairwiseAnchorSearch(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  cfg: ResolvedConfig,
  grid: SpatialGrid,
): (ScoreResult & { seed: Star })[] {
  const { points, edges } = skeleton;
  const nVtx = points.length;

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
  if (maxAxisDist < 0.01) return []; // degenerate skeleton

  const MIN_SPAN = 2;   // degrees
  const MAX_SPAN = 25;  // degrees
  const PRESCREEN_K = 500;
  const SECONDARY_MAG = 5.0;

  const phase1Top: PhaseCandidate[] = [];
  let prescreenMin = -1;

  const anchors = catalogue.filter(s => s.mag <= cfg.seedMaxMag && !excludeSeeds.has(s.id));
  const t0 = performance.now();
  log.debug({ nVtx, anchors: anchors.length, axisU, axisV, maxAxisDist: maxAxisDist.toFixed(3) }, 'pairwise start');

  // Single reusable buffer — allocated once, mutated per iteration (zero alloc in hot path)
  const buf: [number, number][] = normPts.map(() => [0, 0] as [number, number]);

  for (const starA of anchors) {
    const neighbors = grid.inRadius(starA.ra, starA.dec, MAX_SPAN)
      .filter(s => s.mag <= SECONDARY_MAG);

    for (const starB of neighbors) {
      if (starB.id === starA.id) continue;
      const physDist = distanceDeg(starA.ra, starA.dec, starB.ra, starB.dec);
      if (physDist < MIN_SPAN) continue;
      if (physDist > cfg.maxSpanDeg) continue;

      const scale = physDist / maxAxisDist;

      for (let ori = 0; ori < 2; ori++) {
        const aS = ori === 0 ? starA : starB;
        const bS = ori === 0 ? starB : starA;

        const [ux, uy] = normPts[axisU];
        const [vx, vy] = normPts[axisV];
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

        // Phase 1: count all vertices with a star in their spatial cell
        let covered = 0;
        for (let k = 0; k < nVtx; k++) {
          if (grid.hasStarNear(buf[k][0], buf[k][1])) covered++;
        }
        const score = covered / nVtx;

        if (score > prescreenMin) {
          const physVerts = buf.map(v => [v[0], v[1]] as [number, number]);
          phase1Top.push({ score, seed: aS, physVerts });
          if (phase1Top.length >= PRESCREEN_K * 2) {
            phase1Top.sort((a, b) => b.score - a.score);
            phase1Top.length = PRESCREEN_K;
            prescreenMin = phase1Top[phase1Top.length - 1].score;
          } else if (phase1Top.length === 1) {
            prescreenMin = 0;
          }
        }
      }
    }
  }

  const tPrescreen = performance.now() - t0;
  log.debug({ candidates: phase1Top.length, durationMs: tPrescreen.toFixed(0) }, 'prescreen done');
  if (phase1Top.length === 0) { log.debug('phase1Top empty → []'); return []; }
  phase1Top.sort((a, b) => b.score - a.score);
  log.debug({ topScore: phase1Top[0].score.toFixed(2), anchor: phase1Top[0].seed.id }, 'prescreen top');

  const results = runPhase2And3(phase1Top, edges, nVtx, cfg, grid);
  log.debug({ bestScore: results[0]?.score.toFixed(3) ?? 'none', count: results.length }, 'pairwise done');
  return results;
}

function singleSweepSearch(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  cfg: ResolvedConfig,
  grid: SpatialGrid,
): (ScoreResult & { seed: Star })[] {
  const { points, edges } = skeleton;
  const nVtx = points.length;

  const normPts: Point2D[] = normalise(points).map(([x, y]) => [x, -y]);

  // Find maximum pairwise distance in normalized coords (skeleton "diameter")
  let maxAxisDist = -1;
  for (let a = 0; a < normPts.length; a++) {
    for (let b = a + 1; b < normPts.length; b++) {
      const dx = normPts[b][0] - normPts[a][0], dy = normPts[b][1] - normPts[a][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxAxisDist) maxAxisDist = d;
    }
  }
  if (maxAxisDist < 0.01) return [];

  const SCALES_DEG = [5, 10, 15, 20, 25, 30];
  const CANDIDATE_CAP = 2000;
  const rotSteps = cfg.rotationSteps;

  const phase1Top: PhaseCandidate[] = [];
  let prescreenMin = -1;

  for (const seed of catalogue) {
    if (excludeSeeds.has(seed.id)) continue;
    if (seed.mag > cfg.seedMaxMag) continue;

    for (let ri = 0; ri < rotSteps; ri++) {
      const rotRad = ((360 / rotSteps) * ri * Math.PI) / 180;
      const cosR = Math.cos(rotRad), sinR = Math.sin(rotRad);

      for (const spanDeg of SCALES_DEG) {
        if (spanDeg > cfg.maxSpanDeg) continue;
        const physScale = spanDeg / maxAxisDist;
        const physVerts: [number, number][] = normPts.map(([nx, ny]) => [
          seed.ra + (nx * cosR - ny * sinR) * physScale,
          seed.dec + (nx * sinR + ny * cosR) * physScale,
        ]);

        let covered = 0;
        for (let k = 0; k < nVtx; k++) {
          if (grid.hasStarNear(physVerts[k][0], physVerts[k][1])) covered++;
        }
        const score = covered / nVtx;

        if (score > prescreenMin) {
          phase1Top.push({ score, seed, physVerts });
          if (phase1Top.length >= CANDIDATE_CAP * 2) {
            phase1Top.sort((a, b) => b.score - a.score);
            phase1Top.length = CANDIDATE_CAP;
            prescreenMin = phase1Top[phase1Top.length - 1].score;
          } else if (phase1Top.length === 1) {
            prescreenMin = 0;
          }
        }
      }
    }
  }

  if (phase1Top.length === 0) return [];
  phase1Top.sort((a, b) => b.score - a.score);
  return runPhase2And3(phase1Top, edges, nVtx, cfg, grid);
}

function anyVertexSearch(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  cfg: ResolvedConfig,
  grid: SpatialGrid,
): (ScoreResult & { seed: Star })[] {
  const { points, edges } = skeleton;
  const nVtx = points.length;

  const normPts: Point2D[] = normalise(points).map(([x, y]) => [x, -y]);

  // Build adjacency list
  const adj: number[][] = Array.from({ length: nVtx }, () => []);
  for (const [i, j] of edges) { adj[i].push(j); adj[j].push(i); }

  // Skeleton diameter (normalized) — used for expectedSpan check
  let maxAxisDist = -1;
  for (let a = 0; a < normPts.length; a++) {
    for (let b = a + 1; b < normPts.length; b++) {
      const dx = normPts[b][0] - normPts[a][0], dy = normPts[b][1] - normPts[a][1];
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > maxAxisDist) maxAxisDist = d;
    }
  }
  if (maxAxisDist < 0.01) return [];

  const CANDIDATE_CAP = 2000;
  const SECOND_STAR_RADIUS = 15; // degrees

  const phase1Top: PhaseCandidate[] = [];
  let prescreenMin = -1;

  const seeds = catalogue.filter(s => !excludeSeeds.has(s.id) && s.mag <= cfg.seedMaxMag);

  for (const starS of seeds) {
    for (let vi = 0; vi < nVtx; vi++) {
      if (adj[vi].length === 0) continue;

      // Find S's nearest star within SECOND_STAR_RADIUS (shared across all skeleton neighbours of V)
      const nearbyStars = grid.inRadius(starS.ra, starS.dec, SECOND_STAR_RADIUS)
        .filter(s => s.id !== starS.id)
        .sort((a, b) =>
          distanceDeg(starS.ra, starS.dec, a.ra, a.dec) - distanceDeg(starS.ra, starS.dec, b.ra, b.dec),
        );
      if (nearbyStars.length === 0) continue;
      const starT = nearbyStars[0];

      const skyDX = starT.ra - starS.ra;
      const skyDY = starT.dec - starS.dec;
      const skyLen = Math.sqrt(skyDX * skyDX + skyDY * skyDY);
      if (skyLen === 0) continue;

      // Loop over all skeleton neighbours of V (not just the nearest)
      for (const u of adj[vi]) {
        const skelDX = normPts[u][0] - normPts[vi][0];
        const skelDY = normPts[u][1] - normPts[vi][1];
        const skelLen = Math.sqrt(skelDX * skelDX + skelDY * skelDY);
        if (skelLen < 0.01) continue;

        const physScale = skyLen / skelLen;
        const expectedSpan = physScale * maxAxisDist;
        if (expectedSpan < 2 || expectedSpan > cfg.maxSpanDeg) continue;

        // Align skeleton direction V→U to sky direction S→T
        const cosR = (skelDX * skyDX + skelDY * skyDY) / (skelLen * skyLen);
        const sinR = (skelDX * skyDY - skelDY * skyDX) / (skelLen * skyLen);

        // Place vertex vi at starS, rotate and scale the rest
        const physVerts: [number, number][] = normPts.map(([nx, ny]) => {
          const dx = nx - normPts[vi][0];
          const dy = ny - normPts[vi][1];
          return [
            starS.ra + (dx * cosR - dy * sinR) * physScale,
            starS.dec + (dx * sinR + dy * cosR) * physScale,
          ];
        });

        let covered = 0;
        for (let k = 0; k < nVtx; k++) {
          if (grid.hasStarNear(physVerts[k][0], physVerts[k][1])) covered++;
        }
        const score = covered / nVtx;

        if (score > prescreenMin) {
          phase1Top.push({ score, seed: starS, physVerts });
          if (phase1Top.length >= CANDIDATE_CAP * 2) {
            phase1Top.sort((a, b) => b.score - a.score);
            phase1Top.length = CANDIDATE_CAP;
            prescreenMin = phase1Top[phase1Top.length - 1].score;
          } else if (phase1Top.length === 1) {
            prescreenMin = 0;
          }
        }
      }
    }
  }

  if (phase1Top.length === 0) return [];
  phase1Top.sort((a, b) => b.score - a.score);
  return runPhase2And3(phase1Top, edges, nVtx, cfg, grid);
}

// ── Public API ────────────────────────────────────────────────────────────

const ORION_SPAN_DEG = 25;
const DIVERSITY_TOLERANCE = 0.10;
const DIVERSITY_MIN_DEG = 30;

/** Select a candidate from a scored pool, preferring a sky-distant acceptable one over the top.
 *  Exported for unit testing; production code always uses the default random. */
export function selectDiverse<T extends { score: number; patchRA: number; patchDec: number }>(
  pool: T[],
  random: () => number = Math.random,
): T | null {
  if (pool.length === 0) return null;
  const top = pool.reduce((best, c) => (c.score > best.score ? c : best), pool[0]);
  const acceptable = pool.filter(c => c.score >= top.score * (1 - DIVERSITY_TOLERANCE));
  const distant = acceptable.filter(c =>
    distanceDeg(c.patchRA, c.patchDec, top.patchRA, top.patchDec) >= DIVERSITY_MIN_DEG,
  );
  return distant.length > 0 ? distant[Math.floor(random() * distant.length)] : top;
}

export function match(
  catalogue: Star[],
  skeletons: Skeleton[],
  excludeSeeds: Set<number> = new Set(),
  config?: MatcherConfig,
): MatchResult | null {
  const cfg = resolveConfig(config);
  const grid = new SpatialGrid(catalogue);

  type PoolEntry = ScoreResult & { seed: Star; variantIndex: number; patchRA: number; patchDec: number };
  const pool: PoolEntry[] = [];

  const tMatch = performance.now();
  log.info({ catalogueSize: catalogue.length, skeletons: skeletons.length, generator: cfg.generator, scorer: cfg.scorer }, 'search start');

  const searchFn = cfg.generator === 'single-sweep' ? singleSweepSearch
    : cfg.generator === 'any-vertex' ? anyVertexSearch
    : pairwiseAnchorSearch;

  for (let i = 0; i < skeletons.length; i++) {
    try {
      const candidates = searchFn(skeletons[i], catalogue, excludeSeeds, cfg, grid);
      if (candidates.length === 0) { log.debug({ index: i }, 'skeleton returned no candidates'); continue; }
      for (const c of candidates) {
        const physRaDec = c.skeletonRaDec;
        const patchRA = physRaDec.reduce((s, v) => s + v.ra, 0) / physRaDec.length;
        const patchDec = physRaDec.reduce((s, v) => s + v.dec, 0) / physRaDec.length;
        pool.push({ ...c, variantIndex: i, patchRA, patchDec });
      }
    } catch (e) {
      log.error({ index: i, err: e }, 'error in skeleton');
    }
  }
  const durationMs = (performance.now() - tMatch).toFixed(0);
  log.info({ durationMs }, 'search done');

  if (pool.length === 0) return null;

  pool.sort((a, b) => b.score - a.score);
  const topResult = pool[0];
  const topScore = topResult.score;
  const acceptable = pool.filter(c => c.score >= topScore * (1 - DIVERSITY_TOLERANCE));
  const distant = acceptable.filter(c =>
    distanceDeg(c.patchRA, c.patchDec, topResult.patchRA, topResult.patchDec) >= DIVERSITY_MIN_DEG,
  );
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const selected = selectDiverse(pool)!;
  const diversified = selected !== topResult;

  log.info(
    {
      poolSize: pool.length,
      topScore: topScore.toFixed(3),
      topRA: topResult.patchRA.toFixed(1),
      topDec: topResult.patchDec.toFixed(1),
      acceptableCount: acceptable.length,
      distantCount: distant.length,
      diversified,
      selectedScore: selected.score.toFixed(3),
      selectedRA: selected.patchRA.toFixed(1),
      selectedDec: selected.patchDec.toFixed(1),
    },
    'diversity selection',
  );

  if (selected.constellationStars.length === 0) return null;

  const actualSpan = maxPairwiseAngularDist(selected.constellationStars);
  if (actualSpan > cfg.maxSpanDeg) {
    log.warn({ actualSpan: actualSpan.toFixed(1), maxSpanDeg: cfg.maxSpanDeg }, 'span exceeds maxSpanDeg — rejecting match');
    return null;
  }

  excludeSeeds.add(selected.seed.id);

  log.info({ variantIndex: selected.variantIndex, shapeScore: (selected.shapeScore * 100).toFixed(1), vertexFitScore: (selected.vertexFitScore * 100).toFixed(1) }, 'variant won');
  log.debug({ spanDeg: actualSpan.toFixed(1), orionPct: Math.round((actualSpan / ORION_SPAN_DEG) * 100) }, 'pattern size');

  return {
    stars: selected.stars,
    constellationStars: selected.constellationStars,
    edges: skeletons[selected.variantIndex].edges,
    patchRA: selected.patchRA,
    patchDec: selected.patchDec,
    shapeScore: selected.shapeScore,
    vertexFitScore: selected.vertexFitScore,
    procrustesScore: selected.procrustesScore,
    phase1Candidates: selected.phase1Candidates,
    phase2Candidates: selected.phase2Candidates,
    phase3Candidates: selected.phase3Candidates,
    skeletonPoints: selected.skeletonRaDec,
    variantIndex: selected.variantIndex,
  };
}
