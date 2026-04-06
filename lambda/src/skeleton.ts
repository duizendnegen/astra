import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { TRIANGLE_FALLBACK } from './core.js';
import { retrieveSkeleton, getSharedIndex, type MatchProvenance } from './retrieval.js';
import type { Skeleton } from './core.js';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const API_KEY_PARAM = process.env.OPENROUTER_API_KEY_PARAM!;
const INDEX_PATH = process.env.INDEX_PATH; // optional override for S3-downloaded path

// Open the SQLite index once at module load (warm invocations reuse the connection)
const db = getSharedIndex(INDEX_PATH);

interface CacheItem {
  word: string;
  match?: MatchProvenance | null;
  skeletons: Skeleton[];
}

async function getApiKey(): Promise<string> {
  const res = await ssmClient.send(
    new GetParameterCommand({ Name: API_KEY_PARAM, WithDecryption: true }),
  );
  return res.Parameter?.Value ?? '';
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

  // Cache read — treat legacy entries (no match field) as misses
  const cached = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { word } }));
  const item = cached.Item as CacheItem | undefined;
  if (item?.skeletons) {
    return { statusCode: 200, headers, body: JSON.stringify({ skeletons: item.skeletons }) };
  }

  const apiKey = await getApiKey();
  const result = await retrieveSkeleton(word, db, apiKey);

  const isFallback = result.skeletons.length === 1 && result.skeletons[0] === TRIANGLE_FALLBACK;
  if (!isFallback) {
    await dynamo.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: { word, match: result.match ?? null, skeletons: result.skeletons },
      }),
    );
  }

  return { statusCode: 200, headers, body: JSON.stringify({ skeletons: result.skeletons }) };
}
