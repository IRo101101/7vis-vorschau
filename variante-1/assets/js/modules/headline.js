/**
 * headline: giant title entrance (IM 10 row "unmask", IM 11.1; PLAN 5 no. 8 and 9).
 *
 * Markup, two modes:
 *   explicit lines   <h1 class="t-riesig" data-mod="headline" data-guard>
 *                      <span data-headline-line>Für uns ist Kaffee</span>
 *                      <span data-headline-line>angewandte Physik.</span></h1>
 *                    each line also scales 0.9 -> 1 (1.8 s) from the edge it comes from
 *   automatic lines  <h2 class="t-riesig" data-mod="headline" data-guard>Keine Zufälle.</h2>
 *                    lines come from the layout and are re-measured on every line-break change
 *
 * Characters rise out of their masks, line 1 from below, line 2 from above and so on (data-headline-from
 * = alternate | below | above). Duration 1.2, 0.02 per character, 0.12 per line, delay 0.15, curve "titel".
 * Trigger: 'view' (default, once when visible) or 'page' (page-in queue, with exit on page-out:
 * 0.6 s, 0.01 per character from the end, 0.06 per line, power3.in, scale back to 0.9).
 * Giant titles fit their longest word to the width (data-headline-fit, default on). With
 * data-headline-fit-lines every explicit line stays on one row at the breakpoints of
 * data-headline-fit-lines-at (default "d t"); below them the words fit and lines may wrap, as the reference
 * title does on phones (stage 3, hero claim).
 * Reduced motion: nothing is split, the text stands as in the HTML.
 */
import { splitText } from '../text/split.js';
import { fitWords, fitLines } from '../text/fit.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.headline;
const LINE = '[data-headline-line]';

export default {
  name: 'headline',
  options: {
    trigger: 'view',
    from: 'alternate',
    fit: true,
    fitLines: false,
    fitLinesAt: 'd t',
    delay: T.delay,
    duration: T.duration,
    stagger: T.lineStagger,
    charStagger: T.charStagger,
    ease: T.ease,
    scaleFrom: T.scaleFrom,
    scaleDuration: T.scaleDuration,
    exitDuration: T.exit.duration,
    exitStagger: T.exit.lineStagger,
    exitCharStagger: T.exit.charStagger,
    exitEase: T.exit.ease,
    threshold: 0,
    rootMargin: '0px',
  },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const g = motion.group();
    let sp = null;
    let state = 'static';
    let scheduled = false;

    const api = {
      play: () => play(),
      exit: () => exit(),
      replay: () => replay(),
      settle: () => settle(),
      relayout: () => relayout(),
      get state() {
        return state;
      },
      get split() {
        return sp;
      },
    };

    if (ctx.reduced) return api;
    const explicit = !!el.querySelector(LINE);
    sp = splitText(el, { lineSelector: explicit ? LINE : null });
    if (!sp) {
      ctx.warn('element cannot be split (interactive content?), left as plain text', el);
      return api;
    }
    if (explicit) sp.lineEls.forEach((line) => line.classList.add('hl-line'));
    state = 'hidden';

    const dir = (i) => (opts.from === 'below' ? 1 : opts.from === 'above' ? -1 : i % 2 === 0 ? 1 : -1);
    const startPercent = () => (sp.clearance ? sp.clearance.startPercent : 130);

    function applyStart() {
      const s = startPercent();
      sp.lines.forEach((line, i) => {
        motion.set(line.chars.map((c) => c.inner), { yPercent: dir(i) * s });
        if (explicit && line.el) {
          line.el.style.transformOrigin = dir(i) > 0 ? '0% 100%' : '0% 0%';
          motion.set(line.el, { scale: opts.scaleFrom });
        }
      });
    }

    function fit() {
      const bp = ctx.store.get('viewport')?.bp;
      if (explicit && opts.fitLines && String(opts.fitLinesAt).split(/\s+/).includes(bp)) {
        // Two passes: the second one measures the words at the size the first one set.
        fitLines(el, sp);
        fitLines(el, sp);
      } else if (opts.fit) {
        fitWords(el, sp);
      }
    }

    function relayout() {
      if (!sp) return;
      fit();
      sp.measure();
      sp.measureClearance();
      if (state === 'hidden') applyStart();
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      ctx.nextFrame(() => {
        scheduled = false;
        relayout();
      }, 'input');
    }

    function play() {
      if (!sp || state === 'playing' || state === 'shown') return Promise.resolve(true);
      g.kill();
      state = 'playing';
      const t0 = motion.now();
      sp.lines.forEach((line, i) => {
        const timing = { at: t0, delay: opts.delay + i * opts.stagger };
        g.tween(line.chars.map((c) => c.inner), { yPercent: 0 }, { ...timing, duration: opts.duration, ease: opts.ease, stagger: opts.charStagger });
        if (explicit && line.el) g.tween(line.el, { scale: 1 }, { ...timing, duration: opts.scaleDuration, ease: opts.ease });
      });
      return g.all().then((ok) => {
        if (ok && state === 'playing') state = 'shown';
        return ok;
      });
    }

    function exit() {
      if (!sp || state === 'hidden') return Promise.resolve(true);
      g.kill();
      state = 'exiting';
      const s = startPercent();
      const t0 = motion.now();
      sp.lines.forEach((line, i) => {
        const timing = { at: t0, delay: i * opts.exitStagger };
        g.tween(line.chars.map((c) => c.inner), { yPercent: dir(i) * s }, {
          ...timing,
          duration: opts.exitDuration,
          ease: opts.exitEase,
          stagger: { each: opts.exitCharStagger, from: 'end' },
        });
        if (explicit && line.el) g.tween(line.el, { scale: opts.scaleFrom }, { ...timing, duration: opts.exitDuration, ease: opts.exitEase });
      });
      return g.all().then((ok) => {
        if (ok && state === 'exiting') state = 'hidden';
        return ok;
      });
    }

    function replay() {
      if (!sp || ctx.reduced) return Promise.resolve(true);
      g.kill();
      state = 'hidden';
      applyStart();
      return play();
    }

    function settle() {
      if (!sp) return;
      if (state !== 'playing' && state !== 'shown') {
        state = 'hidden';
        play();
      }
      g.finish();
    }

    // First measurement now (fallback fonts), the final one after fonts are ready (intro waits for them).
    relayout();
    ctx.release();

    ctx.on('layout:change', schedule);
    ctx.on('motion:reduced', (reduced) => reduced && settle());
    ctx.on('motion:settle', settle);
    ctx.on('motion:replay', replay);
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      schedule();
    });
    ro.observe(el);
    ctx.own(() => ro.disconnect());

    if (opts.trigger === 'page') {
      ctx.onIn(() => {
        relayout();
        play();
      });
      ctx.onOut(() => exit(), { onlyIfVisible: true });
    } else {
      ctx.onIn(() => {
        relayout();
        if (state !== 'hidden') return;
        ctx.watchOnce('entrance', el, ({ visible }) => visible && play(), { threshold: opts.threshold, rootMargin: opts.rootMargin });
      });
    }

    ctx.onDestroy(() => {
      g.kill();
      if (sp) sp.restore();
      el.style.removeProperty('--titel-fit');
      sp = null;
      state = 'static';
    });

    return api;
  },
};
