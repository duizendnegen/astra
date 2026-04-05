import type { Star, ConstellationLines } from './types';

export async function loadCatalogue(): Promise<Star[]> {
  const res = await fetch('/data/stars.json');
  return res.json() as Promise<Star[]>;
}

export async function loadConstellationLines(): Promise<ConstellationLines[]> {
  const res = await fetch('/data/constellation-lines.json');
  return res.json() as Promise<ConstellationLines[]>;
}
