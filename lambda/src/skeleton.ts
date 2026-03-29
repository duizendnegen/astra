import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { generateSkeleton, TRIANGLE_FALLBACK } from './core';

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const API_KEY_PARAM = process.env.OPENROUTER_API_KEY_PARAM!;

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

  const cached = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { word } }));
  if (cached.Item?.skeleton) {
    return { statusCode: 200, headers, body: JSON.stringify(cached.Item.skeleton) };
  }

  const apiKey = await getApiKey();
  const skeleton = await generateSkeleton(word, apiKey);

  if (skeleton !== TRIANGLE_FALLBACK) {
    await dynamo.send(
      new PutCommand({ TableName: TABLE_NAME, Item: { word, skeleton } }),
    );
  }

  return { statusCode: 200, headers, body: JSON.stringify(skeleton) };
}
