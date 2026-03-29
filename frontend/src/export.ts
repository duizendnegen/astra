import { getCanvas } from './renderer';

const CREDIT = 'astra.plusx.black';
const CREDIT_FONT = '11px "Space Grotesk", sans-serif';
const CREDIT_COLOR = 'rgba(140,144,149,0.5)';
const CREDIT_MARGIN = 16;

const WORD_COLOR = 'rgba(211,229,241,0.12)';

export async function exportPng(word: string): Promise<void> {
  await document.fonts.ready;

  const source = getCanvas();

  // Create offscreen canvas — never touch the live canvas
  const offscreen = document.createElement('canvas');
  offscreen.width = source.width;
  offscreen.height = source.height;
  const ctx = offscreen.getContext('2d')!;

  ctx.drawImage(source, 0, 0);

  // Word watermark
  const wordFontSize = Math.min(source.width * 0.08, 96);
  ctx.save();
  ctx.font = `300 ${wordFontSize}px "Space Grotesk", sans-serif`;
  ctx.fillStyle = WORD_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, source.width / 2, source.height / 2);
  ctx.restore();

  // Credit line
  ctx.save();
  ctx.font = CREDIT_FONT;
  ctx.fillStyle = CREDIT_COLOR;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(CREDIT, source.width - CREDIT_MARGIN, source.height - CREDIT_MARGIN);
  ctx.restore();

  const dataUrl = offscreen.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `astra-${word.toLowerCase().replace(/\s+/g, '-')}.png`;
  a.click();
}
