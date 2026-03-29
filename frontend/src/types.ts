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
  stars: Star[];       // matched stars, indexed by skeleton point order
  edges: [number, number][];
  patchRA: number;     // degrees
  patchDec: number;    // degrees
  skeletonPoints?: { ra: number; dec: number }[]; // original skeleton contour in sky coords
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
