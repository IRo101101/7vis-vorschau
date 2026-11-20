/**
 * Shared visibility observer (IM 4, IM 18): one IntersectionObserver per combination of rootMargin and
 * threshold, for all elements. Unlike the reference the threshold works (PLAN 5 no. 1): an element counts
 * as visible when it intersects and its visible ratio reaches the threshold.
 * Observation starts only after 'intro:done' (all entrances wait for one signal).
 *
 *   const off = visibility.watch(el, ({ visible, ratio, entry }) => {}, { threshold, rootMargin, once })
 */
import { store } from './store.js';

const groups = new Map();
const pending = new Set();
let open = false;
let records = 0;

function keyOf(rootMargin, threshold) {
  return `${rootMargin}|${threshold}`;
}

function groupFor(rootMargin, threshold) {
  const key = keyOf(rootMargin, threshold);
  let g = groups.get(key);
  if (g) return g;
  const byEl = new Map();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const recs = byEl.get(entry.target);
        if (!recs) continue;
        const visible = entry.isIntersecting && entry.intersectionRatio >= threshold - 1e-6;
        for (const rec of [...recs]) {
          if (!rec.live) continue;
          try {
            rec.cb({ visible, ratio: entry.intersectionRatio, entry });
          } catch (err) {
            console.error('[v1:visibility] callback failed', err);
          }
          if (rec.once && visible) detach(rec);
        }
      }
    },
    { rootMargin, threshold: threshold > 0 ? [0, threshold] : [0] },
  );
  g = { key, io, byEl };
  groups.set(key, g);
  return g;
}

function attach(rec) {
  const g = groupFor(rec.rootMargin, rec.threshold);
  rec.group = g;
  let recs = g.byEl.get(rec.el);
  if (!recs) {
    recs = new Set();
    g.byEl.set(rec.el, recs);
    g.io.observe(rec.el);
  }
  recs.add(rec);
}

function detach(rec) {
  if (!rec.live) return;
  rec.live = false;
  records -= 1;
  pending.delete(rec);
  const g = rec.group;
  if (!g) return;
  const recs = g.byEl.get(rec.el);
  if (!recs) return;
  recs.delete(rec);
  if (!recs.size) {
    g.byEl.delete(rec.el);
    g.io.unobserve(rec.el);
  }
  if (!g.byEl.size) {
    g.io.disconnect();
    groups.delete(g.key);
  }
}

store.when('intro:done').then(() => {
  open = true;
  for (const rec of [...pending]) {
    pending.delete(rec);
    if (rec.live) attach(rec);
  }
});

export const visibility = {
  watch(el, cb, { threshold = 0, rootMargin = '0px', once = false } = {}) {
    const rec = { el, cb, threshold: Math.min(1, Math.max(0, Number(threshold) || 0)), rootMargin, once, live: true, group: null };
    records += 1;
    if (open) attach(rec);
    else pending.add(rec);
    return () => detach(rec);
  },

  /** Number of live watch records and observers (leak checks). */
  count() {
    return { records, observers: groups.size };
  },
};
