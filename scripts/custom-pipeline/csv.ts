/**
 * csv.ts
 *
 * Shared CSV state management for the custom pipeline.
 * Reads/writes words.csv atomically (read-all → modify → write-all).
 */

import { readFileSync, writeFileSync, existsSync, readFile } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CSV_PATH = path.join(__dirname, 'words.csv');

export type WordStatus = 'new' | 'proposed' | 'accepted' | 'retry' | 'ingested';

export interface WordRow {
  word: string;
  style: string;
  status: WordStatus;
  png_path: string;
  svg_path: string;
  png_ms: string;
  trace_ms: string;
  skeleton_ms: string;
  retry_count: string;
  retry_reason: string;
  skeleton_strategy: string;  // 'polygon-union' | ''
}

const HEADERS: (keyof WordRow)[] = [
  'word', 'style', 'status', 'png_path', 'svg_path',
  'png_ms', 'trace_ms', 'skeleton_ms', 'retry_count', 'retry_reason', 'skeleton_strategy',
];

function parseCsvLine(line: string): string[] {
  // Simple CSV parse: handles quoted fields with commas but no escaped quotes
  const fields: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function formatCsvLine(row: WordRow): string {
  return HEADERS.map((h) => {
    const v = row[h];
    return v.includes(',') || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
}

export function readCsv(csvPath = CSV_PATH): WordRow[] {
  if (!existsSync(csvPath)) return [];
  const text = readFileSync(csvPath, 'utf-8');
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length === 0) return [];
  // Skip header line
  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);
    const row: Partial<WordRow> = {};
    for (let i = 0; i < HEADERS.length; i++) {
      (row as Record<string, string>)[HEADERS[i]] = fields[i] ?? '';  // default missing columns (e.g. retry_reason in old CSVs)
    }
    return row as WordRow;
  });
}

export function writeCsv(rows: WordRow[], csvPath = CSV_PATH): void {
  const header = HEADERS.join(',');
  const lines = [header, ...rows.map(formatCsvLine)];
  writeFileSync(csvPath, lines.join('\n') + '\n', 'utf-8');
}

/**
 * Creates words.csv from a plain text word list (one word per line).
 * All rows initialised with status=new, retry_count=0.
 */
export function initCsvFromWordList(wordListPath: string, csvPath = CSV_PATH): void {
  const text = readFileSync(wordListPath, 'utf-8');
  const words = text.split('\n').map((w) => w.trim()).filter(Boolean);

  const rows: WordRow[] = words.map((word) => ({
    word,
    style: 'linedrawing',
    status: 'new',
    png_path: '',
    svg_path: '',
    png_ms: '',
    trace_ms: '',
    skeleton_ms: '',
    retry_count: '0',
    retry_reason: '',
    skeleton_strategy: '',
  }));

  writeCsv(rows, csvPath);
  console.log(`Initialised ${rows.length} words in ${csvPath}`);
}
