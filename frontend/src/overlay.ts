import type * as d3 from 'd3';

export interface SvgTransformResult {
  transform: string;
  transformOrigin: string;
}

// ── Procrustes helpers ────────────────────────────────────────────────────

/**
 * Center a point set by subtracting its centroid (mean).
 * The centroid is rotation-invariant: centroid(R·B) = R·centroid(B), so centering
 * both canonical and physVerts by mean gives consistent Procrustes inputs regardless
 * of the search rotation embedded in physVerts.
 */
function centerMean(pts: [number, number][]): [number, number][] {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(p => [p[0] - cx, p[1] - cy]);
}

/**
 * 2D Procrustes rotation angle: finds the CCW rotation R that minimises ||A - B*R||.
 * Returns atan2(h01 - h10, h00 + h11) from H = B^T A.
 */
function procrustes2D(B: [number, number][], A: [number, number][]): number {
  const n = Math.min(B.length, A.length);
  if (n < 2) return 0;
  let h00 = 0, h01 = 0, h10 = 0, h11 = 0;
  for (let i = 0; i < n; i++) {
    h00 += B[i][0] * A[i][0]; h01 += B[i][0] * A[i][1];
    h10 += B[i][1] * A[i][0]; h11 += B[i][1] * A[i][1];
  }
  return Math.atan2(h01 - h10, h00 + h11);
}

// ── Main export ───────────────────────────────────────────────────────────

/**
 * Compute a CSS transform + transform-origin to align a Phosphor SVG with a
 * constellation rendered on the canvas via D3 stereographic projection.
 *
 * Pivot: the centroid of canonicalPoints (SVG viewBox space, same as getBBox units
 * for 1:1-rendered SVGs) is the correct Procrustes pivot. The bbox centre is used
 * only as a fallback when canonicalPoints are absent.
 *
 * Rotation: sky-space CCW angle θ maps to CSS rotate(−θ) because the D3 projection
 * flips Dec (y-up) to screen-y (y-down), inverting the sense of rotation.
 *   totalAngle = R + procrustesAngle  (both in sky-space CCW radians)
 *   R = Procrustes(centerMean(yFlip(canonical)), centerMean(physVerts))
 *
 * Requires svgEl to be rendered (not display:none) so getBBox() works.
 */
export function computeSvgTransform(
  skeletonPoints: { ra: number; dec: number }[],
  canonicalPoints: [number, number][],
  procrustesAngle: number,
  projection: d3.GeoProjection,
  svgEl: SVGSVGElement,
): SvgTransformResult | null {
  if (skeletonPoints.length === 0) return null;

  // 1. Project physVerts to screen pixels
  const projected: [number, number][] = [];
  for (const { ra, dec } of skeletonPoints) {
    const pt = projection([ra, dec]);
    if (pt) projected.push([pt[0], pt[1]]);
  }
  if (projected.length === 0) return null;

  // 2. Centroid of projected points = target screen position for SVG pivot
  const cx = projected.reduce((s, p) => s + p[0], 0) / projected.length;
  const cy = projected.reduce((s, p) => s + p[1], 0) / projected.length;

  // 3. Bounding-box diagonal of projected points (canvas extent for scaling)
  const minX = Math.min(...projected.map(p => p[0]));
  const maxX = Math.max(...projected.map(p => p[0]));
  const minY = Math.min(...projected.map(p => p[1]));
  const maxY = Math.max(...projected.map(p => p[1]));
  const canvasExtent = Math.sqrt((maxX - minX) ** 2 + (maxY - minY) ** 2);
  if (canvasExtent < 1) return null;

  // 4. SVG extent for scaling (from bounding box)
  let svgExtent: number;
  try {
    const bbox = svgEl.getBBox();
    if (bbox.width <= 0 || bbox.height <= 0) throw new Error('empty');
    svgExtent = Math.sqrt(bbox.width ** 2 + bbox.height ** 2);
  } catch {
    const vb = svgEl.viewBox?.baseVal;
    if (vb && vb.width > 0 && vb.height > 0) {
      svgExtent = Math.sqrt(vb.width ** 2 + vb.height ** 2);
    } else {
      const w = svgEl.width.baseVal.value, h = svgEl.height.baseVal.value;
      svgExtent = Math.sqrt(w ** 2 + h ** 2);
    }
  }
  if (svgExtent < 1) return null;

  // 5. Pivot point: skeleton centroid mapped back to SVG viewBox coordinates.
  //    canonicalPoints are in [0,1] space (normalised via viewBox by svg-to-skeleton.ts:
  //    normalised = (raw - vb.origin) / max(vb.w, vb.h)).
  //    Inverse: raw = norm * max(vb.w, vb.h) + vb.origin  → CSS px for 1:1-rendered SVGs.
  //    Falls back to bbox centre when canonicalPoints or viewBox are absent.
  let contentCenterX: number, contentCenterY: number;
  const vb = svgEl.viewBox?.baseVal;
  if (canonicalPoints.length >= 2 && vb && vb.width > 0 && vb.height > 0) {
    const normCcx = canonicalPoints.reduce((s, p) => s + p[0], 0) / canonicalPoints.length;
    const normCcy = canonicalPoints.reduce((s, p) => s + p[1], 0) / canonicalPoints.length;
    const vbScale = Math.max(vb.width, vb.height);
    contentCenterX = normCcx * vbScale + vb.x;
    contentCenterY = normCcy * vbScale + vb.y;
  } else {
    try {
      const bbox = svgEl.getBBox();
      contentCenterX = bbox.x + bbox.width / 2;
      contentCenterY = bbox.y + bbox.height / 2;
    } catch {
      if (vb && vb.width > 0 && vb.height > 0) {
        contentCenterX = vb.x + vb.width / 2;
        contentCenterY = vb.y + vb.height / 2;
      } else {
        const w = svgEl.width.baseVal.value, h = svgEl.height.baseVal.value;
        contentCenterX = w / 2;
        contentCenterY = h / 2;
      }
    }
  }

  // 6. Compute total sky-space CCW rotation, then negate for CSS (Dec-up → screen-y-down)
  let totalAngle = procrustesAngle;
  if (canonicalPoints.length >= 2 && skeletonPoints.length >= 2) {
    const canon_yflipped = canonicalPoints.map(([x, y]) => [x, -y] as [number, number]);
    const normCanon = centerMean(canon_yflipped);
    const physFlat: [number, number][] = skeletonPoints.map(p => [p.ra, p.dec]);
    const normPhys = centerMean(physFlat);
    const R = procrustes2D(normCanon, normPhys.slice(0, normCanon.length));
    totalAngle = R + procrustesAngle;
  }

  // 7. Build transform: rotate + scale around pivot, then translate to (cx, cy)
  const s = canvasExtent / svgExtent;
  const tx = cx - contentCenterX;
  const ty = cy - contentCenterY;

  return {
    transformOrigin: `${contentCenterX}px ${contentCenterY}px`,
    transform: `translate(${tx}px, ${ty}px) rotate(${-totalAngle}rad) scale(${s})`,
  };
}
