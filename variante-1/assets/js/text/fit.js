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
