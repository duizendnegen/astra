export interface Star {
  id: number;
  ra: number;   // degrees
  dec: number;  // degrees
  mag: number;
}

export interface Skeleton {
  points: [number, number][];
  edges: [number, number][];
}

export interface MatchResult {
  stars: Star[];                // on-pattern stars (within edge threshold), ordered by match quality — not skeleton-indexed
  constellationStars: Star[];  // vertex-indexed constellation stars (one per skeleton vertex for skeleton-shape; degree-sorted for other models)
  edges: [number, number][];
  patchRA: number;              // degrees
  patchDec: number;             // degrees
  procrustesAngle?: number;     // Procrustes rotation angle in radians
  skeletonPoints?: { ra: number; dec: number }[]; // original skeleton contour in sky coords
  variantIndex?: number;        // which skeleton variant produced this result
}

export interface TrailEntry {
  candidate: string;
  hitId: string | null;
  sim: number | null;
}

export interface MatchProvenance {
  source: 'phosphor' | 'phylopic' | 'custom' | 'generated';
  id: string;
  similarity: number;
  layer: 1 | 3 | 4;
  svgPath: string;
  trail?: TrailEntry[];
}

export interface ConstellationState {
  word: string;
  match: MatchResult;
  provenance?: MatchProvenance;
  skeletonCanonical?: [number, number][]; // raw SVG-space skeleton points from backend
}

// Camera state
export interface CameraState {
  ra: number;   // centre RA in degrees
  dec: number;  // centre Dec in degrees
  fov: number;  // field of view in degrees (short dimension)
}

export const LANDING_CAMERA: CameraState = {
  ra: 83.8,
  dec: -5.4,
  fov: 60,
};

export const RESULT_FOV = 25;
export const RESULT_FOV_MOBILE = 15; // tighter zoom on portrait/mobile

// ── Overlay types ─────────────────────────────────────────────────────────

export interface ConstellationLineBbox {
  minRA: number;
  maxRA: number;
  minDec: number;
  maxDec: number;
  wraps: boolean;
}

export interface ConstellationLines {
  name: string;
  bbox: ConstellationLineBbox;
  lines: [number, number][]; // flat pairs: [ra,dec],[ra,dec],... each consecutive pair is one segment
}

export interface NamedStar {
  name: string;
  ra: number;   // degrees
  dec: number;  // degrees
  mag: number;
}
