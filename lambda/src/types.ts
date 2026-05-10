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
  shapeScore: number;           // edge-ratio score (always computed)
  vertexFitScore: number;       // vertex-fit score (always computed)
  procrustesScore?: number;     // Procrustes residual score (only when scorer === 'procrustes')
  procrustesAngle?: number;     // Procrustes rotation angle in radians (atan2 of R matrix)
  phase1Candidates?: number;
  phase2Candidates?: number;
  phase3Candidates?: number;
  skeletonPoints?: { ra: number; dec: number }[];
  variantIndex?: number;
  // Score-gap and diversity metadata for regression analysis
  selectedScore?: number;   // composite score of the chosen match
  topScore?: number;        // best composite score in the full Phase-3 pool
  acceptableCount?: number; // candidates within 10% of topScore (the "good-enough" band)
  distantCount?: number;    // acceptable candidates ≥30° from the top result (different sky regions)
}

export interface TrailEntry {
  candidate: string;
  hitId: string | null;
  sim: number | null;
}
