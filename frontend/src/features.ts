export interface Features {
  showLines: boolean;
  showStars: boolean;
}

export function getFeatures(params: URLSearchParams): Features {
  return {
    showLines: params.get('show_lines') === '1',
    showStars: params.get('show_stars') === '1',
  };
}
