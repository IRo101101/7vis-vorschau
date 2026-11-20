/**
 * Clock: the single time source of the runtime (PLAN 5 no. 2: "stellbare Uhr fuer Pruefläufe").
 *
 * - "real" mode: frames carry the requestAnimationFrame timestamp, code outside a frame reads performance.now().
 * - "manual" mode: time only moves when a test calls clock.set() or clock.advance(); every move runs one
 *   synchronous frame, so a test can sample any animation at an exact instant.
 *
 * Manual mode is chosen before boot by a test harness (globalThis.__V1_CLOCK__ = 'manual', e.g. via
 * Playwright addInitScript). Delivered pages never set it; there is no UI and no URL switch for it.
 */

const manual = globalThis.__V1_CLOCK__ === 'manual';

let manualMs = 0;
let frameMs = null;
let runner = null;

export const clock = {
  /** 'real' or 'manual'. */
  get mode() {
    return manual ? 'manual' : 'real';
  },

  /** Current time in milliseconds. */
  ms() {
    if (manual) return manualMs;
    return frameMs ?? performance.now();
  },

  /** Current time in seconds, the unit of the motion engine. */
  s() {
    return this.ms() / 1000;
  },

  /** Manual mode only: jump to an absolute time (ms) and run one frame synchronously. */
  set(ms) {
    if (!manual) throw new Error('[v1:clock] set() needs manual mode');
    manualMs = ms;
    if (runner) runner(manualMs);
  },

  /** Manual mode only: move the time forward by ms and run one frame synchronously. */
  advance(ms) {
    this.set(manualMs + ms);
  },

  /** @internal frame.js marks the frame being processed. */
  _frame(ms) {
    frameMs = ms;
  },

  /** @internal frame.js registers its runner for manual steps. */
  _bind(fn) {
    runner = fn;
  },
};
