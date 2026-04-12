// Reads the HYG star database CSV and produces a name lookup for stars in the
// Astra catalogue (frontend/public/data/stars.json).
//
// Run once:
//   cd scripts && npx tsx generate-star-names.ts
//
// Output: frontend/public/data/star-names.json
//
// Source: https://github.com/astronexus/HYG-Database
//   File:  hyg/CURRENT/hygdata_v41.csv (place at ../data/hygdata_v41.csv)
//
// Format: { [hygId: string]: string }  — proper name first, Bayer fallback.

import { createReadStream, createWriteStream, readFileSync } from 'fs';
import { createInterface } from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH    = join(__dirname, '../data/hygdata_v41.csv');
const STARS_PATH  = join(__dirname, '../frontend/public/data/stars.json');
const OUTPUT_PATH = join(__dirname, '../frontend/public/data/star-names.json');

// Parse a single CSV line respecting double-quoted fields
function splitCsv(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let end = i + 1;
      while (end < line.length) {
        if (line[end] === '"' && line[end + 1] === '"') { end += 2; continue; } // escaped quote
        if (line[end] === '"') break;
        end++;
      }
      fields.push(line.slice(i + 1, end).replace(/""/g, '"'));
      i = end + 2; // skip closing quote and comma
    } else {
      // Unquoted field
      const end = line.indexOf(',', i);
      if (end === -1) { fields.push(line.slice(i)); break; }
      fields.push(line.slice(i, end));
      i = end + 1;
    }
  }
  return fields;
}

// Greek letter abbreviations used in the HYG `bayer` column → Unicode
const GREEK: Record<string, string> = {
  Alp: 'α', Bet: 'β', Gam: 'γ', Del: 'δ', Eps: 'ε', Zet: 'ζ',
  Eta: 'η', The: 'θ', Iot: 'ι', Kap: 'κ', Lam: 'λ', Mu:  'μ',
  Nu:  'ν', Xi:  'ξ', Omi: 'ο', Pi:  'π', Rho: 'ρ', Sig: 'σ',
  Tau: 'τ', Ups: 'υ', Phi: 'φ', Chi: 'χ', Psi: 'ψ', Ome: 'ω',
};

// Load the set of star IDs present in stars.json
const catalogue: { id: number }[] = JSON.parse(readFileSync(STARS_PATH, 'utf8'));
const catalogueIds = new Set(catalogue.map((s) => s.id));
console.log(`Loaded ${catalogueIds.size} stars from catalogue.`);

// Stream and parse the HYG CSV
const rl = createInterface({
  input: createReadStream(CSV_PATH, { encoding: 'utf8' }),
  crlfDelay: Infinity,
});

const result: Record<string, string> = {};
let headers: string[] | null = null;

for await (const line of rl) {
  if (!headers) {
    // Strip surrounding quotes from header names
    headers = line.split(',').map((h) => h.replace(/^"|"$/g, ''));
    continue;
  }

  const cols = splitCsv(line);
  const id = parseInt(cols[headers.indexOf('id')], 10);
  if (!catalogueIds.has(id)) continue;

  const proper = cols[headers.indexOf('proper')]?.trim();
  if (proper) {
    result[id] = proper;
    continue;
  }

  const bayer = cols[headers.indexOf('bayer')]?.trim();
  const con   = cols[headers.indexOf('con')]?.trim();
  if (bayer && con) {
    const greek = GREEK[bayer];
    if (greek) {
      result[id] = `${greek} ${con}`;
    }
  }
}

await new Promise<void>((resolve, reject) => {
  const out = createWriteStream(OUTPUT_PATH);
  out.write(JSON.stringify(result, null, 2));
  out.end();
  out.on('finish', resolve);
  out.on('error', reject);
});

const count = Object.keys(result).length;
console.log(`Written ${count} star names to ${OUTPUT_PATH}`);
