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
  stars: Star[];                // on-pattern stars (within edge threshold), ordered by match quality
  constellationStars: Star[];  // vertex-indexed constellation stars
  edges: [number, number][];
  patchRA: number;              // degrees
  patchDec: number;             // degrees
  skeletonPoints?: { ra: number; dec: number }[];
  variantIndex?: number;
}
