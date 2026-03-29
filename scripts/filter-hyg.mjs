// Run once to produce stars.json: node filter-hyg.mjs
import { createReadStream } from 'fs';
import { createWriteStream } from 'fs';
import { createInterface } from 'readline';

const MAG_LIMIT = 6;
const input = createReadStream(new URL('./hyg_v30.csv', import.meta.url));
const rl = createInterface({ input, crlfDelay: Infinity });

const stars = [];
let headers = null;

for await (const line of rl) {
  if (!headers) {
    headers = line.split(',');
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

const out = createWriteStream(new URL('./stars.json', import.meta.url));
out.write(JSON.stringify(stars));
out.end();
console.log(`Written ${stars.length} stars (mag ≤ ${MAG_LIMIT}) to stars.json`);
