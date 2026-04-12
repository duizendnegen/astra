// Fetches the HYG v3.0 star catalogue, filters to naked-eye stars (mag ≤ 6),
// and converts RA from hours to degrees.
//
// Run once (requires internet access):
//   node scripts/filter-hyg.mjs
//
// Output: frontend/public/data/stars.json
//
// Source: https://github.com/astronexus/HYG-Database
//
// Format: [ { id, ra (degrees), dec (degrees), mag } ]

import { createWriteStream } from 'fs';
import { createInterface } from 'readline';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '../frontend/public/data/stars.json');

const MAG_LIMIT = 6;

console.log(`Fetching ${SOURCE_URL} ...`);
const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`HTTP ${res.status}`);

const rl = createInterface({
  input: Readable.fromWeb(res.body),
  crlfDelay: Infinity,
});

const stars = [];
let headers = null;

for await (const line of rl) {
  if (!headers) {
    headers = line.split(',').map(h => h.replace(/^"|"$/g, ''));
    continue;
  }
  const cols = line.split(',');
  const mag = parseFloat(cols[headers.indexOf('mag')]);
  if (isNaN(mag) || mag > MAG_LIMIT) continue;

  const id = parseInt(cols[headers.indexOf('id')]);
  const ra = parseFloat(cols[headers.indexOf('ra')]);   // hours
  const dec = parseFloat(cols[headers.indexOf('dec')]); // degrees

  // Convert RA from hours to degrees for consistency
  stars.push({ id, ra: ra * 15, dec, mag });
}

await new Promise((resolve, reject) => {
  const out = createWriteStream(OUTPUT);
  out.write(JSON.stringify(stars));
  out.end();
  out.on('finish', resolve);
  out.on('error', reject);
});

console.log(`Written ${stars.length} stars (mag ≤ ${MAG_LIMIT}) to ${OUTPUT}`);
