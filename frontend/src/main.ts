import { loadCatalogue, getCatalogue } from './catalogue';
import { init, resize, setConstellation, animateToResult, animateToLanding } from './renderer';
import { match } from './matcher';
import { buildShareUrl, copyToClipboard, decode } from './share';
import { exportPng } from './export';
import { formatDec, formatRA } from './coords';
import type { ConstellationState } from './types';

// ── DOM refs ──────────────────────────────────────────────────────────────
const canvas          = document.getElementById('sky') as HTMLCanvasElement;
const landing         = document.getElementById('landing') as HTMLDivElement;
const resultPanel     = document.getElementById('result') as HTMLDivElement;
const wordInput       = document.getElementById('word-input') as HTMLInputElement;
const findBtn         = document.getElementById('find-btn') as HTMLButtonElement;
const catalogueStatus = document.getElementById('catalogue-status') as HTMLDivElement;
const coordDec        = document.getElementById('coord-dec') as HTMLSpanElement;
const coordRa         = document.getElementById('coord-ra') as HTMLSpanElement;
const wordDisplay     = document.getElementById('word-display') as HTMLDivElement;
const shareBtn        = document.getElementById('share-btn') as HTMLButtonElement;
const exportBtn       = document.getElementById('export-btn') as HTMLButtonElement;
const closeBtn        = document.getElementById('close-btn') as HTMLButtonElement;

// ── State ─────────────────────────────────────────────────────────────────
let currentState: ConstellationState | null = null;
let usedPatches: Set<string> = new Set();

// ── UI helpers ────────────────────────────────────────────────────────────

function showResult(state: ConstellationState): void {
  wordDisplay.textContent = state.word;
  coordDec.textContent = formatDec(state.match.patchDec);
  coordRa.textContent = formatRA(state.match.patchRA);

  landing.style.display = 'none';
  resultPanel.removeAttribute('hidden');

  setConstellation(state.match);
  animateToResult(state.match.patchRA, state.match.patchDec);
}

function showLanding(): void {
  currentState = null;
  usedPatches = new Set();
  setConstellation(null);
  resultPanel.setAttribute('hidden', '');
  landing.style.display = '';
  wordInput.value = '';
  catalogueStatus.textContent = '';
  animateToLanding();
}

function setLoading(loading: boolean): void {
  findBtn.disabled = loading;
  wordInput.disabled = loading;
  catalogueStatus.textContent = loading ? 'Finding your constellation…' : '';
}

// ── Core flow ─────────────────────────────────────────────────────────────

async function findConstellation(word: string): Promise<void> {
  setLoading(true);
  try {
    const res = await fetch('/api/skeleton', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const skeleton = await res.json();

    const catalogue = getCatalogue();
    const matchResult = match(catalogue, skeleton, usedPatches);
    if (!matchResult) throw new Error('No patch found — try again');

    currentState = { word, match: matchResult };
    showResult(currentState);
  } catch (err) {
    catalogueStatus.textContent = err instanceof Error ? err.message : 'Something went wrong';
  } finally {
    setLoading(false);
  }
}

// ── Event listeners ───────────────────────────────────────────────────────

findBtn.addEventListener('click', () => {
  const word = wordInput.value.trim();
  if (word) findConstellation(word);
});

wordInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const word = wordInput.value.trim();
    if (word && !findBtn.disabled) findConstellation(word);
  }
});

closeBtn.addEventListener('click', showLanding);

shareBtn.addEventListener('click', async () => {
  if (!currentState) return;
  const url = buildShareUrl(currentState);
  await copyToClipboard(url);
  const orig = shareBtn.textContent;
  shareBtn.textContent = 'Copied!';
  setTimeout(() => { shareBtn.textContent = orig; }, 2000);
});

exportBtn.addEventListener('click', async () => {
  if (!currentState) return;
  await exportPng(currentState.word);
});

window.addEventListener('resize', resize);

// ── Boot ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('c');

  const catalogue = await loadCatalogue();
  init(canvas, catalogue);
  catalogueStatus.textContent = '';
  findBtn.disabled = false;

  if (encoded) {
    const state = decode(encoded);
    if (state) {
      currentState = state;
      showResult(state);
    }
    // Invalid param: silently show landing
  }
}

boot();
