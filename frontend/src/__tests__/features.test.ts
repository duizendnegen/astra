import { describe, it, expect } from 'vitest';
import { getFeatures } from '../features';

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

describe('getFeatures', () => {
  it('both flags off when params are empty', () => {
    const f = getFeatures(params(''));
    expect(f.showLines).toBe(false);
    expect(f.showStars).toBe(false);
  });

  it('showLines on, showStars off', () => {
    const f = getFeatures(params('show_lines=1'));
    expect(f.showLines).toBe(true);
    expect(f.showStars).toBe(false);
  });

  it('showLines off, showStars on', () => {
    const f = getFeatures(params('show_stars=1'));
    expect(f.showLines).toBe(false);
    expect(f.showStars).toBe(true);
  });

  it('both flags on', () => {
    const f = getFeatures(params('show_lines=1&show_stars=1'));
    expect(f.showLines).toBe(true);
    expect(f.showStars).toBe(true);
  });

  it('flag value "0" is treated as off', () => {
    const f = getFeatures(params('show_lines=0&show_stars=0'));
    expect(f.showLines).toBe(false);
    expect(f.showStars).toBe(false);
  });
});
