import { createCanvas, Image, type CanvasRenderingContext2D } from 'canvas';
import { geoStereographic } from 'd3-geo';
import { Resvg } from '@resvg/resvg-js';

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
  renderMode?: 'skeleton' | 'stars';
}

const STROKE_COLOUR = 'rgba(160,200,255,0.85)';

/** Render an SVG string to a square PNG buffer using resvg (full spec support).
 *  Overrides fill/stroke to match the skeleton trace style. */
export function renderSvgPanel(svgString: string, size: number): Buffer {
  try {
    // Inject a style that forces stroke-only rendering in the skeleton colour
    const styled = svgString.replace(
      /(<svg[^>]*>)/,
      `$1<style>* { fill: none !important; stroke: ${STROKE_COLOUR} !important; stroke-width: 1.5px !important; }</style>`,
    );
    const resvg = new Resvg(styled, {
      background: '#0a0a1a',
      fitTo: { mode: 'width', value: size },
    });
    return Buffer.from(resvg.render().asPng());
  } catch {
    // Fallback: dark blank panel
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, size, size);
    return canvas.toBuffer('image/png');
  }
}

/** Render skeleton points and edges on a dark background (0-1 normalised coords). */
export function renderSkeletonPanel(points: [number, number][], edges: [number, number][], size: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, size, size);

  const pad = size * 0.08;
  const s = size - 2 * pad;
  const px = (x: number) => pad + x * s;
  const py = (y: number) => pad + y * s;

  if (points.length === 0) {
    ctx.fillStyle = '#444';
    ctx.font = `${Math.round(size * 0.07)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('no skeleton', size / 2, size / 2);
    return canvas.toBuffer('image/png');
  }

  // Draw edges
  ctx.strokeStyle = 'rgba(100, 160, 255, 0.6)';
  ctx.lineWidth = 1;
  for (const [i, j] of edges) {
    const a = points[i], b = points[j];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(px(a[0]), py(a[1]));
    ctx.lineTo(px(b[0]), py(b[1]));
    ctx.stroke();
  }

  // Draw points
  ctx.fillStyle = '#88bbff';
  for (const [x, y] of points) {
    ctx.beginPath();
    ctx.arc(px(x), py(y), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  return canvas.toBuffer('image/png');
}

/** Combine SVG, skeleton, and constellation into a 3-panel composite image. */
export function renderComposite(
  svgString: string | null,
  skeleton: { points: [number, number][]; edges: [number, number][] } | null,
  constellationBuf: Buffer,
  panelSize: number,
): Buffer {
  const w = panelSize * 3;
  const h = panelSize;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, w, h);

  // Panel 1: SVG shape
  if (svgString) {
    const p1 = renderSvgPanel(svgString, panelSize);
    const img1 = new Image();
    img1.src = p1;
    ctx.drawImage(img1, 0, 0);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, panelSize, panelSize);
    ctx.fillStyle = '#444';
    ctx.font = `${Math.round(panelSize * 0.07)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('no SVG', panelSize / 2, panelSize / 2);
  }

  // Panel 2: skeleton
  if (skeleton) {
    const p2 = renderSkeletonPanel(skeleton.points, skeleton.edges, panelSize);
    const img2 = new Image();
    img2.src = p2;
    ctx.drawImage(img2, panelSize, 0);
  }

  // Panel 3: constellation
  const img3 = new Image();
  img3.src = constellationBuf;
  ctx.drawImage(img3, panelSize * 2, 0);

  // Dividers
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(panelSize, 0); ctx.lineTo(panelSize, h);
  ctx.moveTo(panelSize * 2, 0); ctx.lineTo(panelSize * 2, h);
  ctx.stroke();

  // Labels
  ctx.fillStyle = '#666';
  ctx.font = `${Math.round(panelSize * 0.055)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SVG', panelSize * 0.5, 4);
  ctx.fillText('skeleton', panelSize * 1.5, 4);
  ctx.fillText('constellation', panelSize * 2.5, 4);

  return canvas.toBuffer('image/png');
}

// ── Renderer ──────────────────────────────────────────────────────────────

export function renderPatch(result: WordResult, opts: RenderOpts): Buffer {
  const { width: w, height: h, patchRadiusDeg, renderMode = 'skeleton' } = opts;
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

  // Constellation / skeleton edges
  if (result.edges.length > 0) {
    ctx.strokeStyle = 'rgba(100, 160, 255, 0.55)';
    ctx.lineWidth = 1;

    if (renderMode === 'stars' && result.constellationStarIds.length > 0) {
      // Draw lines between actual constellation star positions
      const starById = new Map(result.patchStars.map((s) => [s.id, s]));
      const constStars = result.constellationStarIds.map((id) => starById.get(id));
      for (const [i, j] of result.edges) {
        if (i >= constStars.length || j >= constStars.length) continue;
        const a = constStars[i], b = constStars[j];
        if (!a || !b) continue;
        const pa = proj([a.ra, a.dec]);
        const pb = proj([b.ra, b.dec]);
        if (!pa || !pb) continue;
        ctx.beginPath();
        ctx.moveTo(pa[0], pa[1]);
        ctx.lineTo(pb[0], pb[1]);
        ctx.stroke();
      }
    } else if (result.skeletonPoints.length > 0) {
      // Draw lines between skeleton contour points
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
  }

  return canvas.toBuffer('image/png');
}
