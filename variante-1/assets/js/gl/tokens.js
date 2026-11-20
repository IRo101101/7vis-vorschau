/**
 * Role colours for scenes (PLAN 7: "Farben der Figur aus den Rollen", "Hintergrund aus einer CSS-Variable").
 * A scene reads role tokens (level 2) from its own element, so data-theme and data-ci apply exactly as for
 * the HTML. Any CSS colour syntax works: the computed token value is parsed by a 1 x 1 canvas.
 * No palette name and no literal colour lives in the scenes.
 */

let parser = null;

function ctx2d() {
  if (parser) return parser;
  const c = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  parser = c.getContext('2d', { willReadFrequently: true });
  return parser;
}

/** Parse a CSS colour string to sRGB bytes { r, g, b, a } (0..255, a 0..1), or null. */
export function parseColour(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const c = ctx2d();
  if (!c) return null;
  c.clearRect(0, 0, 1, 1);
  // Two sentinels detect a value the canvas rejected (fillStyle then keeps the previous one).
  c.fillStyle = 'rgb(1, 2, 3)';
  c.fillStyle = text;
  const first = c.fillStyle;
  c.fillStyle = 'rgb(4, 5, 6)';
  c.fillStyle = text;
  if (c.fillStyle !== first) return null;
  c.fillRect(0, 0, 1, 1);
  const d = c.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
}

/**
 * Read role tokens from an element.
 * @param {Element} el
 * @param {string[]} names token names, e.g. ['--fl-grund', '--kr-4']
 * @returns {Record<string, {r:number,g:number,b:number,a:number}|null>}
 */
export function readRoles(el, names) {
  const cs = getComputedStyle(el);
  const out = {};
  for (const name of names) out[name] = parseColour(cs.getPropertyValue(name));
  return out;
}

/** A translucent token over an opaque one, as CSS would paint it (sRGB bytes, alpha of the result 1). */
export function over(top, bottom) {
  if (!top) return bottom;
  if (!bottom || top.a >= 1) return top;
  const k = top.a;
  const mix = (a, b) => Math.round(a * k + b * (1 - k));
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a: 1 };
}

/** Set a THREE.Color from sRGB bytes (colour management converts to the linear working space). */
export function toColour(THREE, target, bytes, fallback = 0.5) {
  if (!bytes) return target.setRGB(fallback, fallback, fallback, THREE.SRGBColorSpace);
  return target.setRGB(bytes.r / 255, bytes.g / 255, bytes.b / 255, THREE.SRGBColorSpace);
}
