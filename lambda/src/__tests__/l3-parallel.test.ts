/**
 * l3-parallel.test.ts
 *
 * Tests for the parallel L3 Pinecone query path.
 * 8.1: when candidates 2 and 4 have Pinecone hits, the skeleton for candidate 2
 *      is returned (first-in-order wins) and the trail is correct.
 */

import { vi, describe, it, expect, beforeEach, afterEach, type MockInstance } from 'vitest';

// ── Shared mock state ─────────────────────────────────────────────────────────

const mockPineconeQuery = vi.hoisted(() => vi.fn());
const mockS3Send = vi.hoisted(() => vi.fn());

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('@pinecone-database/pinecone', () => ({
  Pinecone: vi.fn().mockImplementation(function() {
    return { index: vi.fn().mockReturnValue({ query: mockPineconeQuery }) };
  }),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn().mockImplementation(function() { return { send: mockS3Send }; }),
  GetObjectCommand: vi.fn(function(input: unknown) { return input; }),
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(function() { return { send: vi.fn() }; }),
  GetParameterCommand: vi.fn(),
}));

vi.mock('potrace', () => ({
  trace: vi.fn(function(_buf: unknown, cb: (err: null, svg: string) => void) { cb(null, ''); }),
}));

vi.mock('../svg-to-skeleton.js', () => ({
  svgToSkeleton: vi.fn().mockReturnValue({
    points: [[0, 0], [1, 0], [0.5, 1]] as [number, number][],
    edges: [[0, 1], [1, 2]] as [number, number][],
  }),
  rdpSimplify: vi.fn(),
  visvalingamWhyatt: vi.fn(),
}));

const mockSkeleton = { points: [[0, 0], [1, 0], [0.5, 1]] as [number, number][], edges: [[0, 1], [1, 2]] as [number, number][] };

// ── Environment (must be in vi.hoisted so it's set before module init) ────────

vi.hoisted(() => {
  process.env.PINECONE_API_KEY = 'test-key';
  process.env.PINECONE_INDEX_NAME = 'test-index';
  process.env.ICONS_BUCKET_NAME = 'test-bucket';
});

// ── Import module under test ──────────────────────────────────────────────────

import { retrieveSkeleton } from '../retrieval.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a mock fetch that drives the L3 pipeline:
 *  - /embeddings with 1 input → L1 embed (returns a vector that Pinecone ignores)
 *  - /embeddings with 5 inputs → L3 batch embed (returns vectors distinguishable by index)
 *  - /chat/completions (haiku model) → L3 candidates
 *  - /chat/completions (gemini model) → L4 image gen (returns no image to avoid interference)
 */
function buildFetchMock() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as { model?: string; input?: unknown[] }) : {};

    if ((url as string).includes('/embeddings')) {
      const inputs = body.input ?? [];
      if (inputs.length === 1) {
        // L1 word embedding
        return {
          ok: true,
          json: async () => ({ data: [{ index: 0, embedding: [0.9, 0.1, 0, 0, 0] }] }),
        } as Response;
      }
      // L3 batch embedding — assign distinct vectors per candidate slot
      return {
        ok: true,
        json: async () => ({
          data: [
            { index: 0, embedding: [1, 0, 0, 0, 0] }, // c0
            { index: 1, embedding: [0, 1, 0, 0, 0] }, // c1 → Pinecone hit (candidate 2, 1-indexed)
            { index: 2, embedding: [0, 0, 1, 0, 0] }, // c2
            { index: 3, embedding: [0, 0, 0, 1, 0] }, // c3 → Pinecone hit (candidate 4, 1-indexed)
            { index: 4, embedding: [0, 0, 0, 0, 1] }, // c4
          ],
        }),
      } as Response;
    }

    if ((url as string).includes('/chat/completions')) {
      if (body.model?.includes('gemini') || body.model?.includes('image')) {
        // L4 image gen — return no image so L4 produces null
        return {
          ok: true,
          json: async () => ({ choices: [{ message: { images: [] } }] }),
        } as Response;
      }
      // L3 candidates (haiku)
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '["lion","tiger","paw","whisker","feline"]' } }],
        }),
      } as Response;
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Parallel L3 path (8.1)', () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(buildFetchMock() as typeof fetch);

    // L1 Pinecone query → no hit (forces L3 path)
    // L3 Pinecone queries → hits for candidates at index 1 ('tiger') and index 3 ('whisker')
    mockPineconeQuery.mockImplementation(async ({ vector }: { vector: number[] }) => {
      // L1 vector: [0.9, 0.1, ...] → no hit
      if (vector[0] > 0.5) return { matches: [] };
      // c1 vector: [0, 1, 0, 0, 0] → hit
      if (vector[1] === 1) {
        return {
          matches: [{ id: 'phosphor:tiger-icon', score: 0.87, metadata: { source: 'phosphor' } }],
        };
      }
      // c3 vector: [0, 0, 0, 1, 0] → hit
      if (vector[3] === 1) {
        return {
          matches: [{ id: 'phosphor:whisker-icon', score: 0.83, metadata: { source: 'phosphor' } }],
        };
      }
      return { matches: [] };
    });

    // S3 fetches for both hits
    mockS3Send.mockImplementation(async (cmd: { Key: string }) => {
      if (cmd.Key === 'phosphor/tiger-icon' || cmd.Key === 'phosphor/whisker-icon') {
        return { Body: { transformToString: async () => '<svg/>' } };
      }
      return { Body: null };
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('returns the skeleton for the first-hit candidate (candidate 2) not candidate 4', async () => {
    const result = await retrieveSkeleton('lion', 'test-api-key');

    expect(result.match).not.toBeNull();
    expect(result.match?.id).toBe('phosphor:tiger-icon');
    expect(result.match?.layer).toBe(3);
    expect(result.skeletons).toHaveLength(1);
  });

  it('records hitId and sim only for the winning candidate in the trail', async () => {
    const result = await retrieveSkeleton('lion', 'test-api-key');
    const trail = result.match?.trail;

    expect(trail).toBeDefined();
    // 'tiger' (index 1 in candidates) is the winner
    const tigerEntry = trail?.find((e) => e.candidate === 'tiger');
    expect(tigerEntry?.hitId).toBe('phosphor:tiger-icon');
    expect(tigerEntry?.sim).toBeCloseTo(0.87);

    // 'whisker' (index 3) had a hit but is not the winner
    const whiskerEntry = trail?.find((e) => e.candidate === 'whisker');
    expect(whiskerEntry?.hitId).toBeNull();
    expect(whiskerEntry?.sim).toBeNull();

    // Non-hit candidates also have null
    const lionEntry = trail?.find((e) => e.candidate === 'lion');
    expect(lionEntry?.hitId).toBeNull();
  });
});
