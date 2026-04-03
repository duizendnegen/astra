/**
 * svg-to-skeleton.ts
 *
 * Converts an SVG string into a Skeleton (points + edges) suitable for
 * constellation matching. Pipeline:
 *   1. Parse <path> elements + resolve transforms → absolute commands
 *   2. Normalise coordinates to [0,1] via viewBox
 *   3. Sample a dense point cloud (100–500 pts) with curvature weighting
 *   4. Simplify to 15–40 pts via a swappable algorithm (default: RDP)
 *   5. Derive edges from path continuity
 *
 * Sub-step results are cached in memory (and optionally on disk for dev).
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { Skeleton } from './core.js';

// ── Types ─────────────────────────────────────────────────────────────────────

type Point = [number, number];

export type SimplifyFn = (points: Point[], epsilon: number) => Point[];

export interface SvgToSkeletonOptions {
  simplify?: SimplifyFn;
  algorithmName?: string;
  epsilon?: number;          // Initial RDP epsilon (auto-adjusted if needed)
  targetMin?: number;        // Min points (default 15)
  targetMax?: number;        // Max points (default 40)
  diskCacheDir?: string;     // Optional disk cache directory for dev
}

interface SampledPath {
  points: Point[];
  closedLoops: boolean[];    // whether each sub-path was closed (Z command)
  subPathBoundaries: number[]; // index where each new sub-path starts
}

// ── Disk cache ────────────────────────────────────────────────────────────────

function readDiskCache<T>(dir: string, key: string): T | null {
  try {
    const file = path.join(dir, `${key}.json`);
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch { /* ignore */ }
  return null;
}

function writeDiskCache(dir: string, key: string, value: unknown): void {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify(value));
  } catch { /* ignore */ }
}

// ── In-memory cache ───────────────────────────────────────────────────────────

const sampleCache = new Map<string, SampledPath>();
const skeletonCache = new Map<string, Skeleton>();

// ── SVG path parser ───────────────────────────────────────────────────────────

function svgHash(svgPath: string): string {
  return createHash('sha256').update(svgPath).digest('hex').slice(0, 16);
}

/** Tokenise SVG path number arguments correctly, handling implicit separators.
 *  E.g. "0,0,0-11.31" → [0,0,0,-11.31]  and  "0 0 0 0.5.3" → [0,0,0,0.5,0.3] */
function tokeniseArgs(raw: string): number[] {
  const nums: number[] = [];
  // Each token: optional sign, then digits/decimal; handles negative implicit separator
  const re = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) nums.push(Number(m[0]));
  return nums;
}

