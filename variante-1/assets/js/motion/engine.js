/**
 * Motion engine (PLAN 5 no. 2: own engine, values of the reference as a table, settable clock).
 *
 *   motion.tween(targets, to, { duration, delay, at, ease, stagger, from, kind, onComplete })
 *   motion.set(targets, props)          immediate, takes the props away from running tweens
 *   motion.group()                      tracks tweens of one module: tween(), kill(), finish(), all()
 *   motion.finishAll(), motion.kill(targets), motion.now(), motion.get(el, prop), motion.count()
 *
 * Properties: x, y (px), xPercent, yPercent (% of the element), scale, scaleX, scaleY, rotate (deg),
 * opacity, widthPercent (style width in %), clipTop/Right/Bottom/Left (clip-path inset in %), and custom
 * properties ('--name', unitless numbers).
 *
 * Time: tweens start at `at` (default: now) plus `delay`; each target adds its stagger offset.
 * Stagger: a number (seconds per target) or { each, from: 'start' | 'end' | 'center' }.
 * Ownership: a property of an element belongs to the tween segment that started last (like an automatic
 * overwrite); older segments stop writing it.
 * Writes: all style writes of a frame happen in one batch after every tween has advanced. Transforms are
 * written as translate3d while animated and removed once an element is back at rest.
 * Reduced motion: every tween except kind 'color' completes at once (W 05: only colour changes remain).
 */
import { clock } from '../core/clock.js';
import { frame } from '../core/frame.js';
import { store } from '../core/store.js';
import { resolveEase } from './ease.js';
import { DEFAULTS } from './curves.js';

const TRANSFORM = ['x', 'y', 'xPercent', 'yPercent', 'scale', 'scaleX', 'scaleY', 'rotate'];
const CLIP = ['clipTop', 'clipRight', 'clipBottom', 'clipLeft'];
const BASE = {
  x: 0, y: 0, xPercent: 0, yPercent: 0, scale: 1, scaleX: 1, scaleY: 1, rotate: 0,
  opacity: 1, widthPercent: 100, clipTop: 0, clipRight: 0, clipBottom: 0, clipLeft: 0,
};

const records = new WeakMap();
const dirty = new Set();
const running = new Set();
let started = false;

function rec(el) {
  let r = records.get(el);
  if (!r) {
    r = { v: Object.create(null), own: Object.create(null) };
    records.set(el, r);
  }
  return r;
}

function current(el, prop) {
  const r = rec(el);
  if (prop in r.v) return r.v[prop];
  if (prop in BASE) return BASE[prop];
  if (prop.startsWith('--')) {
    const n = parseFloat(getComputedStyle(el).getPropertyValue(prop));
    return Number.isFinite(n) ? n : 0;
  }
  throw new Error(`[v1:motion] unknown property "${prop}"`);
}

const r4 = (x) => Math.round(x * 10000) / 10000;

function write(el) {
  const v = rec(el).v;
  const s = el.style;
  if (TRANSFORM.some((p) => p in v)) {
    const xp = v.xPercent ?? 0;
    const yp = v.yPercent ?? 0;
    const x = v.x ?? 0;
    const y = v.y ?? 0;
    const sc = v.scale ?? 1;
    const sx = (v.scaleX ?? 1) * sc;
    const sy = (v.scaleY ?? 1) * sc;
    const rot = v.rotate ?? 0;
    if (!xp && !yp && !x && !y && sx === 1 && sy === 1 && !rot) {
      s.transform = '';
    } else {
      let t = `translate3d(${r4(xp)}%, ${r4(yp)}%, 0)`;
      if (x || y) t += ` translate3d(${r4(x)}px, ${r4(y)}px, 0)`;
      if (rot) t += ` rotate(${r4(rot)}deg)`;
      if (sx !== 1 || sy !== 1) t += sx === sy ? ` scale(${r4(sx)})` : ` scale(${r4(sx)}, ${r4(sy)})`;
      s.transform = t;
    }
  }
  if ('opacity' in v) s.opacity = v.opacity === 1 ? '' : String(r4(v.opacity));
  if ('widthPercent' in v) s.width = `${r4(v.widthPercent)}%`;
  if (CLIP.some((p) => p in v)) {
    const [t, rr, b, l] = CLIP.map((p) => v[p] ?? 0);
    s.clipPath = !t && !rr && !b && !l ? '' : `inset(${r4(t)}% ${r4(rr)}% ${r4(b)}% ${r4(l)}%)`;
  }
  for (const k in v) if (k.startsWith('--')) s.setProperty(k, String(r4(v[k])));
}

function flush() {
  if (!dirty.size) return;
  for (const el of dirty) write(el);
  dirty.clear();
}

function toList(targets) {
  if (!targets) return [];
  if (targets instanceof Element) return [targets];
  return Array.from(targets).filter(Boolean);
}

function staggerOf(st) {
  if (st == null) return { each: 0, from: 'start' };
  if (typeof st === 'number') return { each: st, from: 'start' };
  return { each: Number(st.each) || 0, from: st.from || 'start' };
}

function orderIndex(i, n, from) {
  if (from === 'end') return n - 1 - i;
  if (from === 'center') return Math.abs(i - (n - 1) / 2);
  return i;
}

const reducedNow = () => store.get('motion:reduced') === true;
let seq = 0;

