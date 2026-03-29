import { describe, it, expect } from 'vitest';
import { formatDec, formatRA } from '../coords';

describe('formatDec', () => {
  it('formats positive declination', () => {
    expect(formatDec(42.235)).toBe('+42° 14\' 6.0"');
  });

  it('formats negative declination', () => {
    expect(formatDec(-5.4)).toBe('−5° 24\' 0.0"');
  });

  it('formats zero', () => {
    expect(formatDec(0)).toBe('+0° 0\' 0.0"');
  });

  it('formats exactly 90°', () => {
    expect(formatDec(90)).toBe('+90° 0\' 0.0"');
  });
});

describe('formatRA', () => {
  it('formats right ascension in degrees to h m s', () => {
    // 83.8° = 5h 35m 12s
    const result = formatRA(83.8);
    expect(result).toMatch(/^5h 35m/);
  });

  it('formats zero RA', () => {
    expect(formatRA(0)).toBe('0h 0m 0s');
  });

  it('formats 360° as 24h (full circle)', () => {
    expect(formatRA(360)).toBe('24h 0m 0s');
  });
});
