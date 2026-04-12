/**
 * l4-image-traced.test.ts
 *
 * Unit tests for the L4 image-gen + Potrace pipeline:
 *   - l4GenerateFromImage: mock OpenRouter image response
 *   - traceWithPotrace: mock Potrace trace callback
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
const FAKE_PNG_B64 = Buffer.from('fakepng').toString('base64');
const FAKE_DATA_URI = `data:image/png;base64,${FAKE_PNG_B64}`;

// ── l4GenerateFromImage ───────────────────────────────────────────────────────

describe('l4GenerateFromImage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a Buffer when OpenRouter returns a base64 image in message.images[]', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: 'Here is the image.',
            images: [{ type: 'image_url', image_url: { url: FAKE_DATA_URI } }],
          },
        }],
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { l4GenerateFromImage } = await import('../retrieval.js');
    const result = await l4GenerateFromImage('eagle', 'test-key');

    expect(result).toBeInstanceOf(Buffer);
    expect(result).not.toBeNull();
    expect(result!.toString()).toBe('fakepng');
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/chat/completions');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('google/gemini-2.5-flash-image');
  });

  it('returns null when the HTTP response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'rate limited',
    }));

    const { l4GenerateFromImage } = await import('../retrieval.js');
    const result = await l4GenerateFromImage('eagle', 'test-key');
    expect(result).toBeNull();
  });

  it('returns null when no images are present in the response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'no image here', images: [] } }],
      }),
    }));

    const { l4GenerateFromImage } = await import('../retrieval.js');
    const result = await l4GenerateFromImage('eagle', 'test-key');
    expect(result).toBeNull();
  });

  it('returns null on AbortError without logging a warning', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(err));

    const { l4GenerateFromImage } = await import('../retrieval.js');
    const ac = new AbortController();
    ac.abort();
    const result = await l4GenerateFromImage('eagle', 'test-key', ac.signal);
    expect(result).toBeNull();
  });
});

// ── traceWithPotrace ──────────────────────────────────────────────────────────

describe('traceWithPotrace', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns SVG string on success', async () => {
    vi.doMock('potrace', () => ({
      trace: (_buf: Buffer, cb: (err: Error | null, svg: string) => void) => {
        cb(null, FAKE_SVG);
      },
    }));

    const { traceWithPotrace } = await import('../retrieval.js');
    const result = await traceWithPotrace(Buffer.from('fakepng'));
    expect(result).toBe(FAKE_SVG);
  });

  it('returns null when Potrace errors', async () => {
    vi.doMock('potrace', () => ({
      trace: (_buf: Buffer, cb: (err: Error | null, svg: string) => void) => {
        cb(new Error('trace failed'), '');
      },
    }));

    const { traceWithPotrace } = await import('../retrieval.js');
    const result = await traceWithPotrace(Buffer.from('badpng'));
    expect(result).toBeNull();
  });
});
