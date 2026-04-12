import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { readCsv, writeCsv, initCsvFromWordList, type WordRow } from '../csv.js';

const TMP = join(tmpdir(), `csv-test-${process.pid}`);
const CSV = join(TMP, 'words.csv');
const WORDLIST = join(TMP, 'words.txt');

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe('readCsv', () => {
  it('returns empty array when file does not exist', () => {
    expect(readCsv(CSV)).toEqual([]);
  });

  it('reads rows written by writeCsv', () => {
    const rows: WordRow[] = [
      { word: 'eagle', style: 'linedrawing', status: 'new', png_path: '', svg_path: '',
        png_ms: '', trace_ms: '', skeleton_ms: '', retry_count: '0' },
    ];
    writeCsv(rows, CSV);
    const result = readCsv(CSV);
    expect(result).toHaveLength(1);
    expect(result[0].word).toBe('eagle');
    expect(result[0].status).toBe('new');
    expect(result[0].retry_count).toBe('0');
  });
});

describe('writeCsv / readCsv round-trip', () => {
  it('preserves all fields through write → read', () => {
    const rows: WordRow[] = [
      { word: 'guitar', style: 'linedrawing', status: 'proposed',
        png_path: '/data/guitar-linedrawing.png', svg_path: '/data/guitar-linedrawing.svg',
        png_ms: '1234', trace_ms: '567', skeleton_ms: '', retry_count: '1' },
      { word: 'owl', style: 'linedrawing', status: 'accepted',
        png_path: '/data/owl-linedrawing.png', svg_path: '/data/owl-linedrawing.svg',
        png_ms: '2000', trace_ms: '300', skeleton_ms: '50', retry_count: '0' },
    ];
    writeCsv(rows, CSV);
    const result = readCsv(CSV);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(rows[0]);
    expect(result[1]).toEqual(rows[1]);
  });

  it('handles words with special characters in paths', () => {
    const rows: WordRow[] = [
      { word: 'Beethoven', style: 'linedrawing', status: 'new', png_path: '', svg_path: '',
        png_ms: '', trace_ms: '', skeleton_ms: '', retry_count: '0' },
    ];
    writeCsv(rows, CSV);
    const result = readCsv(CSV);
    expect(result[0].word).toBe('Beethoven');
  });

  it('overwrites previous content on second write', () => {
    const initial: WordRow[] = [
      { word: 'fox', style: 'linedrawing', status: 'new', png_path: '', svg_path: '',
        png_ms: '', trace_ms: '', skeleton_ms: '', retry_count: '0' },
    ];
    writeCsv(initial, CSV);

    // Mutate and re-write
    initial[0].status = 'proposed';
    initial[0].png_ms = '999';
    writeCsv(initial, CSV);

    const result = readCsv(CSV);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('proposed');
    expect(result[0].png_ms).toBe('999');
  });
});

describe('initCsvFromWordList', () => {
  it('creates CSV with one row per word, all status=new', () => {
    writeFileSync(WORDLIST, 'eagle\nowl\nshark\n');
    initCsvFromWordList(WORDLIST, CSV);
    const result = readCsv(CSV);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.word)).toEqual(['eagle', 'owl', 'shark']);
    for (const row of result) {
      expect(row.status).toBe('new');
      expect(row.style).toBe('linedrawing');
      expect(row.retry_count).toBe('0');
      expect(row.png_path).toBe('');
    }
  });

  it('skips blank lines in word list', () => {
    writeFileSync(WORDLIST, 'eagle\n\nowl\n\n');
    initCsvFromWordList(WORDLIST, CSV);
    const result = readCsv(CSV);
    expect(result).toHaveLength(2);
  });
});
