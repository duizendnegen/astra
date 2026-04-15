import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadStarNames } from '../catalogue';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('loadStarNames', () => {
  it('returns a Map with integer keys from string JSON keys', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ '32263': 'Sirius', '27919': 'Betelgeuse' }),
    }));

    const map = await loadStarNames();

    expect(map).toBeInstanceOf(Map);
    expect(map.get(32263)).toBe('Sirius');
    expect(map.get(27919)).toBe('Betelgeuse');
  });

  it('returns Bayer-formatted names as-is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ '122': 'θ Oct', '763': 'ε Phe' }),
    }));

    const map = await loadStarNames();

    expect(map.get(122)).toBe('θ Oct');
    expect(map.get(763)).toBe('ε Phe');
  });

  it('returns undefined for a HIP ID not in the dataset', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ '32263': 'Sirius' }),
    }));

    const map = await loadStarNames();

    expect(map.get(99999)).toBeUndefined();
  });

  it('fetches from /data/star-names.json', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal('fetch', mockFetch);

    await loadStarNames();

    expect(mockFetch).toHaveBeenCalledWith('/data/star-names.json');
  });
});
