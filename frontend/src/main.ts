import { loadCatalogue, loadConstellationLines } from './catalogue';
import { init, resize, setConstellation, animateToResult, animateToLanding, setOverlayData } from './renderer';
import { buildShareUrl, copyToClipboard, decode } from './share';
import { exportPng } from './export';
import { formatDec, formatRA } from './coords';
import { getFeatures } from './features';
import { NAMED_STARS } from './named-stars';
import type { ConstellationState, MatchResult } from './types';

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
let usedPatches: Set<number> = new Set();

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
  usedPatches = new Set<number>();
  setConstellation(null);
  resultPanel.setAttribute('hidden', '');
  landing.style.display = '';
  wordInput.value = '';
  catalogueStatus.textContent = '';
  animateToLanding();
}

const LOADING_MESSAGES = [
  'Aligning the stars…',
  'Sifting through stardust…',
  'Charting the sky…',
  'Tracing the Milky Way…',
  'Mapping the cosmos…',
  'Measuring light years…',
  'Calibrating telescopes…',
  'Listening for echoes…',
  'Catching starlight…',
  'Drawing the dots…',
  'Adjusting for stellar drift…',
  'Parsing the zodiac…',
  'Discovering the galaxy…',
  'Chasing shooting stars…',
];

let loadingIntervalId: ReturnType<typeof setInterval> | null = null;

function cycleLoadingMessage(): void {
  const pool = LOADING_MESSAGES.filter(m => m !== catalogueStatus.textContent);
  const next = pool[Math.floor(Math.random() * pool.length)];
  catalogueStatus.classList.add('fading');
  setTimeout(() => {
    catalogueStatus.textContent = next;
    catalogueStatus.classList.remove('fading');
  }, 500);
}

function setLoading(loading: boolean): void {
  findBtn.disabled = loading;
  wordInput.disabled = loading;

  if (loading) {
    catalogueStatus.textContent = 'Finding your constellation…';
    catalogueStatus.classList.remove('fading');
    catalogueStatus.classList.remove('status-error');
    loadingIntervalId = setInterval(cycleLoadingMessage, 3500);
  } else {
    if (loadingIntervalId !== null) {
      clearInterval(loadingIntervalId);
      loadingIntervalId = null;
    }
    catalogueStatus.textContent = '';
    catalogueStatus.classList.remove('fading');
    catalogueStatus.classList.remove('status-error');
  }
}

// ── Core flow ─────────────────────────────────────────────────────────────

async function findConstellation(word: string): Promise<void> {
  setLoading(true);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20_000);

  let errorMessage = '';
  try {
    const res = await fetch('/api/constellation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, excludeSeeds: Array.from(usedPatches) }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      errorMessage = 'No constellation found.';
    } else {
      const { constellation, seedStarId } = await res.json() as { constellation: MatchResult; seedStarId?: number };
      if (!constellation) {
        errorMessage = 'No constellation found.';
      } else {
        if (seedStarId != null) usedPatches.add(seedStarId);
        currentState = { word, match: constellation };
        showResult(currentState);
      }
    }
  } catch (err) {
    clearTimeout(timeoutId);
    errorMessage = 'No constellation found.';
  } finally {
    setLoading(false);
  }

  if (errorMessage) {
    catalogueStatus.textContent = errorMessage;
    catalogueStatus.classList.add('status-error');
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
  const features = getFeatures(params);

  const [catalogue, constellationLines] = await Promise.all([
    loadCatalogue(),
    features.showLines ? loadConstellationLines() : Promise.resolve([]),
  ]);

  init(canvas, catalogue);
  setOverlayData(features, constellationLines, NAMED_STARS);
  catalogueStatus.textContent = '';
  findBtn.disabled = false;

  if (encoded) {
    const state = decode(encoded, catalogue);
    if (state) {
      currentState = state;
      showResult(state);
    }
    // Invalid param: silently show landing
  }
}

boot();
