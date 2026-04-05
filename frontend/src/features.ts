export interface Features {
  showLines: boolean;
  showStars: boolean;
  renderMode: 'stars' | 'skeleton';
}

export function getFeatures(params: URLSearchParams): Features {
  const renderModeParam = params.get('render_mode');
  return {
    showLines: params.get('show_lines') !== '0',
    showStars: params.get('show_stars') === '1',
    renderMode: renderModeParam === 'skeleton' ? 'skeleton' : 'stars',
  };
}
