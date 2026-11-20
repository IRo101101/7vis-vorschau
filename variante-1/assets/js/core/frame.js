/**
 * Frame loop: the one and only requestAnimationFrame loop of the runtime (IM 4 "eine Bildschleife").
 *
 * Callbacks run in fixed lanes, in this order, once per frame:
 *   input  : read pointer and layout state, schedule relayouts
 *   scroll : smooth scrolling (Lenis) advances
 *   motion : tweens advance, styles are written in one batch
 *   render : WebGL and other drawing (stage 2, spike S1)
 *   late   : work that must see the final state of the frame
 * Each callback gets (timeSeconds, deltaSeconds). Delta is raw; WebGL clamps it itself (IM 13.1: 1/30 s).
 * A callback that throws is removed and reported once, the loop keeps running.
 */
import { clock } from './clock.js';
import { store } from './store.js';

const LANES = ['input', 'scroll', 'motion', 'render', 'late'];
const lanes = new Map(LANES.map((name) => [name, new Set()]));
let waiters = [];
let last = null;
let rafId = 0;
let started = false;

function run(ms) {
  const t = ms / 1000;
  const dt = last === null ? 0 : Math.max(0, t - last);
  last = t;
  clock._frame(ms);
  for (const name of LANES) {
    for (const fn of lanes.get(name)) {
      try {
        fn(t, dt);
      } catch (err) {
        lanes.get(name).delete(fn);
        console.error(`[v1:frame] callback in lane "${name}" failed and was removed`, err);
        store.emit('core:error', { where: `frame:${name}`, error: err });
      }
    }
  }
  clock._frame(null);
  if (waiters.length) {
    const list = waiters;
    waiters = [];
    for (const resolve of list) resolve(t);
  }
}

function loop(ts) {
  rafId = requestAnimationFrame(loop);
  run(clock.mode === 'manual' ? clock.ms() : ts);
}

export const frame = {
  LANES,

  /** Start the loop (boot does this once). */
  start() {
    if (started) return;
    started = true;
    clock._bind(run);
    rafId = requestAnimationFrame(loop);
  },

  /** Stop the loop (only used by tests and teardown). */
  stop() {
    cancelAnimationFrame(rafId);
    started = false;
  },

  /**
   * Add a per-frame callback. Returns a function that removes it.
   * @param {(t:number, dt:number)=>void} fn
   * @param {'input'|'scroll'|'motion'|'render'|'late'} lane
   */
  add(fn, lane = 'motion') {
    const set = lanes.get(lane);
    if (!set) throw new Error(`[v1:frame] unknown lane "${lane}"`);
    set.add(fn);
    return () => set.delete(fn);
  },

  /** Run fn once in the next frame, in the given lane. Returns a cancel function. */
  once(fn, lane = 'input') {
    const off = this.add((t, dt) => {
      off();
      fn(t, dt);
    }, lane);
    return off;
  },

  /** Promise that resolves after the next frame has run all lanes. */
  next() {
    return new Promise((resolve) => waiters.push(resolve));
  },

  /** Number of registered callbacks (leak checks, stage 2 spike S3). */
  count() {
    let n = 0;
    for (const set of lanes.values()) n += set.size;
    return n;
  },
};
