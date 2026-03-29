// Fetches IAU constellation stick-figure lines from d3-celestial and converts
// them to the format used by Astra's sky-orientation overlay.
//
// Run once (requires internet access):
//   node scripts/build-constellation-lines.mjs
//
// Output: frontend/public/data/constellation-lines.json
//
// Format:
//   [ { name, bbox: { minRA, maxRA, minDec, maxDec, wraps }, lines: [[ra,dec],...] } ]
//
// - RA in degrees 0–360
// - lines is a flat array of [ra,dec] pairs; each consecutive pair is one segment
// - wraps=true when the constellation straddles RA=0/360 (e.g. Pisces, Andromeda)

import { createWriteStream } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const SOURCE_URL =
  'https://raw.githubusercontent.com/ofrohn/d3-celestial/master/data/constellations.lines.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT = join(__dirname, '../frontend/public/data/constellation-lines.json');

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const geojson = await res.json();

  const results = [];

  for (const feature of geojson.features) {
    const name = feature.properties?.n ?? feature.properties?.id ?? 'Unknown';
    const segments = [];

    const geometry = feature.geometry;
    const allLines =
      geometry.type === 'MultiLineString'
        ? geometry.coordinates
        : geometry.type === 'LineString'
        ? [geometry.coordinates]
        : [];

    for (const line of allLines) {
      for (let i = 0; i + 1 < line.length; i++) {
        segments.push(line[i], line[i + 1]);
      }
    }

    // d3-celestial uses lon in [-180, 180]; convert to [0, 360]
    const flat = segments.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]);

    if (flat.length === 0) continue;

    const ras = flat.map(([ra]) => ra);
    const decs = flat.map(([, dec]) => dec);

    // Detect RA wrap-around using largest-gap algorithm
    const sorted = [...ras].sort((a, b) => a - b);
    let maxGap = 0;
    let gapAfter = sorted[0]; // RA just before the gap (wrap gap goes from last to first)
    for (let i = 1; i < sorted.length; i++) {
      const gap = sorted[i] - sorted[i - 1];
      if (gap > maxGap) { maxGap = gap; gapAfter = sorted[i - 1]; }
    }
    // Also consider wrap-around gap
    const wrapGap = sorted[0] + 360 - sorted[sorted.length - 1];
    const wraps = wrapGap > maxGap && wrapGap > 180;

    const bbox = {
      minRA: Math.min(...ras),
      maxRA: Math.max(...ras),
      minDec: Math.min(...decs),
      maxDec: Math.max(...decs),
      wraps,
    };

    results.push({ name, bbox, lines: flat });
  }

  const json = JSON.stringify(results);
  await new Promise((resolve, reject) => {
    const out = createWriteStream(OUTPUT);
    out.write(json);
    out.end();
    out.on('finish', resolve);
    out.on('error', reject);
  });

  console.log(`Written ${results.length} constellations to ${OUTPUT}`);
  const wrapping = results.filter(r => r.bbox.wraps).map(r => r.name);
  if (wrapping.length) console.log(`Wrapping constellations: ${wrapping.join(', ')}`);
}

main().catch(err => { console.error(err); process.exit(1); });
