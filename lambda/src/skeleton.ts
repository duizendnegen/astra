import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { trace } from '@opentelemetry/api';
import { retrieveSkeleton, type MatchProvenance } from './retrieval.js';
import { match } from './matcher.js';
import { getCatalogue } from './catalogue.js';
import type { Skeleton, MatchResult } from './types.js';
import { createLogger } from './logger.js';

const log = createLogger('skeleton');
const tracer = trace.getTracer('astra-lambda');

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
  matchResult?: MatchResult;
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

  const t0 = performance.now();
  const catalogue = getCatalogue();

  // Cache read
  const cached = await dynamo.send(new GetCommand({ TableName: TABLE_NAME, Key: { word } }));
  const item = cached.Item as CacheItem | undefined;
  if (item?.skeletons?.length) {
    if (item.matchResult) {
      // Cache hit with stored MatchResult — skip matcher entirely
      const skeleton = item.skeletons[item.matchResult.variantIndex ?? 0];
      log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit: true }, 'request complete');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ constellation: item.matchResult, skeleton, match: item.match }),
      };
    }

    // Backward-compat: cached item has skeletons but no matchResult — run matcher and write back
    const cachedMatchResult = tracer.startActiveSpan('matcher', (span) => {
      try {
        return match(catalogue, item.skeletons);
      } finally {
        span.end();
      }
    });
    if (cachedMatchResult) {
      const skeleton = item.skeletons[cachedMatchResult.variantIndex ?? 0];
      await dynamo.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: { word, match: item.match, skeletons: item.skeletons, matchResult: cachedMatchResult },
        }),
      );
      log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit: true }, 'request complete');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ constellation: cachedMatchResult, skeleton, match: item.match }),
      };
    }
  }

  const apiKey = await getOpenRouterKey();
  const result = await retrieveSkeleton(word, apiKey);

  if (result.match === null) {
    log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit: false }, 'request complete');
    return { statusCode: 422, headers, body: JSON.stringify({ error: 'No constellation found.' }) };
  }

  const matchResult = tracer.startActiveSpan('matcher', (span) => {
    try {
      return match(catalogue, result.skeletons);
    } finally {
      span.end();
    }
  });

  if (!matchResult) {
    log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit: false }, 'request complete');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'matching failed' }) };
  }

  await dynamo.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: { word, match: result.match, skeletons: result.skeletons, matchResult },
    }),
  );

  const skeleton = result.skeletons[matchResult.variantIndex ?? 0];
  log.info({ word, durationMs: Math.round(performance.now() - t0), cacheHit: false }, 'request complete');
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ constellation: matchResult, skeleton, match: result.match }),
  };
}
