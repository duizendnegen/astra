import { describe, it, expect } from 'vitest';
import { computeConstellationAlpha } from '../renderer';

const RESULT_FADE_START = 0.60;

describe('computeConstellationAlpha', () => {
  describe('forward transition (fadeStart = RESULT_FADE_START)', () => {
    it('is 0 at animation start (easedProgress = 0)', () => {
      expect(computeConstellationAlpha(0, RESULT_FADE_START)).toBe(0);
    });

    it('is 0 at 60% eased progress (fade has not started yet)', () => {
      expect(computeConstellationAlpha(0.60, RESULT_FADE_START)).toBe(0);
    });

    it('is 0 just before fadeStart', () => {
      expect(computeConstellationAlpha(0.59, RESULT_FADE_START)).toBe(0);
    });

    it('interpolates between 0 and 1 during the last 40%', () => {
      const alpha = computeConstellationAlpha(0.80, RESULT_FADE_START);
      expect(alpha).toBeGreaterThan(0);
      expect(alpha).toBeLessThan(1);
      expect(alpha).toBeCloseTo(0.5, 5);
    });

    it('is 1 at animation end (easedProgress = 1)', () => {
      expect(computeConstellationAlpha(1, RESULT_FADE_START)).toBe(1);
    });
  });

  describe('return transition / other callers (fadeStart = 0)', () => {
    it('is 1 throughout when fadeStart is 0 (no delay)', () => {
      expect(computeConstellationAlpha(0, 0)).toBe(1);
      expect(computeConstellationAlpha(0.5, 0)).toBe(1);
      expect(computeConstellationAlpha(1, 0)).toBe(1);
    });
  });
});
