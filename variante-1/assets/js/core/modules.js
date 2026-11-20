/**
 * Module loader (IM 4 "Modul-Lader"): markup starts behaviour.
 *
 *   <h1 data-mod="headline" data-headline-trigger="page" data-guard>...</h1>
 *
 * data-mod holds one or more module names (space separated). Options are data-<module>-<option>.
 * Each element starts each module once. Module code is loaded on demand (dynamic import), so a page only
 * fetches the modules it uses. Unknown names produce one console warning. A module that fails is skipped,
 * its guard released, the page keeps working.
 *
 * A module file default-exports { name, options, setup(ctx) }. setup gets the context described in
 * CONTRACT.md section 6 and may return an API object (reachable via modules.api(el, name)).
 * Everything a module registers through ctx (listeners, store subscriptions, frame callbacks, visibility
 * watches, observers via ctx.own) is removed automatically when the module is destroyed.
 */
import { load } from '../modules/registry.js';
import { store } from './store.js';
import { frame } from './frame.js';
import { visibility } from './visibility.js';
import { guard } from './guard.js';
import { listen, readOptions } from './dom.js';
import { motion } from '../motion/engine.js';
import { scroll } from '../motion/scroll.js';

const all = new Set();
const byEl = new WeakMap();
const warned = new Set();

function namesOf(el) {
  return (el.getAttribute('data-mod') || '').split(/\s+/).filter(Boolean);
}

function makeContext(inst) {
  const { el, def } = inst;
  const keep = (off) => {
    inst.disposers.push(off);
    return off;
  };
  return {
    el,
    name: def.name,
    opts: readOptions(el, def.name, def.options || {}),
    store,
    motion,
    scroll,
    visibility,
    get reduced() {
      return store.get('motion:reduced') === true;
    },
    onMount: (fn) => inst.q.mount.push(fn),
    onIn: (fn) => inst.q.in.push(fn),
    onOut: (fn, { onlyIfVisible = false } = {}) => inst.q.out.push({ fn, onlyIfVisible }),
    onDestroy: (fn) => inst.q.destroy.push(fn),
    own: (dispose) => keep(dispose),
    listen: (target, type, fn, options) => keep(listen(target, type, fn, options)),
    on: (key, fn) => keep(store.on(key, fn)),
    watch: (target, cb, options) => keep(visibility.watch(target, cb, options)),
    frame: (fn, lane) => keep(frame.add(fn, lane)),
    /* One-shot callbacks remove their own disposer once they ran, so frequent relayouts never pile up. */
    nextFrame: (fn, lane) => {
      const drop = (off) => {
        const i = inst.disposers.indexOf(off);
        if (i >= 0) inst.disposers.splice(i, 1);
      };
      const off = frame.once((t, dt) => {
        drop(off);
        fn(t, dt);
      }, lane);
      inst.disposers.push(off);
      return () => {
        drop(off);
        off();
      };
    },
    /* Watch that replaces the previous one of the same key (page re-entry must not stack watches). */
    watchOnce: (key, target, cb, options) => {
      inst.watches = inst.watches || new Map();
      const prev = inst.watches.get(key);
      if (prev) prev();
      const off = visibility.watch(target, (entry) => {
        if (entry.visible) inst.watches.delete(key);
        cb(entry);
      }, { ...options, once: true });
      inst.watches.set(key, off);
      if (!inst.watchDisposer) {
        inst.watchDisposer = () => {
          for (const stop of inst.watches.values()) stop();
          inst.watches.clear();
        };
        inst.disposers.push(inst.watchDisposer);
      }
      return off;
    },
    hold: () => {
      inst.holdsGuard = true;
    },
    release: () => guard.release(el),
    warn: (...args) => console.warn(`[v1:${def.name}]`, ...args),
  };
}

function create(def, el, page) {
  const inst = {
    def,
    el,
    name: def.name,
    page: null,
    q: { mount: [], in: [], out: [], destroy: [] },
    disposers: [],
    api: null,
    mounted: false,
    entered: false,
    holdsGuard: false,
  };
  page.adopt(inst);
  try {
    inst.api = def.setup(makeContext(inst)) || null;
  } catch (err) {
    console.error(`[v1] module "${def.name}" failed in setup`, err);
    destroyInstance(inst);
    guard.release(el);
    return null;
  }
  all.add(inst);
  return inst;
}

function destroyInstance(inst) {
  for (const fn of inst.q.destroy.slice().reverse()) {
    try {
      fn();
    } catch (err) {
      console.error(`[v1] destroy of "${inst.name}" failed`, err);
    }
  }
  for (const off of inst.disposers.splice(0).reverse()) {
    try {
      off();
    } catch (err) {
      console.error(`[v1] cleanup of "${inst.name}" failed`, err);
    }
  }
  inst.q = { mount: [], in: [], out: [], destroy: [] };
  if (inst.page) inst.page.release(inst);
  all.delete(inst);
  const map = byEl.get(inst.el);
  if (map && map.get(inst.name) === inst) map.delete(inst.name);
}

export const modules = {
  /**
   * Start all modules in root (root included). pageFor(el) decides which page owns a module.
   * Resolves with the created instances after their mount queues ran.
   */
  async start(root, pageFor) {
    if (!root || root.nodeType !== 1) return [];
    const els = root.matches('[data-mod]') ? [root] : [];
    els.push(...root.querySelectorAll('[data-mod]'));
    const jobs = [];
    for (const el of els) {
      let map = byEl.get(el);
      if (!map) {
        map = new Map();
        byEl.set(el, map);
      }
      for (const name of namesOf(el)) {
        if (map.has(name)) continue;
        map.set(name, 'pending');
        jobs.push({ el, name, map });
      }
    }
    if (!jobs.length) return [];
    const defs = await Promise.all(
      jobs.map((j) =>
        load(j.name).catch((err) => {
          console.error(`[v1] module "${j.name}" could not be loaded`, err);
          return null;
        }),
      ),
    );
    const created = [];
    const touched = new Map();
    jobs.forEach((job, i) => {
      const def = defs[i];
      if (!def) {
        job.map.delete(job.name);
        if (!warned.has(job.name)) {
          warned.add(job.name);
          console.warn(`[v1] unknown module "${job.name}"`);
        }
        guard.release(job.el);
        return;
      }
      if (!job.el.isConnected) {
        job.map.delete(job.name);
        return;
      }
      const inst = create(def, job.el, pageFor(job.el));
      if (inst) {
        job.map.set(job.name, inst);
        created.push(inst);
        touched.set(job.el, (touched.get(job.el) || false) || inst.holdsGuard);
      } else {
        job.map.delete(job.name);
      }
    });
    for (const inst of created) inst.page.mount(inst);
    for (const [el, held] of touched) guard.afterSetup(el, held);
    return created;
  },

  /** Destroy all modules whose element is root or inside root. */
  stop(root) {
    let n = 0;
    for (const inst of [...all]) {
      if (inst.el === root || (root.contains && root.contains(inst.el))) {
        destroyInstance(inst);
        n += 1;
      }
    }
    return n;
  },

  /** Destroy all modules of a page. */
  stopPage(page) {
    for (const inst of [...page.instances]) destroyInstance(inst);
  },

  /** API object a module returned from setup, or null. */
  api(el, name) {
    const inst = byEl.get(el)?.get(name);
    return inst && inst !== 'pending' ? inst.api : null;
  },

  count() {
    let disposers = 0;
    for (const inst of all) disposers += inst.disposers.length;
    return { instances: all.size, disposers };
  },
};