/** Parse a compact SVG path `d` attribute into absolute-coordinate segments. */
function parseSvgD(d: string): { cmd: string; args: number[] }[] {
  const segments: { cmd: string; args: number[] }[] = [];
  const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let m: RegExpExecArray | null;

  let cx = 0, cy = 0, startX = 0, startY = 0;

  while ((m = re.exec(d)) !== null) {
    const cmd = m[1];
    const rawArgs = tokeniseArgs(m[2]);

    if (cmd === 'Z' || cmd === 'z') {
      segments.push({ cmd: 'Z', args: [] });
      cx = startX; cy = startY;
      continue;
    }

    const isRel = cmd === cmd.toLowerCase();

    const consumeCoord = (args: number[], i: number): [number, number] => {
      const x = args[i], y = args[i + 1];
      return isRel ? [cx + x, cy + y] : [x, y];
    };

    switch (cmd.toUpperCase()) {
      case 'M': {
        for (let i = 0; i < rawArgs.length; i += 2) {
          const [x, y] = consumeCoord(rawArgs, i);
          if (i === 0) { segments.push({ cmd: 'M', args: [x, y] }); startX = x; startY = y; }
          else segments.push({ cmd: 'L', args: [x, y] });
          cx = x; cy = y;
        }
        break;
      }
      case 'L': {
        for (let i = 0; i < rawArgs.length; i += 2) {
          const [x, y] = consumeCoord(rawArgs, i);
          segments.push({ cmd: 'L', args: [x, y] });
          cx = x; cy = y;
        }
        break;
      }
      case 'H': {
        for (const val of rawArgs) {
          const x = isRel ? cx + val : val;
          segments.push({ cmd: 'L', args: [x, cy] });
          cx = x;
        }
        break;
      }
      case 'V': {
        for (const val of rawArgs) {
          const y = isRel ? cy + val : val;
          segments.push({ cmd: 'L', args: [cx, y] });
          cy = y;
        }
        break;
      }
      case 'C': {
        for (let i = 0; i < rawArgs.length; i += 6) {
          const [x1, y1] = consumeCoord(rawArgs, i);
          const [x2, y2] = consumeCoord(rawArgs, i + 2);
          const [x, y] = consumeCoord(rawArgs, i + 4);
          segments.push({ cmd: 'C', args: [x1, y1, x2, y2, x, y] });
          cx = x; cy = y;
        }
        break;
      }
      case 'S': {
        for (let i = 0; i < rawArgs.length; i += 4) {
          // Reflect previous control point — simplified: use current pos as cp1
          const [x2, y2] = consumeCoord(rawArgs, i);
          const [x, y] = consumeCoord(rawArgs, i + 2);
          segments.push({ cmd: 'C', args: [cx, cy, x2, y2, x, y] });
          cx = x; cy = y;
        }
        break;
      }
      case 'Q': {
        for (let i = 0; i < rawArgs.length; i += 4) {
          const [qx1, qy1] = consumeCoord(rawArgs, i);
          const [x, y] = consumeCoord(rawArgs, i + 2);
          // Elevate quadratic to cubic
          segments.push({ cmd: 'C', args: [
            cx + (2/3) * (qx1 - cx), cy + (2/3) * (qy1 - cy),
            x + (2/3) * (qx1 - x), y + (2/3) * (qy1 - y),
            x, y,
          ] });
          cx = x; cy = y;
        }
        break;
      }
      case 'T': {
        for (let i = 0; i < rawArgs.length; i += 2) {
          const [x, y] = consumeCoord(rawArgs, i);
          segments.push({ cmd: 'C', args: [cx, cy, cx, cy, x, y] });
          cx = x; cy = y;
        }
        break;
      }
      case 'A': {
        // Arc — approximate with a line to endpoint for simplicity
        for (let i = 0; i < rawArgs.length; i += 7) {
          const [x, y] = consumeCoord(rawArgs, i + 5);
          segments.push({ cmd: 'L', args: [x, y] });
          cx = x; cy = y;
        }
        break;
      }
    }
  }
  return segments;
}

// ── Cubic Bezier sampling ─────────────────────────────────────────────────────

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const mt = 1 - t;
  return mt ** 3 * p0 + 3 * mt ** 2 * t * p1 + 3 * mt * t ** 2 * p2 + t ** 3 * p3;
}

/** Estimate curvature of a cubic Bezier at parameter t. */
function cubicCurvature(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
  t: number,
): number {
  const mt = 1 - t;
  const dx = 3 * (mt ** 2 * (x1 - x0) + 2 * mt * t * (x2 - x1) + t ** 2 * (x3 - x2));
  const dy = 3 * (mt ** 2 * (y1 - y0) + 2 * mt * t * (y2 - y1) + t ** 2 * (y3 - y2));
  const ddx = 6 * (mt * (x2 - 2 * x1 + x0) + t * (x3 - 2 * x2 + x1));
  const ddy = 6 * (mt * (y2 - 2 * y1 + y0) + t * (y3 - 2 * y2 + y1));
  const denom = (dx ** 2 + dy ** 2) ** 1.5;
  if (denom < 1e-10) return 0;
  return Math.abs(dx * ddy - dy * ddx) / denom;
}

