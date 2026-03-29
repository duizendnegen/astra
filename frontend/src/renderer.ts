import * as d3 from 'd3';
import type { Star, CameraState, MatchResult } from './types';
import { LANDING_CAMERA, RESULT_FOV } from './types';

const STAR_LINE_COLOR = '#a7c8ff';
const BG_STAR_MAX_RADIUS = 2.2;
const MATCHED_STAR_RADIUS = 3.5;
const DIM_FALLOFF_DEG = 40; // degrees from centre where dimming reaches minimum

let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let projection: d3.GeoProjection;
let camera: CameraState = { ...LANDING_CAMERA };
let stars: Star[] = [];
let constellation: MatchResult | null = null;

// ── Projection helpers ────────────────────────────────────────────────────

function fovToScale(fov: number): number {
  const shortDim = Math.min(canvas.width, canvas.height);
  return (shortDim / 2) / (2 * Math.tan((fov * Math.PI) / 360));
}

function buildProjection(): d3.GeoProjection {
  // D3 geo uses longitude/latitude. We map RA→longitude, Dec→latitude.
  // D3 rotate: [-centralLon, -centralLat] to centre the projection.
  return d3
    .geoStereographic()
    .rotate([-camera.ra, -camera.dec, 0])
    .scale(fovToScale(camera.fov))
    .translate([canvas.width / 2, canvas.height / 2])
    .clipAngle(90);
}

function project(ra: number, dec: number): [number, number] | null {
  const pt = projection([ra, dec]);
  return pt ?? null;
}

// ── Star brightness helpers ───────────────────────────────────────────────

function magToRadius(mag: number): number {
  // Brighter stars (lower mag) → larger radius
  return Math.max(0.4, BG_STAR_MAX_RADIUS - mag * 0.28);
}

function magToAlpha(mag: number): number {
  return Math.max(0.15, 1 - mag * 0.14);
}

function distanceDeg(ra1: number, dec1: number, ra2: number, dec2: number): number {
  // Haversine
  const dRa = ((ra2 - ra1) * Math.PI) / 180;
  const dDec = ((dec2 - dec1) * Math.PI) / 180;
  const a =
    Math.sin(dDec / 2) ** 2 +
    Math.cos((dec1 * Math.PI) / 180) *
    Math.cos((dec2 * Math.PI) / 180) *
    Math.sin(dRa / 2) ** 2;
  return (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 180) / Math.PI;
}

// ── Draw ─────────────────────────────────────────────────────────────────

