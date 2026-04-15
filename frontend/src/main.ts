import { loadCatalogue, loadConstellationLines } from './catalogue';
import { init, resize, setConstellation, animateToResult, animateToLanding, setOverlayData, getProjection, buildProjectionForCamera } from './renderer';
import { buildShareUrl, copyToClipboard, decode } from './share';
import { exportPng } from './export';
import { formatDec, formatRA } from './coords';
import { loadFeatures, saveFeatures } from './features';
import { NAMED_STARS } from './named-stars';
import { computeSvgTransform } from './overlay';
import type { ConstellationState, MatchResult, MatchProvenance, Skeleton } from './types';
import { RESULT_FOV, RESULT_FOV_MOBILE } from './types';

// Timing constants matching renderer.ts animation parameters
const RESULT_ANIM_MS = 2000;
const RESULT_FADE_START = 0.60; // constellation starts fading at 60% of animation
const LANDING_ANIM_MS = 1500;

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

const settingsBtn     = document.getElementById('settings-btn') as HTMLButtonElement;
const settingsPanel   = document.getElementById('settings-panel') as HTMLDivElement;
const svgOverlay      = document.getElementById('svg-overlay') as HTMLDivElement;
const associationPanel = document.getElementById('association-panel') as HTMLDivElement;
const featureConstellationImage = document.getElementById('feature-constellation-image') as HTMLInputElement;
const featureAssociation = document.getElementById('feature-association') as HTMLInputElement;

// ── State ─────────────────────────────────────────────────────────────────
let currentState: ConstellationState | null = null;
let features = loadFeatures();

// ── SVG overlay ───────────────────────────────────────────────────────────

let svgFadeInTimeoutId: ReturnType<typeof setTimeout> | null = null;
let svgClearTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Inject and position the SVG overlay using the given projection.
 * fadeDelayMs: how long to wait before starting the opacity transition (for sync with animation).
 * When 0, uses double-rAF instead of setTimeout (for immediate toggle-on).
 */
function setupSvgOverlay(
  state: ConstellationState,
  projection: ReturnType<typeof getProjection>,
  fadeDelayMs = 0,
): void {
  // Cancel any in-flight fade-in or clear
  if (svgFadeInTimeoutId !== null) { clearTimeout(svgFadeInTimeoutId); svgFadeInTimeoutId = null; }
  if (svgClearTimeoutId !== null) { clearTimeout(svgClearTimeoutId); svgClearTimeoutId = null; }

  const prov = state.provenance;
  const pts = state.match.skeletonPoints;
  if (!features.showConstellationImage || !prov?.svgPath || !pts?.length) {
    clearSvgOverlay();
    return;
  }
  // SVG content comes from our own S3/CDN bucket (trusted source)
  svgOverlay.innerHTML = prov.svgPath;
  const svgEl = svgOverlay.querySelector('svg') as SVGSVGElement | null;
  if (!svgEl) { clearSvgOverlay(); return; }

  // Unhide before computing transform so getBBox() works on the rendered SVG.
  svgEl.style.transition = 'none';
  svgEl.style.opacity = '0';
  svgOverlay.removeAttribute('hidden');

  const result = computeSvgTransform(
    pts,
    state.skeletonCanonical ?? [],
    state.match.procrustesAngle ?? 0,
    projection,
    svgEl,
  );
  if (!result) { clearSvgOverlay(); return; }

  svgEl.style.transformOrigin = result.transformOrigin;
  svgEl.style.transform = result.transform;

  const startFade = () => {
    svgEl.style.transition = 'opacity 0.8s ease';
    svgEl.style.opacity = '0.35';
  };

  if (fadeDelayMs > 0) {
    svgFadeInTimeoutId = setTimeout(() => { svgFadeInTimeoutId = null; startFade(); }, fadeDelayMs);
  } else {
    // Double rAF: commit the opacity:0 frame before triggering the transition
    requestAnimationFrame(() => { requestAnimationFrame(startFade); });
  }
}

/** Toggle-on: re-inject and fade in immediately using the stable current projection. */
function applySvgOverlay(state: ConstellationState): void {
  setupSvgOverlay(state, getProjection(), 0);
}

/** Resize: update transform on the existing SVG without re-injecting or fading. */
function updateSvgTransform(): void {
  if (!currentState || !features.showConstellationImage) return;
  const svgEl = svgOverlay.querySelector('svg') as SVGSVGElement | null;
  if (!svgEl || svgOverlay.hasAttribute('hidden')) return;
  const pts = currentState.match.skeletonPoints;
  if (!pts?.length) return;
  const result = computeSvgTransform(
    pts,
    currentState.skeletonCanonical ?? [],
    currentState.match.procrustesAngle ?? 0,
    getProjection(),
    svgEl,
  );
  if (result) {
    svgEl.style.transition = 'none';
    svgEl.style.transformOrigin = result.transformOrigin;
    svgEl.style.transform = result.transform;
  }
}

/**
 * Hide and clear the SVG overlay.
 * animMs > 0: fade out over that duration (for sync with animateToLanding).
 */
