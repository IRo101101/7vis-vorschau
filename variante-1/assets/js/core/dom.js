/** Small DOM helpers shared by the core and the modules. */

/** addEventListener that returns its own remover. */
export function listen(target, type, fn, options) {
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/**
 * Read module options from data attributes: data-<module>-<option-in-kebab-case>.
 * The type of each default decides the parsing (number, boolean, string).
 * Example: readOptions(el, 'headline', { charStagger: 0.02 }) reads data-headline-char-stagger.
 */
export function readOptions(el, prefix, defaults) {
  const out = {};
  for (const [key, def] of Object.entries(defaults)) {
    const raw = el.getAttribute(`data-${prefix}-${kebab(key)}`);
    if (raw === null) {
      out[key] = def;
    } else if (typeof def === 'number') {
      const n = parseFloat(raw);
      out[key] = Number.isFinite(n) ? n : def;
    } else if (typeof def === 'boolean') {
      out[key] = !(raw === 'false' || raw === '0' || raw === 'off');
    } else {
      out[key] = raw;
    }
  }
  return out;
}

/** True when any part of the element is inside the viewport. */
export function inViewport(el) {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && r.width + r.height > 0;
}

/** setTimeout as a promise (real time; for safety limits that must work even if frames stall). */
export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
