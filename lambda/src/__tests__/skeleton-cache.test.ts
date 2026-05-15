/**
 * skeleton-cache.test.ts
 *
 * Tests for the MatchResult caching behaviour in the skeleton handler.
 * 8.2: cache hit with matchResult → return directly without calling match()
 * 8.3: cache hit with skeletons but no matchResult → call match() and write back
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { Skeleton, MatchResult } from '../types.js';

// ── Shared mock state (hoisted so vi.mock factories can reference it) ──────────

const { mockDynamoSend } = vi.hoisted(() => ({ mockDynamoSend: vi.fn() }));

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('aws-xray-sdk', () => ({
  default: {
    captureAWSv3Client: (client: unknown) => client,
    resolveSegment: () => undefined,
  },
}));

vi.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: { from: vi.fn().mockReturnValue({ send: mockDynamoSend }) },
  GetCommand: vi.fn((input: unknown) => input),
  PutCommand: vi.fn((input: unknown) => input),
}));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  GetParameterCommand: vi.fn(),
}));

const mockMatch = vi.hoisted(() => vi.fn());
vi.mock('../matcher.js', () => ({ match: mockMatch }));
vi.mock('../catalogue.js', () => ({ getCatalogue: vi.fn().mockReturnValue([]) }));
vi.mock('../retrieval.js', () => ({
  retrieveSkeleton: vi.fn().mockResolvedValue({ match: null, skeletons: [] }),
}));

// ── Environment ───────────────────────────────────────────────────────────────

process.env.TABLE_NAME = 'test-table';
process.env.OPENROUTER_API_KEY = 'test-key';

// ── Import handler (after mocks are in place) ─────────────────────────────────

import { handler } from '../skeleton.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockSkeleton: Skeleton = {
  points: [[0, 0], [1, 0], [0.5, 1]],
  edges: [[0, 1], [1, 2]],
};

const mockMatchResult: MatchResult = {
  stars: [],
  constellationStars: [],
  edges: [[0, 1], [1, 2]],
  patchRA: 100,
  patchDec: 10,
  shapeScore: 0.9,
  vertexFitScore: 0.85,
  variantIndex: 0,
};

function makeEvent(word: string): APIGatewayProxyEventV2 {
  return { body: JSON.stringify({ word }) } as unknown as APIGatewayProxyEventV2;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MatchResult cache hit (8.2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stored matchResult directly without calling match()', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { word: 'star', skeletons: [mockSkeleton], matchResult: mockMatchResult, match: null },
    });

    const response = await handler(makeEvent('star'));

    expect(mockMatch).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(200);
    const body = JSON.parse((response as { body: string }).body) as {
      constellation: MatchResult;
    };
    expect(body.constellation.patchRA).toBe(100);
    expect(body.constellation.shapeScore).toBe(0.9);
  });

  it('issues only one DynamoDB call (GetCommand, no PutCommand)', async () => {
    mockDynamoSend.mockResolvedValueOnce({
      Item: { word: 'moon', skeletons: [mockSkeleton], matchResult: mockMatchResult, match: null },
    });

    await handler(makeEvent('moon'));

    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });
});

describe('Backward-compat cache hit without matchResult (8.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls match() and writes matchResult back to DynamoDB', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { word: 'sun', skeletons: [mockSkeleton], match: null } })
      .mockResolvedValueOnce({}); // PutCommand write-back

    mockMatch.mockReturnValueOnce(mockMatchResult);

    const response = await handler(makeEvent('sun'));

    expect(mockMatch).toHaveBeenCalledOnce();
    // GetCommand + PutCommand
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(200);
  });

  it('includes matchResult in the PutCommand payload', async () => {
    mockDynamoSend
      .mockResolvedValueOnce({ Item: { word: 'comet', skeletons: [mockSkeleton], match: null } })
      .mockResolvedValueOnce({});

    mockMatch.mockReturnValueOnce(mockMatchResult);

    await handler(makeEvent('comet'));

    const putCall = mockDynamoSend.mock.calls[1][0] as { Item: { matchResult: MatchResult } };
    expect(putCall.Item.matchResult.patchRA).toBe(100);
  });
});
