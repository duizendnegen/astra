export function formatDec(dec: number): string {
  const sign = dec >= 0 ? '+' : '−';
  const abs = Math.abs(dec);
  const deg = Math.floor(abs);
  const minRaw = (abs - deg) * 60;
  const min = Math.floor(minRaw);
  const sec = ((minRaw - min) * 60).toFixed(1);
  return `${sign}${deg}° ${min}' ${sec}"`;
}

export function formatRA(raDeg: number): string {
  // Convert degrees to hours
  const hours = raDeg / 15;
  const h = Math.floor(hours);
  const minRaw = (hours - h) * 60;
  const m = Math.floor(minRaw);
  const s = ((minRaw - m) * 60).toFixed(0);
  return `${h}h ${m}m ${s}s`;
}
