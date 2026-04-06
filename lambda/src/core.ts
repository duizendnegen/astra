export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

export { retrieveSkeleton, type PipelineResult, type MatchProvenance } from './retrieval.js';

export function normaliseSkeleton(obj: unknown): Skeleton | null {
  if (typeof obj !== 'object' || obj === null) return null;
  const s = obj as Record<string, unknown>;
  if (!Array.isArray(s.points) || s.points.length < 3) return null;
  const points: [number, number][] = [];
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    if (typeof p[0] !== 'number' || typeof p[1] !== 'number') return null;
    // Clamp to [0,1] instead of rejecting — catches slightly-out-of-bounds LLM output
    points.push([Math.max(0, Math.min(1, p[0])), Math.max(0, Math.min(1, p[1]))]);
  }
  if (!Array.isArray(s.edges) || s.edges.length < 2) return null;
  const edges: [number, number][] = [];
  for (const e of s.edges) {
    if (!Array.isArray(e) || e.length !== 2) return null;
    if (typeof e[0] !== 'number' || typeof e[1] !== 'number') return null;
    if (e[0] < 0 || e[0] >= points.length || e[1] < 0 || e[1] >= points.length) return null;
    edges.push([e[0], e[1]]);
  }
  return { points, edges };
}

export function isValidSkeleton(obj: unknown): obj is Skeleton {
  return normaliseSkeleton(obj) !== null;
}

