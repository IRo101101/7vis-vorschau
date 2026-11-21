/**
 * image-drift: background pictures that travel slower than the page (IM 11.9 "parallax", PLAN 5 no. 23
 * "Bild-Parallax übernehmen"; correction A, finding 4).
 *
 * Markup:
 *   <div data-mod="image-drift" data-image-drift-root=".stretch">      container, clips (CSS overflow hidden)
 *     <div data-image-drift-target> pictures, 120 % of the container high, top aligned (CSS) </div>
 *   </div>
 *
 * Over the whole root (the closest ancestor matching data-image-drift-root, else the parent), from its top
 * edge at the bottom of the viewport to its bottom edge at the top, the target travels from -travel % of
 * the container height to 0, eased with smoothstep, so the picture moves down against the page while the
 * page moves up. Off for coarse pointers and under reduced motion, as in the reference (IM 11.9); the
 * picture then stands at 0.
 */
import { TIMING } from '../motion/curves.js';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default {
  name: 'image-drift',
  options: { travel: TIMING.imageDrift.travel, root: '' },

  setup(ctx) {
    const { el, opts, motion, store } = ctx;
    const targets = [...el.querySelectorAll('[data-image-drift-target]')];
    if (!targets.length) return null;
    const root = (opts.root && el.closest(opts.root)) || el.parentElement || el;
    let last = null;
    let progress = 0;

    const active = () => !ctx.reduced && !(store.get('viewport') || {}).coarse;

    function update() {
      let v = 0;
      if (active()) {
        const r = root.getBoundingClientRect();
        const vh = innerHeight;
        const p = clamp((vh - r.top) / (r.height + vh), 0, 1);
        const s = p * p * (3 - 2 * p);
        progress = p;
        v = Math.round(-(opts.travel / 100) * el.clientHeight * (1 - s) * 100) / 100;
      }
      if (v === last) return;
      motion.set(targets, { y: v });
      last = v;
    }

    ctx.own(ctx.scroll.on(update));
    const again = () => ctx.nextFrame(update, 'scroll');
    ctx.on('viewport', again);
    ctx.on('layout:change', again);
    ctx.on('motion:reduced', again);
    ctx.on('page:in', again);
    update();

    ctx.onDestroy(() => {
      motion.set(targets, { y: 0 });
      for (const t of targets) {
        t.style.removeProperty('transform');
        if (!t.getAttribute('style')) t.removeAttribute('style');
      }
      last = null;
    });

    return {
      get offset() {
        return last || 0;
      },
      get progress() {
        return progress;
      },
      get active() {
        return active();
      },
      update,
    };
  },
};
