import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { retrieveSkeleton, type MatchProvenance } from './retrieval.js';
import { match } from './matcher.js';
import { getCatalogue } from './catalogue.js';
import type { Skeleton } from './core.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({ region: process.env.AWS_REGION ?? 'eu-central-1' });

const TABLE_NAME = process.env.TABLE_NAME!;

let _openRouterKey: string | undefined;
async function getOpenRouterKey(): Promise<string> {
  if (_openRouterKey) return _openRouterKey;
  if (process.env.OPENROUTER_API_KEY) return (_openRouterKey = process.env.OPENROUTER_API_KEY);
  const res = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.OPENROUTER_API_KEY_PARAM!, WithDecryption: true }),
  );
  return (_openRouterKey = res.Parameter?.Value ?? '');
}

interface CacheItem {
  word: string;
  match?: MatchProvenance | null;
  skeletons: Skeleton[];
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': 'https://astra.plusx.black',
  };

  let word: string;
  try {
    const body = JSON.parse(event.body ?? '{}') as { word?: unknown };
    if (typeof body.word !== 'string' || !body.word.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'word is required' }) };
    }
    word = body.word.trim().toLowerCase();
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid JSON body' }) };
  }

  const catalogue = getCatalogue();

  // Cache read
  const cached = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { word } }));
  const item = cached.Item as CacheItem | undefined;
  if (item?.skeletons?.length) {
    const matchResult = match(catalogue, item.skeletons);
    if (matchResult) {
      const skeleton = item.skeletons[matchResult.variantIndex ?? 0];
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ constellation: matchResult, skeleton, match: item.match }),
      };
    }
  }

  const apiKey = await getOpenRouterKey();
  const result = await retrieveSkeleton(word, apiKey);

  if (result.match === null) {
    return { statusCode: 422, headers, body: JSON.stringify({ error: 'No constellation found.' }) };
  }

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { word, match: result.match, skeletons: result.skeletons },
    }),
  );

  const matchResult = match(catalogue, result.skeletons);
  if (!matchResult) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'matching failed' }) };
  }

  const skeleton = result.skeletons[matchResult.variantIndex ?? 0];

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ constellation: matchResult, skeleton, match: result.match }),
  };
}
