/**
 * Smooth scrolling with Lenis 1.3.26 (vendored, MIT), driven by the one frame loop (IM 5).
 *
 * Settings of the reference: lerp 0.1, smooth wheel, wheel multiplier 1, not infinite.
 * Touch stays native (decided in spike S1, PLAN 5 no. 4: the WebGL back layer steps aside on touch instead);
 * syncTouch and touchMultiplier 2 (IM 5) stay prepared in OPTIONS.
 * Reduced motion removes Lenis completely and restores native scrolling, also at runtime (PLAN 7).
 * Nested scroll areas carry data-scroll-own (own name for the reference's prevent attribute).
 *
 *   scroll.y(), scroll.smooth, scroll.on(fn) -> off, scroll.to(target, opts) -> Promise,
 *   scroll.stop(), scroll.start(), scroll.resize(), scroll.lenis (instance or null)
 */
import Lenis from '../../vendor/lenis-1.3.26/lenis.js';
import { frame } from '../core/frame.js';
import { store } from '../core/store.js';
import { resolveEase } from './ease.js';
import { TIMING } from './curves.js';

export const OPTIONS = Object.freeze({
  lerp: 0.1,
  smoothWheel: true,
  wheelMultiplier: 1,
  syncTouch: false,
  syncTouchLerp: 0.075,
  touchInertiaExponent: 1.7,
  touchMultiplier: 2,
  infinite: false,
  autoRaf: false,
  autoResize: true,
  anchors: false,
  allowNestedScroll: true,
});

let lenis = null;
let offFrame = null;
let stopped = false;
let started = false;
const subs = new Set();

function state() {
  const limit = Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const y = lenis ? lenis.scroll : scrollY;
  return { y, limit, progress: limit ? y / limit : 0, velocity: lenis ? lenis.velocity : 0, smooth: !!lenis };
}

function notify() {
  if (!subs.size) return;
  const s = state();
  for (const fn of [...subs]) {
    try {
      fn(s);
    } catch (err) {
      console.error('[v1:scroll] subscriber failed', err);
    }
  }
}

function create() {
  if (lenis) return;
  try {
    lenis = new Lenis({ ...OPTIONS, prevent: (node) => !!(node && node.closest && node.closest('[data-scroll-own]')) });
  } catch (err) {
    console.error('[v1:scroll] Lenis failed, native scrolling stays', err);
    lenis = null;
    store.set('scroll:smooth', false);
    return;
  }
  lenis.on('scroll', notify);
  offFrame = frame.add((t) => lenis && lenis.raf(t * 1000), 'scroll');
  if (stopped) lenis.stop();
  store.set('scroll:smooth', true);
}

function destroy() {
  if (!lenis) return;
  if (offFrame) offFrame();
  offFrame = null;
  lenis.destroy();
  lenis = null;
  store.set('scroll:smooth', false);
}

export const scroll = {
  OPTIONS,

  init() {
    if (started) return;
    started = true;
    addEventListener('scroll', () => {
      if (!lenis) notify();
    }, { passive: true });
    store.on('motion:reduced', (reduced) => (reduced ? destroy() : create()));
    if (store.get('motion:reduced')) store.set('scroll:smooth', false);
    else create();
  },

  /** Remove smooth scrolling for good (boot failure). */
  disable() {
    destroy();
  },

  get smooth() {
    return !!lenis;
  },

  get lenis() {
    return lenis;
  },

  y() {
    return lenis ? lenis.scroll : scrollY;
  },

  on(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  },

  /**
   * Scroll to a target (number, element or selector). Without smooth scrolling (reduced motion) the jump
   * is immediate. Resolves when the scroll has arrived.
   */
  to(target, { duration = TIMING.guidedScroll.duration, ease = TIMING.guidedScroll.ease, lock = false, immediate = false, offset = 0 } = {}) {
    // Content may have changed since Lenis last measured (late markup): refresh its limits first.
    if (lenis) lenis.resize();
    return new Promise((resolve) => {
      if (!lenis || immediate) {
        const el = typeof target === 'string' ? document.querySelector(target) : target;
        const y = typeof el === 'number' ? el : el ? el.getBoundingClientRect().top + scrollY : 0;
        if (lenis) lenis.scrollTo(y + offset, { immediate: true, force: true });
        else scrollTo({ top: y + offset, behavior: 'instant' });
        resolve();
        return;
      }
      lenis.scrollTo(target, { duration, easing: resolveEase(ease), lock, offset, force: true, onComplete: () => resolve() });
    });
  },

  stop() {
    stopped = true;
    if (lenis) lenis.stop();
  },

  start() {
    stopped = false;
    if (lenis) lenis.start();
  },

  resize() {
    if (lenis) lenis.resize();
  },

  count() {
    return subs.size;
  },
};
