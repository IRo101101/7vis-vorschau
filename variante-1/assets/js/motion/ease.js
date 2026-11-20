/**
 * Easing functions: cubic-bezier curves of the motion table plus the standard families the reference
 * names (expo, power1 to power4, sine, back, linear; formulas as commonly defined).
 * Every ease maps progress 0..1 to 0..1 with ease(0) = 0 and ease(1) = 1.
 */
import { CURVES } from './curves.js';

/** Cubic-bezier timing function as defined for CSS: solve x(t) = p, return y(t). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t) => (3 * ax * t + 2 * bx) * t + cx;

  function solve(x) {
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-7) return t;
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t = Math.min(1, Math.max(0, t - err / d));
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 60; i += 1) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  }

  const fn = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : sampleY(solve(p)));
  fn.points = [x1, y1, x2, y2];
  return fn;
}

function family(easeIn) {
  return {
    in: easeIn,
    out: (p) => 1 - easeIn(1 - p),
    inOut: (p) => (p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2),
  };
}

const power = (n) => family((p) => p ** n);
const FAMILIES = {
  power1: power(2),
  power2: power(3),
  power3: power(4),
  power4: power(5),
  expo: family((p) => (p <= 0 ? 0 : 2 ** (10 * (p - 1)))),
  sine: family((p) => 1 - Math.cos((p * Math.PI) / 2)),
};

function back(kind, s = 1.70158) {
  return family((p) => (p <= 0 ? 0 : p * p * ((s + 1) * p - s)))[kind];
}

const cache = new Map();

/**
 * Resolve an ease by name or function. Names: a key of CURVES, 'linear', '<family>.<in|out|inOut>',
 * 'back.out(0.5)' style with a parameter, or 'cubic-bezier(a, b, c, d)'.
 */
export function resolveEase(ease) {
  if (typeof ease === 'function') return ease;
  const name = String(ease || 'expo.out').trim();
  if (cache.has(name)) return cache.get(name);
  let fn = null;
  if (CURVES[name]) {
    fn = bezier(...CURVES[name]);
  } else if (name === 'linear' || name === 'none') {
    fn = (p) => Math.min(1, Math.max(0, p));
  } else {
    const cb = /^cubic-bezier\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/.exec(name);
    const fam = /^(\w+)\.(in|out|inOut)(?:\(([-\d.]+)\))?$/.exec(name);
    if (cb) fn = bezier(...cb.slice(1, 5).map(Number));
    else if (fam && fam[1] === 'back') fn = back(fam[2], fam[3] === undefined ? undefined : Number(fam[3]));
    else if (fam && FAMILIES[fam[1]]) fn = FAMILIES[fam[1]][fam[2]];
  }
  if (!fn) {
    console.warn(`[v1:ease] unknown ease "${name}", using expo.out`);
    fn = FAMILIES.expo.out;
  }
  const safe = (p) => (p <= 0 ? 0 : p >= 1 ? 1 : fn(p));
  safe.easeName = name;
  cache.set(name, safe);
  return safe;
}

/**
 * Inverse of a monotonic ease: the progress p at which ease(p) first reaches y (bisection).
 * Used where the reference "reverses the curve", e.g. the card image start (IM 11.4).
 */
export function invertEase(ease, y) {
  const fn = resolveEase(ease);
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (fn(mid) < y) lo = mid;
    else hi = mid;
  }
  return hi;
}
