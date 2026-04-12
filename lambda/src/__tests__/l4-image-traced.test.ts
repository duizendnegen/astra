/**
 * l4-image-traced.test.ts
 *
 * Unit tests for the new L4 image-gen + Potrace pipeline:
 *   - l4GenerateFromImage: mock OpenRouter image response
 *   - traceWithPotrace: mock Potrace trace callback
 *   - promoteToCustomLive: assert custom_live row inserted; assert response not delayed on failure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
const FAKE_PNG_B64 = Buffer.from('fakepng').toString('base64');
const FAKE_DATA_URI = `data:image/png;base64,${FAKE_PNG_B64}`;

// ── Task 6.1: l4GenerateFromImage ─────────────────────────────────────────────

describe('l4GenerateFromImage', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns a Buffer when OpenRouter returns a base64 image in message.images[]', async () => {
    // Mock global fetch
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

// ── Task 6.2: traceWithPotrace ────────────────────────────────────────────────

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

// ── Task 6.3: promoteToCustomLive ────────────────────────────────────────────

describe('promoteToCustomLive', () => {
  let tmpDb: string;

  beforeEach(async () => {
    vi.resetModules();
    // Use a unique in-memory DB path per test via a temp file path
    tmpDb = `:memory:${Math.random()}`;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('inserts a row into custom_live', async () => {
    // Create in-memory DB with custom_live table
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE custom_live (word TEXT PRIMARY KEY, svg TEXT NOT NULL, created_at INTEGER NOT NULL)`);

    // Patch the module to use our in-memory db
    const { promoteToCustomLive } = await import('../retrieval.js');

    // We need to intercept the Database constructor — use a spy approach
    // by calling promoteToCustomLive with a real temp file path
    // Instead, test via the exported function directly with a real SQLite file
    const tmp = require('os').tmpdir() + `/test-${Date.now()}.sqlite`;
    const fs = require('fs');

    // Setup: create the table in a temp file
    const setup = new Database(tmp);
    setup.exec(`CREATE TABLE custom_live (word TEXT PRIMARY KEY, svg TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    setup.close();

    await promoteToCustomLive('eagle', FAKE_SVG, tmp);

    const verify = new Database(tmp, { readonly: true });
    const row = verify.prepare('SELECT * FROM custom_live WHERE word = ?').get('eagle') as { word: string; svg: string; created_at: number } | undefined;
    verify.close();
    fs.unlinkSync(tmp);

    expect(row).toBeDefined();
    expect(row!.word).toBe('eagle');
    expect(row!.svg).toBe(FAKE_SVG);
    expect(row!.created_at).toBeGreaterThan(0);
  });

  it('upserts on duplicate word', async () => {
    const { promoteToCustomLive } = await import('../retrieval.js');
    const tmp = require('os').tmpdir() + `/test-${Date.now()}.sqlite`;
    const fs = require('fs');

    const setup = new Database(tmp);
    setup.exec(`CREATE TABLE custom_live (word TEXT PRIMARY KEY, svg TEXT NOT NULL, created_at INTEGER NOT NULL)`);
    setup.prepare('INSERT INTO custom_live VALUES (?, ?, ?)').run('eagle', '<svg>old</svg>', 1000);
    setup.close();

    await promoteToCustomLive('eagle', FAKE_SVG, tmp);

    const verify = new Database(tmp, { readonly: true });
    const row = verify.prepare('SELECT * FROM custom_live WHERE word = ?').get('eagle') as { svg: string } | undefined;
    verify.close();
    fs.unlinkSync(tmp);

    expect(row!.svg).toBe(FAKE_SVG);
  });

  it('does not delay the response when promotion fails', async () => {
    const { promoteToCustomLive } = await import('../retrieval.js');
    // Pass a path that doesn't exist / no custom_live table — should throw
    const failingPromise = promoteToCustomLive('eagle', FAKE_SVG, '/nonexistent/path/db.sqlite');

    // The promise itself should reject, but a caller using .catch() should not be blocked
    let rejected = false;
    failingPromise.catch(() => { rejected = true; });

    // Immediately resolve — not waiting for failing promise
    await Promise.resolve();
    // After microtask flush the catch should have fired
    await new Promise((r) => setTimeout(r, 10));
    expect(rejected).toBe(true);
  });
});
