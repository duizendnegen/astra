import * as fs from 'fs';
import * as path from 'path';
import { createLogger } from './logger.js';
import type { Star } from './types.js';

const log = createLogger('catalogue');

const STARS_PATH = process.env.STARS_PATH
  ?? path.resolve(process.cwd(), '..', 'frontend', 'public', 'data', 'stars.json');

let catalogue: Star[];

try {
  catalogue = JSON.parse(fs.readFileSync(STARS_PATH, 'utf-8')) as Star[];
  log.info({ count: catalogue.length, path: STARS_PATH }, 'Star catalogue loaded');
} catch (err) {
  log.fatal({ err, path: STARS_PATH }, 'Failed to load star catalogue');
  process.exit(1);
}

export function getCatalogue(): Star[] {
  return catalogue;
}