function drawStars(): void {
  const matchedIds = new Set(constellation?.stars.map((s) => s.id) ?? []);

  for (const star of stars) {
    const pt = project(star.ra, star.dec);
    if (!pt) continue;
    if (pt[0] < -2 || pt[0] > canvas.width + 2 || pt[1] < -2 || pt[1] > canvas.height + 2) continue;

    const isMatched = matchedIds.has(star.id);
    if (isMatched) continue; // drawn separately on top

    let alpha = magToAlpha(star.mag);

    // Dim by distance from constellation centre if result visible
    if (constellation) {
      const dist = distanceDeg(star.ra, star.dec, constellation.patchRA, constellation.patchDec);
      const dimFactor = Math.max(0.08, 1 - dist / DIM_FALLOFF_DEG);
      alpha *= dimFactor;
    }

    const radius = magToRadius(star.mag);
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220,226,250,${alpha.toFixed(3)})`;
    ctx.fill();
  }
}

function drawConstellation(): void {
  if (!constellation) return;

  const { stars: matched, edges, skeletonPoints } = constellation;

  // Project matched star positions
  const starPositions: ([number, number] | null)[] = matched.map((s) => project(s.ra, s.dec));

  if (skeletonPoints && skeletonPoints.length > 0) {
    // Project skeleton contour points
    const skelPositions: ([number, number] | null)[] = skeletonPoints.map((p) => project(p.ra, p.dec));

    // Draw skeleton edges between original contour points
    ctx.strokeStyle = STAR_LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.75;
    for (const [i, j] of edges) {
      const a = skelPositions[i];
      const b = skelPositions[j];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw thin dashed connectors from each skeleton point to its matched star
    ctx.strokeStyle = 'rgba(167,200,255,0.22)';
    ctx.lineWidth = 0.75;
    ctx.setLineDash([3, 5]);
    for (let i = 0; i < skeletonPoints.length; i++) {
      const sp = skelPositions[i];
      const st = starPositions[i];
      if (!sp || !st) continue;
      ctx.beginPath();
      ctx.moveTo(sp[0], sp[1]);
      ctx.lineTo(st[0], st[1]);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } else {
    // Fallback: draw edges between matched stars (for old share links without skeletonPoints)
    ctx.strokeStyle = STAR_LINE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.75;
    for (const [i, j] of edges) {
      const a = starPositions[i];
      const b = starPositions[j];
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Draw matched star dots on top
  for (let idx = 0; idx < matched.length; idx++) {
    const pt = starPositions[idx];
    if (!pt) continue;
    const star = matched[idx];
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], MATCHED_STAR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // Glow
    const grd = ctx.createRadialGradient(pt[0], pt[1], 0, pt[0], pt[1], MATCHED_STAR_RADIUS * 3);
    grd.addColorStop(0, 'rgba(167,200,255,0.35)');
    grd.addColorStop(1, 'rgba(167,200,255,0)');
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], MATCHED_STAR_RADIUS * 3, 0, Math.PI * 2);
    ctx.fillStyle = grd;
    ctx.fill();
    // Magnitude-based size for brightness
    ctx.beginPath();
    ctx.arc(pt[0], pt[1], magToRadius(star.mag), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220,226,250,${magToAlpha(star.mag).toFixed(3)})`;
    ctx.fill();
  }
}

export function draw(): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0c1324';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawStars();
  drawConstellation();
}

// ── Camera animation ──────────────────────────────────────────────────────

let animFrame: number | null = null;

export function animateTo(
  target: CameraState,
  durationMs: number,
  onComplete?: () => void,
): void {
  if (animFrame !== null) cancelAnimationFrame(animFrame);

  const start = { ...camera };
  const startTime = performance.now();
  const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

  function step(now: number) {
    const t = Math.min(1, (now - startTime) / durationMs);
    const e = ease(t);

    camera = {
      ra: start.ra + (target.ra - start.ra) * e,
      dec: start.dec + (target.dec - start.dec) * e,
      fov: start.fov + (target.fov - start.fov) * e,
    };

    projection = buildProjection();
    draw();

    if (t < 1) {
      animFrame = requestAnimationFrame(step);
    } else {
      camera = { ...target };
      animFrame = null;
      onComplete?.();
    }
  }

  animFrame = requestAnimationFrame(step);
}

// ── Public API ────────────────────────────────────────────────────────────

export function init(canvasEl: HTMLCanvasElement, catalogue: Star[]): void {
  canvas = canvasEl;
  ctx = canvas.getContext('2d')!;
  stars = catalogue;
  resize();
  projection = buildProjection();
  draw();
}

export function resize(): void {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  if (projection) {
    projection = buildProjection();
    draw();
  }
}

export function setConstellation(result: MatchResult | null): void {
  constellation = result;
}

export function getCamera(): CameraState { return { ...camera }; }

export function resetCamera(): void {
  camera = { ...LANDING_CAMERA };
  projection = buildProjection();
  draw();
}

export function animateToResult(patchRA: number, patchDec: number, onComplete?: () => void): void {
  animateTo({ ra: patchRA, dec: patchDec, fov: RESULT_FOV }, 2000, onComplete);
}

export function animateToLanding(): void {
  animateTo(LANDING_CAMERA, 1500);
}

export function getCanvas(): HTMLCanvasElement { return canvas; }
export function getContext(): CanvasRenderingContext2D { return ctx; }
