/**
 * 02-trace-svgs.ts
 *
 * Traces PNG images to SVG using Potrace.
 *
 * Usage:
 *   npx tsx 02-trace-svgs.ts
 */

import { writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import * as potrace from 'potrace';
import { readCsv, writeCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data', 'custom');

const log = pino(
  { level: 'debug' },
  pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

function traceWithPotrace(pngPath: string, svgPath: string): Promise<void> {
  // potrace uses jimp which requires forward slashes on Windows
  const normalizedPngPath = pngPath.replace(/\\/g, '/');
  return new Promise((resolve, reject) => {
    potrace.trace(normalizedPngPath, (err: Error | null, svg: string) => {
      if (err) { reject(err); return; }
      writeFileSync(svgPath, svg, 'utf-8');
      resolve();
    });
  });
}

async function main(): Promise<void> {
  mkdirSync(DATA_DIR, { recursive: true });

  const rows = readCsv();
  // Process proposed rows that have a png_path but no svg_path yet
  const pending = rows.filter((r) => r.status === 'proposed' && r.png_path && !r.svg_path);
  log.info({ total: rows.length, pending: pending.length }, 'Starting SVG tracing');

  for (const row of pending) {
    if (!existsSync(row.png_path)) {
      log.warn({ word: row.word, png_path: row.png_path }, 'PNG file not found — skipping');
      continue;
    }

    const svgPath = path.join(DATA_DIR, `${row.word}-linedrawing.svg`);
    log.info({ word: row.word }, 'Tracing SVG');

    const t0 = Date.now();
    try {
      await traceWithPotrace(row.png_path, svgPath);
      const ms = Date.now() - t0;
      row.trace_ms = String(ms);
      row.svg_path = svgPath;
      writeCsv(rows);
      log.info({ word: row.word, ms }, 'SVG traced');
    } catch (err) {
      log.warn({ word: row.word, err: String(err) }, 'Trace failed');
    }
  }

  const done = rows.filter((r) => r.svg_path).length;
  log.info({ done, total: rows.length }, 'SVG tracing complete');
}

main().catch((err) => {
  log.error({ err }, 'Fatal error');
  process.exit(1);
});
