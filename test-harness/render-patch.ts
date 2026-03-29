import { createCanvas } from 'canvas';
import { geoStereographic } from 'd3-geo';

// ── Types (inlined to avoid importing DOM-coupled frontend types) ──────────

interface Star {
  id: number;
  ra: number;
  dec: number;
  mag: number;
}

interface SkeletonPoint {
  ra: number;
  dec: number;
}

interface WordResult {
  word: string;
  matched: boolean;
  patchRA: number;
  patchDec: number;
  matchedStarIds: number[];
  constellationStarIds: number[];
  skeletonPoints: SkeletonPoint[];
  edges: [number, number][];
  patchStars: Star[];
}

export interface RenderOpts {
  width: number;
  height: number;
  patchRadiusDeg: number;
}

// ── Renderer ──────────────────────────────────────────────────────────────

export function renderPatch(result: WordResult, opts: RenderOpts): Buffer {
  const { width: w, height: h, patchRadiusDeg } = opts;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, w, h);

  if (!result.matched || result.patchStars.length === 0) {
    ctx.fillStyle = '#444';
    ctx.font = `${Math.round(h * 0.07)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('no match', w / 2, h / 2);
    return canvas.toBuffer('image/png');
  }

  const proj = geoStereographic()
    .rotate([-result.patchRA, -result.patchDec])
    .scale((Math.min(w, h) / 2) / (patchRadiusDeg * Math.PI / 180))
    .translate([w / 2, h / 2]);

  const matchedIds = new Set(result.matchedStarIds);
  const constIds = new Set(result.constellationStarIds);

  // Draw stars in three tiers: background, matched, constellation
  for (const s of result.patchStars) {
    const p = proj([s.ra, s.dec]);
    if (!p) continue;
    const [x, y] = p;
    if (x < 0 || x > w || y < 0 || y > h) continue;

    const radius = Math.max(0.5, 2.2 - s.mag * 0.25);

    if (constIds.has(s.id)) {
      ctx.fillStyle = '#ffffff';
    } else if (matchedIds.has(s.id)) {
      ctx.fillStyle = '#aabbdd';
    } else {
      ctx.fillStyle = '#2a2a55';
    }

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Skeleton edges
  if (result.skeletonPoints.length > 0 && result.edges.length > 0) {
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.55)';
    ctx.lineWidth = 1;
    for (const [i, j] of result.edges) {
      const a = result.skeletonPoints[i];
      const b = result.skeletonPoints[j];
      if (!a || !b) continue;
      const pa = proj([a.ra, a.dec]);
      const pb = proj([b.ra, b.dec]);
      if (!pa || !pb) continue;
      ctx.beginPath();
      ctx.moveTo(pa[0], pa[1]);
      ctx.lineTo(pb[0], pb[1]);
      ctx.stroke();
    }
  }

  return canvas.toBuffer('image/png');
}
