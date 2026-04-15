import type { Star, ConstellationLines } from './types';

export async function loadCatalogue(): Promise<Star[]> {
  const res = await fetch('/data/stars.json');
  return res.json() as Promise<Star[]>;
}

export async function loadConstellationLines(): Promise<ConstellationLines[]> {
  const res = await fetch('/data/constellation-lines.json');
  return res.json() as Promise<ConstellationLines[]>;
}

export async function loadStarNames(): Promise<Map<number, string>> {
  const res = await fetch('/data/star-names.json');
  const obj = await res.json() as Record<string, string>;
  return new Map(Object.entries(obj).map(([k, v]) => [parseInt(k, 10), v]));
}
