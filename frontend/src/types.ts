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
  constellationStars: Star[];  // up to 8 vertex-anchored stars forming the connected constellation
  edges: [number, number][];
  patchRA: number;              // degrees
  patchDec: number;             // degrees
  skeletonPoints?: { ra: number; dec: number }[]; // original skeleton contour in sky coords
  variantIndex?: number;        // which skeleton variant produced this result
}

export interface ConstellationState {
  word: string;
  match: MatchResult;
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