/** Sample a cubic Bezier with curvature-proportional density. */
function sampleCubic(
  x0: number, y0: number, x1: number, y1: number,
  x2: number, y2: number, x3: number, y3: number,
  baseSamples = 16,
): Point[] {
  const pts: Point[] = [];
  // Measure curvature at a few points to scale sampling
  let maxK = 0;
  for (let i = 0; i <= 4; i++) {
    maxK = Math.max(maxK, cubicCurvature(x0, y0, x1, y1, x2, y2, x3, y3, i / 4));
  }
  const n = Math.min(64, Math.max(baseSamples, Math.round(baseSamples * (1 + maxK * 10))));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push([
      cubicAt(x0, x1, x2, x3, t),
      cubicAt(y0, y1, y2, y3, t),
    ]);
  }
  return pts;
}

// ── Path sampling ─────────────────────────────────────────────────────────────

function samplePath(svgPathD: string): SampledPath {
  const segments = parseSvgD(svgPathD);
  const allPoints: Point[] = [];
  const subPathBoundaries: number[] = [0];
  const closedLoops: boolean[] = [];

  let cx = 0, cy = 0, subPathClosed = false;

  for (const seg of segments) {
    switch (seg.cmd) {
      case 'M': {
        if (allPoints.length > subPathBoundaries[subPathBoundaries.length - 1]) {
          subPathBoundaries.push(allPoints.length);
          closedLoops.push(subPathClosed);
        }
        cx = seg.args[0]; cy = seg.args[1];
        allPoints.push([cx, cy]);
        subPathClosed = false;
        break;
      }
      case 'L': {
        cx = seg.args[0]; cy = seg.args[1];
        allPoints.push([cx, cy]);
        break;
      }
      case 'C': {
        const [x1, y1, x2, y2, x, y] = seg.args;
        const pts = sampleCubic(cx, cy, x1, y1, x2, y2, x, y);
        allPoints.push(...pts.slice(1)); // skip first (already added)
        cx = x; cy = y;
        break;
      }
      case 'Z': {
        subPathClosed = true;
        break;
      }
    }
  }

  closedLoops.push(subPathClosed);

  return { points: allPoints, closedLoops, subPathBoundaries };
}

// ── ViewBox normalisation ─────────────────────────────────────────────────────

function extractViewBox(svg: string): [number, number, number, number] | null {
  const m = svg.match(/viewBox=["']([^"']+)["']/);
  if (!m) return null;
  const parts = m[1].split(/[\s,]+/).map(Number);
  if (parts.length < 4) return null;
  return [parts[0], parts[1], parts[2], parts[3]];
}

function normalisePoints(points: Point[], vb: [number, number, number, number]): Point[] {
  const [minX, minY, w, h] = vb;
  const scale = Math.max(w, h);
  return points.map(([x, y]) => [
    Math.max(0, Math.min(1, (x - minX) / scale)),
    Math.max(0, Math.min(1, (y - minY) / scale)),
  ]);
}

function boundingBox(points: Point[]): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

// ── Ramer-Douglas-Peucker simplification ──────────────────────────────────────

function perpDist(p: Point, a: Point, b: Point): number {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
  const tc = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + tc * dx), py - (ay + tc * dy));
}

export function rdpSimplify(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0, maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDist(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...rdpSimplify(points.slice(0, maxIdx + 1), epsilon).slice(0, -1),
    ...rdpSimplify(points.slice(maxIdx), epsilon),
  ];
}

// ── Visvalingam-Whyatt simplification ─────────────────────────────────────────

function triangleArea(a: Point, b: Point, c: Point): number {
  return Math.abs((a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1])) / 2);
}

export function visvalingamWhyatt(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  const pts = [...points];
  while (pts.length > 2) {
    let minArea = Infinity, minIdx = -1;
    for (let i = 1; i < pts.length - 1; i++) {
      const area = triangleArea(pts[i - 1], pts[i], pts[i + 1]);
      if (area < minArea) { minArea = area; minIdx = i; }
    }
    if (minArea > epsilon || minIdx === -1) break;
    pts.splice(minIdx, 1);
  }
  return pts;
}

