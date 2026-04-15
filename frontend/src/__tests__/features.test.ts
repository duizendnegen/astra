import { describe, it, expect, beforeEach } from 'vitest';
import { loadFeatures, saveFeatures } from '../features';

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

beforeEach(() => localStorageMock.clear());

describe('loadFeatures', () => {
  it('returns defaults when localStorage key is absent', () => {
    const f = loadFeatures();
    expect(f.showConstellationImage).toBe(false);
    expect(f.showAssociation).toBe(false);
    expect(f.showStarLabels).toBe(false);
    expect(f.showLines).toBe(true);
    expect(f.showStars).toBe(false);
  });

  it('returns saved features when key is present', () => {
    saveFeatures({ showConstellationImage: true, showAssociation: true, showStarLabels: false, showLines: true, showStars: false, renderMode: 'stars' });
    const f = loadFeatures();
    expect(f.showConstellationImage).toBe(true);
    expect(f.showAssociation).toBe(true);
  });

  it('returns defaults when localStorage contains invalid JSON', () => {
    localStorageMock.setItem('astra-features', 'not-json');
    const f = loadFeatures();
    expect(f.showConstellationImage).toBe(false);
  });
});

describe('saveFeatures', () => {
  it('persists features so loadFeatures returns them', () => {
    saveFeatures({ showConstellationImage: true, showAssociation: false, showStarLabels: false, showLines: false, showStars: true, renderMode: 'stars' });
    const f = loadFeatures();
    expect(f.showConstellationImage).toBe(true);
    expect(f.showStars).toBe(true);
    expect(f.showLines).toBe(false);
  });
});