class Tween {
  constructor(targets, to, o = {}) {
    this.id = ++seq;
    this.targets = toList(targets);
    this.to = { ...to };
    this.fromValues = o.from || null;
    this.duration = Math.max(0, Number.isFinite(o.duration) ? o.duration : DEFAULTS.duration);
    this.easeName = o.ease ?? DEFAULTS.ease;
    this.ease = resolveEase(this.easeName);
    this.start = (Number.isFinite(o.at) ? o.at : clock.s()) + (Number(o.delay) || 0);
    this.kind = o.kind || 'motion';
    this.onComplete = o.onComplete || null;
    this.onUpdate = o.onUpdate || null;
    const { each, from } = staggerOf(o.stagger);
    const n = this.targets.length;
    this.segs = this.targets.map((el, i) => ({ el, offset: each * orderIndex(i, n, from), started: false, done: false, from: null }));
    let maxOff = 0;
    for (const seg of this.segs) if (seg.offset > maxOff) maxOff = seg.offset;
    this.end = this.start + maxOff + this.duration;
    this.state = 'running';
    this.done = new Promise((resolve) => {
      this._resolve = resolve;
    });
    running.add(this);
    if (!n) this._complete(true);
    else if (this.kind !== 'color' && reducedNow()) this.finish();
  }

  _begin(seg) {
    seg.started = true;
    seg.from = {};
    const r = rec(seg.el);
    for (const k in this.to) {
      seg.from[k] = this.fromValues && k in this.fromValues ? this.fromValues[k] : current(seg.el, k);
      r.own[k] = seg;
    }
  }

  _apply(seg, e) {
    const r = rec(seg.el);
    let wrote = false;
    for (const k in this.to) {
      if (r.own[k] !== seg) continue;
      r.v[k] = seg.from[k] + (this.to[k] - seg.from[k]) * e;
      wrote = true;
    }
    if (wrote) dirty.add(seg.el);
  }

  _release(seg) {
    const r = rec(seg.el);
    for (const k in this.to) if (r.own[k] === seg) delete r.own[k];
  }

  tick(t) {
    if (this.state !== 'running') return;
    let all = true;
    for (const seg of this.segs) {
      if (seg.done) continue;
      const local = t - this.start - seg.offset;
      if (local < 0) {
        all = false;
        continue;
      }
      if (!seg.started) this._begin(seg);
      const p = this.duration > 0 ? Math.min(1, local / this.duration) : 1;
      this._apply(seg, this.ease(p));
      if (p >= 1) {
        seg.done = true;
        this._release(seg);
      } else {
        all = false;
      }
    }
    if (this.onUpdate) this.onUpdate(this);
    if (all) this._complete(true);
  }

  /** Jump to the end state now. */
  finish() {
    if (this.state !== 'running') return this;
    for (const seg of this.segs) {
      if (seg.done) continue;
      if (!seg.started) this._begin(seg);
      this._apply(seg, 1);
      seg.done = true;
      this._release(seg);
    }
    flush();
    this._complete(true);
    return this;
  }

  /** Stop where it is. Its promise resolves with false. */
  kill() {
    if (this.state !== 'running') return this;
    for (const seg of this.segs) if (seg.started && !seg.done) this._release(seg);
    this.state = 'killed';
    running.delete(this);
    this._resolve(false);
    return this;
  }

  /** Stop only the segments of these elements. */
  killTargets(set) {
    let left = false;
    for (const seg of this.segs) {
      if (seg.done) continue;
      if (set.has(seg.el)) {
        if (seg.started) this._release(seg);
        seg.done = true;
      } else {
        left = true;
      }
    }
    if (!left) this.kill();
  }

  _complete(ok) {
    if (this.state !== 'running') return;
    this.state = 'done';
    running.delete(this);
    this._resolve(ok);
    if (this.onComplete) {
      try {
        this.onComplete(this);
      } catch (err) {
        console.error('[v1:motion] onComplete failed', err);
      }
    }
  }
}

class Group {
  constructor() {
    this.items = new Set();
  }

  tween(targets, to, o) {
    const tw = new Tween(targets, to, o);
    if (tw.state === 'running') {
      this.items.add(tw);
      tw.done.then(() => this.items.delete(tw));
    }
    return tw;
  }

  set(targets, props) {
    motion.set(targets, props);
  }

  kill() {
    for (const tw of this.items) tw.kill();
    this.items.clear();
  }

  finish() {
    for (const tw of [...this.items]) tw.finish();
  }

  get active() {
    return this.items.size > 0;
  }

  /** Promise for all tweens currently in the group (true when all completed, false if one was killed). */
  all() {
    return Promise.all([...this.items].map((tw) => tw.done)).then((list) => list.every(Boolean));
  }
}

export const motion = {
  init() {
    if (started) return;
    started = true;
    frame.add((t) => {
      for (const tw of running) tw.tick(t);
      flush();
    }, 'motion');
    store.on('motion:reduced', (reduced) => {
      if (reduced) this.finishAll((tw) => tw.kind !== 'color');
    });
  },

  now() {
    return clock.s();
  },

  tween(targets, to, o) {
    return new Tween(targets, to, o);
  },

  set(targets, props) {
    for (const el of toList(targets)) {
      const r = rec(el);
      for (const k in props) {
        delete r.own[k];
        r.v[k] = props[k];
      }
      dirty.add(el);
    }
    flush();
  },

  get(el, prop) {
    return current(el, prop);
  },

  group() {
    return new Group();
  },

  kill(targets) {
    const set = new Set(toList(targets));
    for (const tw of [...running]) tw.killTargets(set);
  },

  finishAll(filter = () => true) {
    for (const tw of [...running]) if (filter(tw)) tw.finish();
  },

  /** Running tweens (leak checks, stage 2 spike S3). */
  count() {
    return running.size;
  },

  /** Introspection for tests: start, end and ease of running tweens. */
  list() {
    return [...running].map((tw) => ({ id: tw.id, start: tw.start, end: tw.end, ease: tw.easeName, duration: tw.duration, targets: tw.targets.length }));
  },
};
