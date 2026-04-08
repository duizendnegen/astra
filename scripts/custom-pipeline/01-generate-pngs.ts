/**
 * 01-generate-pngs.ts
 *
 * Generates PNG images for words using Gemini image generation via OpenRouter.
 *
 * Usage:
 *   npx tsx 01-generate-pngs.ts [--init <wordlist>]
 *
 * --init <wordlist>: Initialise words.csv from the given word list file before generating.
 */

import { mkdirSync, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import { readCsv, writeCsv, initCsvFromWordList, type WordRow } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data', 'custom');

const log = pino(
  { level: 'debug' },
  pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
// Verified Gemini image generation model on OpenRouter (confirmed available via /api/v1/models)
// See: https://openrouter.ai/google/gemini-2.5-flash-image
const IMAGE_MODEL = 'google/gemini-2.5-flash-image';

const PROMPT_TEMPLATE = (word: string, retryReason?: string) => {
  const base = `Simple black line drawing of ${word} as an icon on white background. Single element. Clean outlines only, no fill, no shading, no text.`;
  return retryReason ? `${base}\nImportant: ${retryReason}` : base;
};

async function generatePng(word: string, apiKey: string, retryReason?: string): Promise<{ base64: string; ms: number }> {
  const t0 = Date.now();
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [
        {
          role: 'user',
          content: PROMPT_TEMPLATE(word, retryReason),
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: {
      message?: {
        content?: unknown;
        images?: { type: string; image_url?: { url: string } }[];
      };
    }[];
  };

  const msg = data.choices?.[0]?.message;

  // OpenRouter Gemini image models return the image in message.images[],
  // not in message.content (which contains descriptive text only).
  let base64: string | null = null;

  for (const img of msg?.images ?? []) {
    if (img.image_url?.url) {
      const match = img.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
      if (match) { base64 = match[1]; break; }
    }
  }

  // Fallback: check if content is an array with image_url parts (older format)
  if (!base64 && Array.isArray(msg?.content)) {
    for (const part of msg.content as { type: string; image_url?: { url: string } }[]) {
      if (part.type === 'image_url' && part.image_url?.url) {
        const match = part.image_url.url.match(/^data:image\/[^;]+;base64,(.+)$/);
        if (match) { base64 = match[1]; break; }
      }
    }
  }

  if (!base64) {
    throw new Error(`No image data in response. Message keys: ${JSON.stringify(Object.keys(msg ?? {}))}`);
  }

  return { base64, ms: Date.now() - t0 };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY env var is required');

  const args = process.argv.slice(2);
  const initIdx = args.indexOf('--init');
  if (initIdx !== -1) {
    const wordListPath = args[initIdx + 1];
    if (!wordListPath) throw new Error('--init requires a path argument');
    const resolved = path.resolve(__dirname, wordListPath);
    initCsvFromWordList(resolved);
  }

  mkdirSync(DATA_DIR, { recursive: true });

  const rows = readCsv();
  const pending = rows.filter((r) => r.status === 'new' || r.status === 'retry');
  log.info({ total: rows.length, pending: pending.length }, 'Starting PNG generation');

  for (const row of pending) {
    const pngPath = path.join(DATA_DIR, `${row.word}-linedrawing.png`);
    log.info({ word: row.word }, 'Generating PNG');

    try {
      const { base64, ms } = await generatePng(row.word, apiKey, row.retry_reason || undefined);
      await writeFile(pngPath, Buffer.from(base64, 'base64'));

      // Update row in-place; clear svg_path so 02-trace runs again on the new PNG
      row.png_path = pngPath;
      row.svg_path = '';
      row.png_ms = String(ms);
      row.status = 'proposed';
      row.retry_reason = '';  // consumed — clear so it doesn't re-apply next retry

      writeCsv(rows);
      log.info({ word: row.word, ms }, 'PNG saved');
    } catch (err) {
      row.retry_count = String(parseInt(row.retry_count || '0', 10) + 1);
      writeCsv(rows);
      log.warn({ word: row.word, err: String(err) }, 'PNG generation failed — will retry');
    }
  }

  const done = rows.filter((r) => r.status === 'proposed' || r.status === 'accepted' || r.status === 'ingested').length;
  log.info({ done, total: rows.length }, 'PNG generation complete');
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
