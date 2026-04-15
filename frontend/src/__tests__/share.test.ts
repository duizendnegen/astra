import { describe, it, expect, vi, afterEach } from 'vitest';
import { encode, decode, buildShareUrl } from '../share';
import type { ConstellationState, Star } from '../types';

const mockStars: Star[] = [
  { id: 100, ra: 83.8,  dec: -5.4, mag: 1.7 },
  { id: 101, ra: 84.0,  dec: -5.2, mag: 2.1 },
  { id: 102, ra: 83.5,  dec: -5.6, mag: 2.5 },
  { id: 103, ra: 84.2,  dec: -5.0, mag: 3.0 },
  { id: 104, ra: 83.3,  dec: -5.8, mag: 3.4 },
  { id: 105, ra: 84.4,  dec: -4.8, mag: 3.8 },
];

const mockState: ConstellationState = {
  word: 'wolf',
  match: {
    stars: mockStars,
    constellationStars: mockStars.slice(0, 4),
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    patchRA: 83.8,
    patchDec: -5.4,
  },
};

describe('share link round-trip', () => {
  it('encode then decode returns identical state', () => {
    const encoded = encode(mockState);
    const decoded = decode(encoded, mockStars);

    expect(decoded).not.toBeNull();
    expect(decoded!.word).toBe(mockState.word);
    expect(decoded!.match.patchRA).toBeCloseTo(mockState.match.patchRA, 3);
    expect(decoded!.match.patchDec).toBeCloseTo(mockState.match.patchDec, 3);
    expect(decoded!.match.edges).toEqual(mockState.match.edges);
    expect(decoded!.match.stars.map(s => s.id)).toEqual(mockStars.map(s => s.id));
  });

  it('round-trip preserves constellationStars', () => {
    const encoded = encode(mockState);
    const decoded = decode(encoded, mockStars);

    expect(decoded).not.toBeNull();
    const origIds = mockState.match.constellationStars.map(s => s.id);
    const decodedIds = decoded!.match.constellationStars.map(s => s.id);
    expect(decodedIds).toEqual(origIds);

    // Verify full star data is reconstructed from catalogue
    for (const star of decoded!.match.constellationStars) {
      const original = mockStars.find(s => s.id === star.id)!;
      expect(star.ra).toBe(original.ra);
      expect(star.dec).toBe(original.dec);
      expect(star.mag).toBe(original.mag);
    }
  });

  it('encode produces a valid base64 string', () => {
    const encoded = encode(mockState);
    expect(() => atob(encoded)).not.toThrow();
  });

  it('decode returns null for invalid input', () => {
    expect(decode('not-valid-base64!!!', mockStars)).toBeNull();
  });

  it('decode returns null if star IDs are not in catalogue', () => {
    const encoded = encode(mockState);
    // Pass an empty catalogue — none of the star IDs will resolve
    expect(decode(encoded, [])).toBeNull();
  });

  it('decode returns null when cids field is absent', () => {
    // Manually build a payload without cids (old format)
    const legacyPayload = btoa(JSON.stringify({
      word: 'wolf',
      ids: [100, 101],
      edges: [[0, 1]],
      ra: 83.8,
      dec: -5.4,
    }));
    expect(decode(legacyPayload, mockStars)).toBeNull();
  });
});

describe('buildShareUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('produces a URL with only the ?c= param', () => {
    vi.stubGlobal('location', {
      href: 'http://localhost/',
      search: '',
    });

    const url = buildShareUrl(mockState);
    const params = new URL(url).searchParams;

    expect(params.has('c')).toBe(true);
    expect([...params.keys()]).toEqual(['c']);
  });
});
