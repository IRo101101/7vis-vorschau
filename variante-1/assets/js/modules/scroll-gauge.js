/**
 * scroll-gauge: the own scroll indicator of the shell (IM 11.14 "scroll-indicator", refmedia v1 F9 and
 * clips/checks scrollIndicator, PLAN 5 no. 6, PLAN 11 "Nativer Scrollbalken").
 *
 * Markup (shell, outside [data-view]; decoration without text):
 *   <div class="pegel" data-mod="scroll-gauge" aria-hidden="true" data-needs-core>
 *     <span class="pegel__balken" data-scroll-gauge-bar></span></div>
 *
 * A rail on the right edge, 80vh high and centred (CSS), from 480 px. The bar is the viewport's share of the
 * document, kept between 10 and 25 % of the rail; its position is the scroll progress (Lenis, or the native
 * position without it) times the free travel, rail minus bar (recording: 900 / 8076 gives 80 px, y 3000 of
 * 7176 gives 267.5 px). It fades in when the page moves (0.5 s) and out 0.5 s after the last scroll
 * movement (0.5 s), both power4.out as sampled in the recording.
 * While it runs, <html data-scroll-gauge="an"> keeps the native scrollbar hidden (modules.css); the native
 * bar is there without script, when the core fails (CSS time limit as for the guard), under reduced motion,
 * below 480 px and after destroy ("aus" or no attribute).
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.scrollGauge;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default {
  name: 'scroll-gauge',
  options: { fade: T.fade, ease: T.ease, idleMs: T.idleMs, minShare: T.minShare, maxShare: T.maxShare, offAt: 'm' },

  setup(ctx) {
    const { el, opts, store, motion, scroll } = ctx;
    const bar = el.querySelector('[data-scroll-gauge-bar]');
    if (!bar) return null;
    const html = document.documentElement;
    const g = motion.group();
    let on = null;
    let shown = false;
    let lastMove = 0;
    let rail = 0;
    let barH = 0;
    let lastY = null;
    let lastLimit = null;
    let moves = 0;

    const wanted = () => !ctx.reduced && !String(opts.offAt).split(/\s+/).includes((store.get('viewport') || {}).bp);

    function fade(to) {
      g.kill();
      shown = to > 0;
      g.tween(el, { opacity: to }, { duration: opts.fade, ease: opts.ease });
    }

    function place(s, force) {
      if (!on) return;
      const limit = s ? s.limit : Math.max(0, html.scrollHeight - innerHeight);
      const y = s ? s.y : scroll.y();
      if (!force && y === lastY && limit === lastLimit) return;
      if (force || limit !== lastLimit || !rail) {
        rail = el.clientHeight;
        const share = clamp(innerHeight / (limit + innerHeight), opts.minShare, opts.maxShare);
        barH = Math.round(share * rail * 100) / 100;
        bar.style.blockSize = `${barH}px`;
      }
      lastLimit = limit;
      lastY = y;
      const p = limit > 0 ? clamp(y / limit, 0, 1) : 0;
      motion.set(bar, { y: Math.round(p * (rail - barH) * 1000) / 1000 });
    }

    function onScroll(s) {
      if (!on) return;
      const moved = lastY !== null && s.y !== lastY;
      place(s, false);
      if (!moved) return;
      moves += 1;
      lastMove = motion.now();
      if (!shown) fade(1);
    }

    function evaluate() {
      const next = wanted();
      if (next === on) {
        if (on) place(null, true);
        return;
      }
      on = next;
      html.setAttribute('data-scroll-gauge', on ? 'an' : 'aus');
      g.kill();
      shown = false;
      motion.set(el, { opacity: 0 });
      if (on) {
        lastY = null;
        place(null, true);
      }
    }

    ctx.own(scroll.on(onScroll));
    ctx.frame(() => {
      if (on && shown && motion.now() - lastMove >= opts.idleMs / 1000) fade(0);
    }, 'late');
    const later = () => ctx.nextFrame(evaluate, 'input');
    ctx.on('viewport', later);
    ctx.on('motion:reduced', later);
    ctx.on('layout:change', later);
    ctx.on('transition:settled', later);
    evaluate();

    ctx.onDestroy(() => {
      g.kill();
      html.removeAttribute('data-scroll-gauge');
      for (const n of [el, bar]) {
        for (const p of ['opacity', 'transform', 'block-size']) n.style.removeProperty(p);
        if (!n.getAttribute('style')) n.removeAttribute('style');
      }
    });

    return {
      get on() {
        return on === true;
      },
      get shown() {
        return shown;
      },
      get bar() {
        return barH;
      },
      get rail() {
        return rail;
      },
      get moves() {
        return moves;
      },
    };
  },
};
