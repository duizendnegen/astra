import type { Star, ConstellationLines } from './types';

let stars: Star[] | null = null;

export async function loadCatalogue(): Promise<Star[]> {
  if (stars) return stars;
  const res = await fetch('/data/stars.json');
  stars = await res.json() as Star[];
  return stars;
}

export function getCatalogue(): Star[] {
  if (!stars) throw new Error('Catalogue not loaded');
  return stars;
}

export async function loadConstellationLines(): Promise<ConstellationLines[]> {
  const res = await fetch('/data/constellation-lines.json');
  return res.json() as Promise<ConstellationLines[]>;
}
