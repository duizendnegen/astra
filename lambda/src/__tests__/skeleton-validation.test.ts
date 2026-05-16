import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

const { mockDynamoSend } = vi.hoisted(() => ({ mockDynamoSend: vi.fn() }));

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

vi.mock('../matcher.js', () => ({ match: vi.fn() }));
vi.mock('../catalogue.js', () => ({ getCatalogue: vi.fn().mockReturnValue([]) }));
vi.mock('../retrieval.js', () => ({
  retrieveSkeleton: vi.fn().mockResolvedValue({ match: null, skeletons: [] }),
}));

process.env.TABLE_NAME = 'test-table';
process.env.OPENROUTER_API_KEY = 'test-key';

import { handler } from '../skeleton.js';

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return { body: JSON.stringify(body) } as unknown as APIGatewayProxyEventV2;
}

describe('word maxLength validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDynamoSend.mockResolvedValue({ Item: undefined });
  });

  it('returns 400 for a word of 101 characters', async () => {
    const longWord = 'a'.repeat(101);
    const response = await handler(makeEvent({ word: longWord }));
    expect(response.statusCode).toBe(400);
    const body = JSON.parse((response as { body: string }).body) as { error: string };
    expect(body.error).toBe('word must be 100 characters or fewer');
  });

  it('proceeds for a word of exactly 100 characters', async () => {
    const word100 = 'a'.repeat(100);
    const response = await handler(makeEvent({ word: word100 }));
    expect(response.statusCode).not.toBe(400);
  });
});
