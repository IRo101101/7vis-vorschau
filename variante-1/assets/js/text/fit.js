/**
 * Title fit (PLAN 9 risk 9: "Titelgroesse aus der Zeilenlaenge"). Giant titles in capitals must hold the
 * longest German word without breaking it. CSS caps the size with an estimate (level 3 --versal-breite);
 * this measures the widest word of a split title and writes the exact size as --titel-fit (px).
 * The CSS uses min(level 4 size, --titel-fit), so the reference size stays the upper bound.
 * Widths scale linearly with the font size (letter-spacing is in em), so one step is exact.
 */
export function fitWords(el, split, { safety = 0.995 } = {}) {
  if (!split || !split.words.length) return false;
  const cs = getComputedStyle(el);
  const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  let widest = 0;
  for (const w of split.words) widest = Math.max(widest, w.el.offsetWidth);
  if (!widest || avail <= 0) return false;
  const fontSize = parseFloat(cs.fontSize);
  const target = Math.floor(fontSize * (avail / widest) * safety * 100) / 100;
  const next = `${target}px`;
  if (el.style.getPropertyValue('--titel-fit') === next) return false;
  el.style.setProperty('--titel-fit', next);
  return true;
}

/**
 * Line fit (stage 3, hero claim): every explicit line of a split title stays on one row, as the two title
 * lines of the reference do on wide screens. The width of a line is the sum of its word boxes plus the
 * spaces between them, measured at the current size; the size scales linearly. The level 4 size stays the
 * upper bound (min() in the CSS), so short lines keep the reference size.
 */
export function fitLines(el, split, { safety = 0.985 } = {}) {
  if (!split || !split.lines.length) return false;
  const cs = getComputedStyle(el);
  const avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const fontSize = parseFloat(cs.fontSize);
  if (!(avail > 0) || !(fontSize > 0)) return false;
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const space = ctx.measureText(' ').width + (parseFloat(cs.letterSpacing) || 0);
  let widest = 0;
  for (const line of split.lines) {
    const words = line.words.filter((w) => w.el.offsetWidth > 0);
    if (!words.length) continue;
    const width = words.reduce((sum, w) => sum + w.el.offsetWidth, 0) + space * (words.length - 1);
    widest = Math.max(widest, width);
  }
  if (!widest) return false;
  const target = Math.floor(fontSize * (avail / widest) * safety * 100) / 100;
  const next = `${target}px`;
  if (el.style.getPropertyValue('--titel-fit') === next) return false;
  el.style.setProperty('--titel-fit', next);
  return true;
}
