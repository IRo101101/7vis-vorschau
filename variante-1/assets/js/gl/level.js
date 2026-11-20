/**
 * Quality levels and frame-time guard of the WebGL layer (PLAN 7, PLAN 8 S1, IM 18).
 *
 * Three levels, ordered from cheap to rich:
 *   statisch  no WebGL at all: still images and CSS surfaces (no WebGL 2, reduced motion, or the guard gave up)
 *   einfach   front layer only (the figure), no multisampling; back-layer scenes are dropped and their
 *             sections keep their CSS surface
 *   voll      front and back layer, multisampled figure
 * Resolution is never the lever: the pixel ratio is min(device pixel ratio, 1.5) at every level.
 * Phones and coarse pointers start at einfach ("mobil weglassen statt verkleinern").
 * The guard only steps down, one level at a time; a level pinned by the review tool switches it off.
 */
import { TIMING } from '../motion/curves.js';

export const LEVELS = Object.freeze(['statisch', 'einfach', 'voll']);

const rank = (level) => Math.max(0, LEVELS.indexOf(level));

/** The lower of two levels. */
export function minLevel(a, b) {
  return LEVELS[Math.min(rank(a), rank(b))];
}

/** One level down (statisch stays statisch). */
export function lower(level) {
  return LEVELS[Math.max(0, rank(level) - 1)];
}

/** True for phone widths or a coarse pointer (IM 16: no particles, no water scene, smaller figure). */
export function isMobile(viewport) {
  return !!viewport && (viewport.bp === 'm' || viewport.bp === 'ml' || viewport.coarse === true);
}

/** Level a device starts with before the guard has seen a frame. */
export function startLevel({ webgl2, reduced, viewport }) {
  if (!webgl2 || reduced) return 'statisch';
  return isMobile(viewport) ? 'einfach' : 'voll';
}

/**
 * What a level switches on. Pure, so the review tool and the tests can read the same table.
 * touch: touch input was seen on this page. Native touch scrolling moves the page on the compositor ahead
 * of the frame loop (measured in S1: one touch step, about 30 px, between section and scene), so opaque
 * back-layer scenes are dropped as soon as a finger scrolls; the front layer stays.
 */
export function features(level, viewport, { touch = false } = {}) {
  const mobile = isMobile(viewport);
  const on = level !== 'statisch';
  return {
    front: on,
    back: level === 'voll' && !mobile && !touch,
    samples: level === 'voll' && !(viewport && viewport.coarse) ? TIMING.gl.samples : 0,
    pointer: on && !!(viewport && viewport.hover),
    mobile,
    pixelRatioMax: TIMING.gl.pixelRatioMax,
  };
}

/** Effective pixel ratio: never above the cap, never shrunk below the device value under the cap. */
export function pixelRatio(devicePixelRatio) {
  return Math.min(Math.max(1, devicePixelRatio || 1), TIMING.gl.pixelRatioMax);
}

/**
 * Frame-time guard: collects frame times while the WebGL layer draws and reports 'down' when the median of
 * a full window exceeds the budget. The window is measured in time (windowMs, at least minFrames frames),
 * so a slow device is judged as fast as a fast one. The first warmupMs after a (re)start are skipped,
 * stalls above stallMs (hidden tab, debugger) are ignored, and after a step down the guard waits for the
 * cool-down and a full new window before it judges again.
 */
export class FrameGuard {
  constructor(o = {}) {
    const g = TIMING.gl.guard;
    this.budgetMs = o.budgetMs ?? g.budgetMs;
    this.windowMs = o.windowMs ?? g.windowMs;
    this.minFrames = o.minFrames ?? g.minFrames;
    this.warmupMs = o.warmupMs ?? g.warmupMs;
    this.stallMs = o.stallMs ?? g.stallMs;
    this.cooldownMs = o.cooldownMs ?? g.cooldownMs;
    this.samples = [];
    this.span = 0;
    this.warm = this.warmupMs;
    this.blockedUntil = 0;
    this.last = null;
  }

  /** Forget everything (render loop restarted, level changed, viewport resized). */
  reset() {
    this.samples.length = 0;
    this.span = 0;
    this.warm = this.warmupMs;
  }

  /** Median frame time of the current window in ms (NaN when empty). */
  median() {
    if (!this.samples.length) return NaN;
    const s = [...this.samples].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  }

  /** Feed one frame time (ms) at time nowMs. Returns 'down' when the level should drop. */
  push(dtMs, nowMs) {
    if (!(dtMs > 0) || dtMs > this.stallMs) return null;
    if (this.warm > 0) {
      this.warm -= dtMs;
      return null;
    }
    this.samples.push(dtMs);
    this.span += dtMs;
    while (this.samples.length > this.minFrames && this.span - this.samples[0] >= this.windowMs) this.span -= this.samples.shift();
    if (this.span < this.windowMs || this.samples.length < this.minFrames || nowMs < this.blockedUntil) return null;
    const m = this.median();
    this.last = m;
    if (m <= this.budgetMs) return null;
    this.blockedUntil = nowMs + this.cooldownMs;
    this.reset();
    return 'down';
  }
}
