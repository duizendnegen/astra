/**
 * setup.ts
 *
 * Downloads the pinned vtracer Windows x64 binary from GitHub releases.
 * Run once before using the custom pipeline.
 *
 *   npx tsx setup.ts
 */

import { existsSync, mkdirSync, createWriteStream } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BIN_DIR = path.join(__dirname, 'bin');
const VTRACER_PATH = path.join(BIN_DIR, 'vtracer.exe');

// Pinned release: vtracer v0.6.4 Windows x64
// https://github.com/visioncortex/vtracer/releases/tag/0.6.4
const VTRACER_VERSION = '0.6.4';
const VTRACER_URL = `https://github.com/visioncortex/vtracer/releases/download/${VTRACER_VERSION}/vtracer-x86_64-pc-windows-msvc.zip`;

const execFileAsync = promisify(execFile);

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);

  const arrayBuffer = await res.arrayBuffer();
  const { writeFile } = await import('fs/promises');
  await writeFile(destPath, Buffer.from(arrayBuffer));
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  // Use PowerShell's Expand-Archive (available on Windows)
  await execFileAsync('powershell', [
    '-NoProfile', '-NonInteractive',
    '-Command', `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${destDir}"`,
  ]);
}

async function main(): Promise<void> {
  if (existsSync(VTRACER_PATH)) {
    console.log(`vtracer binary already present at ${VTRACER_PATH} — skipping download.`);
    await verifybinary();
    return;
  }

  mkdirSync(BIN_DIR, { recursive: true });

  const zipPath = path.join(BIN_DIR, 'vtracer.zip');
  await downloadFile(VTRACER_URL, zipPath);

  console.log('Extracting zip...');
  await extractZip(zipPath, BIN_DIR);

  // Clean up zip
  const { unlink } = await import('fs/promises');
  await unlink(zipPath).catch(() => {});

  if (!existsSync(VTRACER_PATH)) {
    throw new Error(`vtracer.exe not found at ${VTRACER_PATH} after extraction. Check the release asset structure.`);
  }

  console.log(`vtracer extracted to ${VTRACER_PATH}`);
  await verifybinary();
}

async function verifybinary(): Promise<void> {
  console.log('Running vtracer --version sanity check...');
  try {
    const { stdout } = await execFileAsync(VTRACER_PATH, ['--version']);
    console.log(`vtracer version: ${stdout.trim()}`);
  } catch (err) {
    throw new Error(`vtracer --version failed: ${err}`);
  }
}

main().catch((err) => {
  console.error('setup failed:', err);
  process.exit(1);
});