function clearSvgOverlay(animMs = 0): void {
  if (svgFadeInTimeoutId !== null) { clearTimeout(svgFadeInTimeoutId); svgFadeInTimeoutId = null; }
  if (svgClearTimeoutId !== null) { clearTimeout(svgClearTimeoutId); svgClearTimeoutId = null; }

  const svgEl = svgOverlay.querySelector('svg') as SVGSVGElement | null;
  if (animMs > 0 && svgEl && !svgOverlay.hasAttribute('hidden')) {
    svgEl.style.transition = `opacity ${animMs}ms ease`;
    svgEl.style.opacity = '0';
    svgClearTimeoutId = setTimeout(() => {
      svgClearTimeoutId = null;
      svgOverlay.setAttribute('hidden', '');
      svgOverlay.innerHTML = '';
    }, animMs);
  } else {
    svgOverlay.setAttribute('hidden', '');
    svgOverlay.innerHTML = '';
  }
}

// ── Association trail ─────────────────────────────────────────────────────

function renderTrail(state: ConstellationState): void {
  const prov = state.provenance;
  if (!features.showAssociation || !prov) {
    associationPanel.setAttribute('hidden', '');
    return;
  }

  let html = '';
  if (prov.layer === 1) {
    html = `L1 · direct — <span class="trail-hit">${prov.id}</span> @ ${prov.similarity.toFixed(2)}`;
  } else if (prov.layer === 3) {
    const parts = (prov.trail ?? []).map(e =>
      e.hitId !== null
        ? `<span class="trail-hit">${e.candidate} (${e.sim?.toFixed(2) ?? ''})</span>`
        : `<span class="trail-miss">${e.candidate}</span>`,
    );
    html = `L3 · ${state.word} → ${parts.join(' · ')}`;
  } else if (prov.layer === 4) {
    html = 'L4 · generated — no icon match';
  }

  associationPanel.innerHTML = html;
  associationPanel.removeAttribute('hidden');
}

function clearAssociationPanel(): void {
  associationPanel.setAttribute('hidden', '');
  associationPanel.innerHTML = '';
}

// ── UI helpers ────────────────────────────────────────────────────────────

function showResult(state: ConstellationState): void {
  wordDisplay.textContent = state.word;
  coordDec.textContent = formatDec(state.match.patchDec);
  coordRa.textContent = formatRA(state.match.patchRA);

  landing.style.display = 'none';
  resultPanel.removeAttribute('hidden');

  // Settings not available during result view
  settingsBtn.setAttribute('hidden', '');
  settingsPanel.setAttribute('hidden', '');

  setConstellation(state.match);

  // Set up SVG overlay NOW using the target projection so it can fade in
  // in sync with the constellation (which starts fading at RESULT_FADE_START * RESULT_ANIM_MS).
  const isMobile = canvas.height > canvas.width;
  const resultFov = isMobile ? RESULT_FOV_MOBILE : RESULT_FOV;
  const targetProj = buildProjectionForCamera(state.match.patchRA, state.match.patchDec, resultFov);
  setupSvgOverlay(state, targetProj, RESULT_ANIM_MS * RESULT_FADE_START);

  animateToResult(state.match.patchRA, state.match.patchDec, () => {
    // Animation done — refresh transform with the now-stable actual projection
    updateSvgTransform();
  });

  renderTrail(state);
}

function showLanding(): void {
  currentState = null;
  setConstellation(null);
  resultPanel.setAttribute('hidden', '');
  landing.style.display = '';
  wordInput.value = '';
  catalogueStatus.textContent = '';
  animateToLanding();

  settingsBtn.removeAttribute('hidden');
  // Fade SVG out in sync with constellation (animateToLanding duration = LANDING_ANIM_MS)
  clearSvgOverlay(LANDING_ANIM_MS);
  clearAssociationPanel();
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
      body: JSON.stringify({ word }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      errorMessage = 'No constellation found.';
    } else {
      const data = await res.json() as { constellation: MatchResult; match?: MatchProvenance; skeleton?: Skeleton };
      if (!data.constellation) {
        errorMessage = 'No constellation found.';
      } else {
        currentState = {
          word,
          match: data.constellation,
          provenance: data.match,
          skeletonCanonical: data.skeleton?.points,
        };
        showResult(currentState);
      }
    }
  } catch {
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

settingsBtn.addEventListener('click', () => {
  if (settingsPanel.hasAttribute('hidden')) {
    settingsPanel.removeAttribute('hidden');
  } else {
    settingsPanel.setAttribute('hidden', '');
  }
});

featureConstellationImage.addEventListener('change', () => {
  features = { ...features, showConstellationImage: featureConstellationImage.checked };
  saveFeatures(features);
  if (currentState && featureConstellationImage.checked) applySvgOverlay(currentState);
  else clearSvgOverlay();
});

featureAssociation.addEventListener('change', () => {
  features = { ...features, showAssociation: featureAssociation.checked };
  saveFeatures(features);
  if (currentState) renderTrail(currentState);
  else clearAssociationPanel();
});

window.addEventListener('resize', () => {
  resize();
  updateSvgTransform();
});

// ── Boot ──────────────────────────────────────────────────────────────────

async function boot(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('c');

  // Sync checkboxes with stored features
  featureConstellationImage.checked = features.showConstellationImage;
  featureAssociation.checked = features.showAssociation;

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
