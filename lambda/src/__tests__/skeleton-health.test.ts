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

function makeHealthEvent(): APIGatewayProxyEventV2 {
  return {
    requestContext: { http: { method: 'GET' } },
    rawPath: '/health',
  } as unknown as APIGatewayProxyEventV2;
}

describe('GET /health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with { status: "ok" }', async () => {
    const response = await handler(makeHealthEvent());
    expect(response.statusCode).toBe(200);
    const body = JSON.parse((response as { body: string }).body) as { status: string };
    expect(body.status).toBe('ok');
  });

  it('does not call DynamoDB', async () => {
    await handler(makeHealthEvent());
    expect(mockDynamoSend).not.toHaveBeenCalled();
  });
});
