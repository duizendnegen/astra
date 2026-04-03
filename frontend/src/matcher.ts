import type { Star, Skeleton, MatchResult } from './types';

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
  qualityThreshold: 0.80,
  coverageThreshold: 0.70,
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
  skeletonShapeRefine: false,
  assignmentAlgorithm: 'greedy',
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

// ── Constellation star selection ──────────────────────────────────────────

export function selectConstellationStars(
  skelNorm: Point2D[],
  _edges: [number, number][],
  degrees: number[],
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

  // Greedy (default): assign vertices in endpoint-first order
  const vertexOrder = skelNorm
    .map((_, i) => i)
    .sort((a, b) => (degrees[a] === 1 ? 0 : 1) - (degrees[b] === 1 ? 0 : 1));

  const claimed = new Set<number>();
  const result: Star[] = [];

  for (const vi of vertexOrder) {
    if (result.length >= cfg.maxConstellationStars) break;

    const [vx, vy] = skelNorm[vi];
    let bestScore = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < matchedStars.length; j++) {
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

  const coverageRatio = candidates.length > 0 ? matched.length / candidates.length : 0;
  const model = MODELS[cfg.model];
  const penalty = model.penaltyScore(matched.map((m) => m.norm), skelNorm, cfg);
  const score = coverageRatio - penalty;

  const constellationStars = selectConstellationStars(
    skelNorm,
    edges,
    degrees,
    matched.map((m) => m.star),
    matched.map((m) => m.norm),
    cfg,
  );

  const skeletonRaDec = skelNorm.map(([nx, ny]) => ({
    ra: nx * cfg.patchRadius + seed.ra,
    dec: ny * cfg.patchRadius + seed.dec,
  }));

  return { score, stars: matched.map((m) => m.star), constellationStars, skeletonRaDec };
}

// ── Seed sweep (single skeleton) ──────────────────────────────────────────

function runSeedSweep(
  skeleton: Skeleton,
  catalogue: Star[],
  excludeSeeds: Set<number>,
  patchRadius: number,
  cfg: ResolvedConfig,
): (ScoreResult & { seed: Star }) | null {
  const { points, edges } = skeleton;

  const seeds = catalogue
    .filter((s) => s.mag <= cfg.seedMaxMag && !excludeSeeds.has(s.id))
    .sort((a, b) => a.mag - b.mag);

  let globalBest: (ScoreResult & { seed: Star }) | null = null;

  for (const seed of seeds) {
    const candidates = catalogue.filter(
      (s) => distanceDeg(s.ra, s.dec, seed.ra, seed.dec) <= patchRadius,
    );
    if (candidates.length < cfg.minMatchedStars) continue;

    let best: ScoreResult = { score: 0, stars: [], constellationStars: [], skeletonRaDec: [] };

    for (let k = 0; k < points.length; k++) {
      for (let r = 0; r < cfg.rotationSteps; r++) {
        const rotDeg = (r * 360) / cfg.rotationSteps;
        const result = scoreAndMatch(points, edges, candidates, rotDeg, seed, cfg, k);
        if (result.score > best.score) best = result;
      }
    }

    if (!globalBest || best.score > globalBest.score) {
      globalBest = { ...best, seed };
    }

    if (best.score >= cfg.coverageThreshold && best.stars.length >= cfg.minMatchedStars) {
      console.log(
        `[matcher] hit ${(best.score * 100).toFixed(0)}% (${best.stars.length} stars) on seed ${seed.id} mag ${seed.mag.toFixed(2)}`,
      );
      break;
    }
  }

  return globalBest;
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

  let globalBest: (ScoreResult & { seed: Star; variantIndex: number }) | null = null;
  let currentRadius = cfg.patchRadius;

  while (true) {
    for (let i = 0; i < skeletons.length; i++) {
      const result = runSeedSweep(skeletons[i], catalogue, excludeSeeds, currentRadius, cfg);
      if (!result) continue;
      if (!globalBest || result.score > globalBest.score) {
        globalBest = { ...result, variantIndex: i };
      }
    }

    if (globalBest && globalBest.score >= cfg.qualityThreshold) break;
    if (currentRadius >= cfg.maxPatchRadius) break;
    const next = Math.min(currentRadius + cfg.patchRadiusStep, cfg.maxPatchRadius);
    console.log(
      `[matcher] score ${globalBest ? (globalBest.score * 100).toFixed(0) + '%' : 'none'} below ${(cfg.qualityThreshold * 100).toFixed(0)}%, expanding radius ${currentRadius}° → ${next}°`,
    );
    currentRadius = next;
  }

  if (!globalBest || globalBest.stars.length === 0) return null;

  excludeSeeds.add(globalBest.seed.id);

  console.log(
    `[matcher] variant ${globalBest.variantIndex} won with ${(globalBest.score * 100).toFixed(0)}% (model: ${cfg.model})`,
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
