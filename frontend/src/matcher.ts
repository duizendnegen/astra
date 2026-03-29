import type { Star, Skeleton, MatchResult } from './types';

// ── Public config types ───────────────────────────────────────────────────

export type ModelName = 'simple' | 'vertex' | 'spread';

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
  spreadWeight?: number;
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
  spreadWeight: number;
}

interface ResolvedConfig extends ModelDefaults {
  model: ModelName;
}

interface ScoringModel {
  defaults: ModelDefaults;
  starLoss(d: number): number;
  vertexBonus(dVtx: number, degree: number, cfg: ResolvedConfig): number;
  spreadScore(matchedNorm: Point2D[], skelNorm: Point2D[], edges: [number, number][], cfg: ResolvedConfig): number;
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
  coverageThreshold: 0.60,
  minMatchedStars: 6,
  rotationSteps: 12,      // every 30°
  skeletonFillRatio: 0.8, // skeleton longest axis = 80% of patch diameter
  distanceThreshold: 0.15, // 1.5° at default patch
  vertexBonusEndpoint: 0.6,
  vertexBonusJoint: 0.1,
  vertexSigma: 0.12,      // 1.2° at default patch
  brightnessWeight: 0.3,
  maxConstellationStars: 8,
  spreadWeight: 0.2,
};

const SIMPLE_MODEL: ScoringModel = {
  defaults: { ...BASE_DEFAULTS },
  starLoss: (d) => d,
  vertexBonus: () => 0,
  spreadScore: () => 0,
};

const VERTEX_MODEL: ScoringModel = {
  defaults: { ...BASE_DEFAULTS },
  starLoss: (d) => d,
  vertexBonus: (dVtx, degree, cfg) => {
    const bonus = degree === 1 ? cfg.vertexBonusEndpoint : cfg.vertexBonusJoint;
    return bonus * Math.exp(-(dVtx * dVtx) / (cfg.vertexSigma * cfg.vertexSigma));
  },
  spreadScore: () => 0,
};

const SPREAD_MODEL: ScoringModel = {
  defaults: { ...BASE_DEFAULTS },
  starLoss: (d) => d,
  vertexBonus: (dVtx, degree, cfg) => VERTEX_MODEL.vertexBonus(dVtx, degree, cfg),
  spreadScore: (matchedNorm, skelNorm, edges, cfg) => {
    if (edges.length === 0) return 0;
    const covered = edges.filter(([i, j]) =>
      matchedNorm.some((mn) => pointToSegmentDist(mn, skelNorm[i], skelNorm[j]) < cfg.distanceThreshold),
    ).length;
    return covered / edges.length;
  },
};

const MODELS: Record<ModelName, ScoringModel> = {
  simple: SIMPLE_MODEL,
  vertex: VERTEX_MODEL,
  spread: SPREAD_MODEL,
};

function resolveConfig(config?: MatcherConfig): ResolvedConfig {
  const modelName = config?.model ?? 'vertex';
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

  const bonus = MODELS[cfg.model].vertexBonus(dVtx, bestDegree, cfg);
  return dSeg * (1 - bonus);
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
  cfg: ResolvedConfig = resolveConfig(),
): Star[] {
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
}

function scoreAndMatch(
  skelPoints: Point2D[],
  edges: [number, number][],
  candidates: Star[],
  rotDeg: number,
  seed: Star,
  cfg: ResolvedConfig,
): ScoreResult {
  const centered: Point2D[] = skelPoints.map(([x, y]) => [x - 0.5, 0.5 - y]);
  const scale = cfg.skeletonFillRatio * 2;
  const skelNorm: Point2D[] = rotate(centered, rotDeg).map(([x, y]) => [x * scale, y * scale]);

  const starNorm: Point2D[] = candidates.map((s) => [
    (s.ra - seed.ra) / cfg.patchRadius,
    (s.dec - seed.dec) / cfg.patchRadius,
  ]);

  const degrees = vertexDegrees(edges, skelPoints.length);

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
  const spread = model.spreadScore(matched.map((m) => m.norm), skelNorm, edges, cfg);
  const score = coverageRatio + cfg.spreadWeight * spread;

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

    for (let r = 0; r < cfg.rotationSteps; r++) {
      const rotDeg = (r * 360) / cfg.rotationSteps;
      const result = scoreAndMatch(points, edges, candidates, rotDeg, seed, cfg);
      if (result.score > best.score) best = result;
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