// ── Auto-epsilon adjustment ───────────────────────────────────────────────────

function simplifyToTarget(
  points: Point[],
  simplifyFn: SimplifyFn,
  initialEpsilon: number,
  targetMin: number,
  targetMax: number,
): { points: Point[]; epsilon: number } {
  let epsilon = initialEpsilon;
  let result = simplifyFn(points, epsilon);

  // Too many points — increase epsilon
  for (let i = 0; i < 10 && result.length > targetMax; i++) {
    epsilon *= 1.5;
    result = simplifyFn(points, epsilon);
  }

  // Too few points — decrease epsilon
  for (let i = 0; i < 10 && result.length < targetMin && epsilon > 1e-6; i++) {
    epsilon /= 1.5;
    result = simplifyFn(points, epsilon);
  }

  return { points: result, epsilon };
}

// ── Edge derivation ───────────────────────────────────────────────────────────

/** Given original sub-path boundaries and simplified points, derive edges by
 *  mapping simplified points back to the original and connecting consecutives. */
function deriveEdges(
  simplifiedPoints: Point[],
  originalSampled: SampledPath,
  closedLoops: boolean[],
): [number, number][] {
  // For each simplified point, find the nearest original point and its sub-path index
  const boundaries = originalSampled.subPathBoundaries;

  function subPathOf(origIdx: number): number {
    for (let s = boundaries.length - 1; s >= 0; s--) {
      if (origIdx >= boundaries[s]) return s;
    }
    return 0;
  }

  // Map each simplified point to its nearest original point index
  const origIndices = simplifiedPoints.map((sp) => {
    let best = 0, bestDist = Infinity;
    for (let i = 0; i < originalSampled.points.length; i++) {
      const [ox, oy] = originalSampled.points[i];
      const d = (ox - sp[0]) ** 2 + (oy - sp[1]) ** 2;
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  });

  const edges: [number, number][] = [];

  for (let i = 0; i < simplifiedPoints.length - 1; i++) {
    const subA = subPathOf(origIndices[i]);
    const subB = subPathOf(origIndices[i + 1]);
    if (subA === subB) {
      edges.push([i, i + 1]);
    }
    // Don't bridge different sub-paths
  }

  // Close loops: connect last point back to first if the sub-path was closed
  // and both are in the same sub-path
  for (let s = 0; s < closedLoops.length; s++) {
    if (!closedLoops[s]) continue;
    // Find first and last simplified point in this sub-path
    const inSubPath = origIndices
      .map((oi, si) => ({ si, sub: subPathOf(oi) }))
      .filter(({ sub }) => sub === s)
      .map(({ si }) => si);
    if (inSubPath.length >= 2) {
      const first = inSubPath[0];
      const last = inSubPath[inSubPath.length - 1];
      if (first !== last) edges.push([last, first]);
    }
  }

  return edges;
}

// ── Extract all path elements from SVG ────────────────────────────────────────

/** Parse an attribute value by name from an SVG/HTML tag's attribute string. */
function extractAttr(attrs: string, name: string): string | null {
  let i = 0;
  while (i < attrs.length) {
    // Skip whitespace
    while (i < attrs.length && /\s/.test(attrs[i])) i++;
    if (i >= attrs.length) break;
    // Read attribute name
    const nameStart = i;
    while (i < attrs.length && !/[\s=/>]/.test(attrs[i])) i++;
    const attrName = attrs.slice(nameStart, i);
    // Skip whitespace around '='
    while (i < attrs.length && /[\s]/.test(attrs[i])) i++;
    if (i < attrs.length && attrs[i] === '=') {
      i++;
      while (i < attrs.length && /[\s]/.test(attrs[i])) i++;
      const quote = attrs[i];
      if (quote === '"' || quote === "'") {
        i++;
        const valueStart = i;
        while (i < attrs.length && attrs[i] !== quote) i++;
        const value = attrs.slice(valueStart, i);
        i++; // closing quote
        if (attrName === name) return value;
      } else {
        const valueStart = i;
        while (i < attrs.length && !/\s/.test(attrs[i])) i++;
        if (attrName === name) return attrs.slice(valueStart, i);
      }
    }
    // Boolean attribute (no value) — skip
  }
  return null;
}

/** Extract all <path> d-attribute values from an SVG string using a proper parser. */
function extractSvgPaths(svg: string): string[] {
  const paths: string[] = [];
  let pos = 0;
  while (pos < svg.length) {
    const start = svg.indexOf('<path', pos);
    if (start === -1) break;
    // Verify word boundary: next char must be whitespace or /  or >
    const nextChar = svg[start + 5];
    if (nextChar && /[a-zA-Z0-9_-]/.test(nextChar)) { pos = start + 5; continue; }
    const tagEnd = svg.indexOf('>', start + 5);
    if (tagEnd === -1) break;
    const d = extractAttr(svg.slice(start + 5, tagEnd), 'd');
    if (d) paths.push(d);
    pos = tagEnd + 1;
  }
  return paths;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Convert an SVG string (or a bare path `d` attribute) into a Skeleton. */
export function svgToSkeleton(
  svgOrPath: string,
  opts: SvgToSkeletonOptions = {},
): Skeleton | null {
  const {
    simplify: simplifyFn = rdpSimplify,
    algorithmName = 'rdp',
    epsilon: initialEpsilon = 0.02,
    targetMin = 15,
    targetMax = 40,
    diskCacheDir,
  } = opts;

  const hash = svgHash(svgOrPath);
  const skelKey = `${hash}__${algorithmName}__${initialEpsilon}`;

  // Check skeleton cache
  if (skeletonCache.has(skelKey)) return skeletonCache.get(skelKey)!;
  if (diskCacheDir) {
    const cached = readDiskCache<Skeleton>(diskCacheDir, skelKey);
    if (cached) { skeletonCache.set(skelKey, cached); return cached; }
  }

  // Step 1: sample (cached by svgHash)
  let sampled = sampleCache.get(hash);
  if (!sampled) {
    // Detect whether input is a full SVG or a bare path d
    const isSvg = svgOrPath.trim().startsWith('<');
    let combinedD: string;
    if (isSvg) {
      const pathDs = extractSvgPaths(svgOrPath);
      if (pathDs.length === 0) return null;
      combinedD = pathDs.join(' ');
    } else {
      combinedD = svgOrPath;
    }
    sampled = samplePath(combinedD);
    sampleCache.set(hash, sampled);
    if (diskCacheDir) writeDiskCache(diskCacheDir, `${hash}__sample`, sampled);
  }

  if (sampled.points.length === 0) return null;

  // Step 2: normalise coordinates
  let vb = extractViewBox(svgOrPath);
  if (!vb) vb = boundingBox(sampled.points);
  const [,, w, h] = vb;
  if (w < 1e-6 || h < 1e-6) return null;

  const normOriginal = normalisePoints(sampled.points, vb);
  const normSampled: SampledPath = { ...sampled, points: normOriginal };

  // Step 3: simplify
  const { points: simplified } = simplifyToTarget(
    normOriginal, simplifyFn, initialEpsilon, targetMin, targetMax,
  );
  if (simplified.length < 3) return null;

  // Step 4: derive edges
  const edges = deriveEdges(simplified, normSampled, sampled.closedLoops);

  const skeleton: Skeleton = { points: simplified as [number, number][], edges };
  skeletonCache.set(skelKey, skeleton);
  if (diskCacheDir) writeDiskCache(diskCacheDir, skelKey, skeleton);

  return skeleton;
}

/** Clear in-memory caches (useful in tests). */
export function clearSvgCaches(): void {
  sampleCache.clear();
  skeletonCache.clear();
}
