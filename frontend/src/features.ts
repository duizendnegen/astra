export interface Features {
  showLines: boolean;
  showStars: false | 'named' | 'constellation';
  renderMode: 'stars' | 'skeleton';
  showConstellationImage: boolean;
  showAssociation: boolean;
  showStarLabels: boolean;
}

const DEFAULTS: Features = {
  showLines: true,
  showStars: false,
  renderMode: 'stars',
  showConstellationImage: false,
  showAssociation: false,
  showStarLabels: false,
};

const STORAGE_KEY = 'astra-features';

export function loadFeatures(): Features {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Features>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveFeatures(features: Features): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(features));
  } catch {
    // localStorage unavailable (e.g. private mode) — silently discard
  }
}
