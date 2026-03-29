import type { ConstellationState, Star } from './types';
import { getCatalogue } from './catalogue';

interface Encoded {
  word: string;
  ids: number[];
  cids: number[]; // constellationStars ids
  edges: [number, number][];
  ra: number;
  dec: number;
  skelPts?: [number, number][]; // [ra, dec] pairs for skeleton contour
}

export function encode(state: ConstellationState): string {
  const payload: Encoded = {
    word: state.word,
    ids: state.match.stars.map((s) => s.id),
    cids: state.match.constellationStars.map((s) => s.id),
    edges: state.match.edges,
    ra: parseFloat(state.match.patchRA.toFixed(4)),
    dec: parseFloat(state.match.patchDec.toFixed(4)),
  };
  if (state.match.skeletonPoints) {
    payload.skelPts = state.match.skeletonPoints.map((p) => [
      parseFloat(p.ra.toFixed(4)),
      parseFloat(p.dec.toFixed(4)),
    ]);
  }
  return btoa(JSON.stringify(payload));
}

export function decode(param: string, catalogue?: Star[]): ConstellationState | null {
  try {
    const payload = JSON.parse(atob(param)) as Encoded;
    if (!Array.isArray(payload.cids)) return null;

    const cat = catalogue ?? getCatalogue();
    const idMap = new Map(cat.map((s) => [s.id, s]));

    const stars = payload.ids.map((id) => idMap.get(id)).filter(Boolean) as Star[];
    if (stars.length !== payload.ids.length) return null;

    const constellationStars = payload.cids.map((id) => idMap.get(id)).filter(Boolean) as Star[];
    if (constellationStars.length !== payload.cids.length) return null;

    const skeletonPoints = payload.skelPts?.map(([ra, dec]) => ({ ra, dec }));

    return {
      word: payload.word,
      match: { stars, constellationStars, edges: payload.edges, patchRA: payload.ra, patchDec: payload.dec, skeletonPoints },
    };
  } catch {
    return null;
  }
}

export function buildShareUrl(state: ConstellationState): string {
  const current = new URLSearchParams(location.search);
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('c', encode(state));
  if (current.get('show_stars') === '1') url.searchParams.set('show_stars', '1');
  if (current.get('show_lines') === '1') url.searchParams.set('show_lines', '1');
  return url.toString();
}

export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
