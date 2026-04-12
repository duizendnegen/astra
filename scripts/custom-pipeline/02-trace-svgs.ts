/**
 * 02-trace-svgs.ts
 *
 * Traces PNG images to SVG using the vtracer binary.
 *
 * Usage:
 *   npx tsx 02-trace-svgs.ts
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pino from 'pino';
import * as potrace from 'potrace';
import { readCsv, writeCsv } from './csv.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VTRACER_PATH = path.join(__dirname, 'bin', 'vtracer.exe');
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data', 'custom');

const log = pino(
  { level: 'debug' },
  pino.transport({ target: 'pino-pretty', options: { colorize: true } }),
);

const execFileAsync = promisify(execFile);

// vtracer flags per design spec D4
const VTRACER_FLAGS = [
  '--colormode', 'bw',
  '--mode', 'polygon',
  '--filter_speckle', '2',
  '--corner_threshold', '45',
  '--segment_length', '3.5',
];

const MAX_SUBPATHS = 500;

/** Count the number of subpaths (M commands) in an SVG string. */
function countSubpaths(svgContent: string): number {
  // Each <path> element with a d attribute counts its M (moveto) commands as subpaths
  const pathMatches = svgContent.matchAll(/ d="([^"]*)"/g);
  let total = 0;
  for (const match of pathMatches) {
    const d = match[1];
    // Count M/m commands = subpath starts
    total += (d.match(/[Mm]/g) ?? []).length;
  }
  return total;
}

async function tracePng(pngPath: string, svgPath: string): Promise<number> {
  const t0 = Date.now();
  await execFileAsync(VTRACER_PATH, [
    '--input', pngPath,
    '--output', svgPath,
    ...VTRACER_FLAGS,
  ]);
  return Date.now() - t0;
}

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
  if (!existsSync(VTRACER_PATH)) {
    throw new Error(`vtracer not found at ${VTRACER_PATH}. Run setup.ts first.`);
  }

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

    try {
      const ms = await tracePng(row.png_path, svgPath);
      const svgContent = readFileSync(svgPath, 'utf-8');
      const subpaths = countSubpaths(svgContent);

      row.trace_ms = String(ms);
      row.svg_path = svgPath;

      // Run Potrace on the same PNG alongside vtracer
      const potraceSvgPath = path.join(DATA_DIR, `${row.word}-linedrawing-potrace.svg`);
      try {
        await traceWithPotrace(row.png_path, potraceSvgPath);
        row.potrace_svg_path = potraceSvgPath;
        log.info({ word: row.word }, 'Potrace SVG written');
      } catch (potraceErr) {
        log.warn({ word: row.word, err: String(potraceErr) }, 'Potrace trace failed — continuing');
        row.potrace_svg_path = '';
      }

      if (subpaths > MAX_SUBPATHS) {
        row.status = 'retry';
        row.retry_count = String(parseInt(row.retry_count || '0', 10) + 1);
        writeCsv(rows);
        log.warn({ word: row.word, subpaths, ms }, `SVG has ${subpaths} subpaths (>${MAX_SUBPATHS}) — marked for retry`);
      } else {
        writeCsv(rows);
        log.info({ word: row.word, subpaths, ms }, 'SVG traced');
      }
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
