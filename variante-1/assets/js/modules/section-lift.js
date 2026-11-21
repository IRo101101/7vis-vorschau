/**
 * section-lift: a section that starts lower and catches up while it scrolls in (IM 11.9 "section-parallax",
 * PLAN 4 row 5b: "Sektion startet 12 % tiefer und holt auf").
 *
 *   <section data-mod="section-lift" data-section-lift-offset="12">…</section>
 *
 * While the section's layout top travels from the bottom to the top edge of the viewport, its offset goes
 * from offset % of its own height to 0, eased with smoothstep; above and below that range it is 0 and
 * offset %. The section clips its own content (CSS overflow: clip). Linear with the native scroll position
 * of every frame (Lenis drives the scroll lane), so the edge never lags behind the page.
 * Off for coarse pointers (touch) and under reduced motion, as in the reference; the section then stands
 * where the layout puts it.
 */
import { TIMING } from '../motion/curves.js';

export default {
  name: 'section-lift',
  options: { offset: TIMING.sectionLift.offset },

  setup(ctx) {
    const { el, opts, motion, store } = ctx;
    let last = null;

    const active = () => !ctx.reduced && !(store.get('viewport') || {}).coarse;

    function update() {
      if (!active()) {
        if (last !== 0) {
          motion.set(el, { yPercent: 0 });
          last = 0;
        }
        return;
      }
      const h = el.offsetHeight;
      const vh = innerHeight;
      if (!h || !vh) return;
      // Layout top: the visual top minus the offset written last.
      const top = el.getBoundingClientRect().top - ((last || 0) / 100) * h;
      const p = Math.min(1, Math.max(0, (vh - top) / vh));
      const s = p * p * (3 - 2 * p);
      const v = Math.round(opts.offset * (1 - s) * 1000) / 1000;
      if (v === last) return;
      motion.set(el, { yPercent: v });
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
      motion.set(el, { yPercent: 0 });
      el.style.removeProperty('transform');
      last = null;
    });

    return {
      get offset() {
        return last || 0;
      },
      get active() {
        return active();
      },
      update,
    };
  },
};
