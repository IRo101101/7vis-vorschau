/**
 * intro: the "Auftakt" of the home page (storyboard section 0, IM 8, PLAN 5 no. 13). Shell element that
 * covers the page on the first load of the home page only (the reference shows its preloader only there,
 * refmedia v1 F1) and releases every entrance when it ends.
 *
 * Markup (outside [data-view]; carries data-intro-owner, so the core waits for this module's 'intro:done'):
 *   <div class="auftakt" data-mod="intro" data-intro-owner data-theme="invers">
 *     <p class="nur-vorlesen" role="status">Die Seite lädt.</p>
 *     <div aria-hidden="true">… <span data-intro-strip><span>01</span> … <span>07</span></span> …</div>
 *     <div data-intro-mark aria-hidden="true"> six [data-intro-band] slices of the word mark </div>
 *     <div data-intro-line aria-hidden="true"></div>
 *   </div>
 *
 * Mechanics of the reference (IM 8, recorded in refmedia v1 clips/preloader-home-*):
 *   - starts after fonts are ready plus one frame; the word mark grows in six vertical bands from below
 *     (1.8 s, 0.08 s apart, from 0.07 s), shrinking from 1.4 to 1 and rising 30 px; the count slides into
 *     its mask from above (from 0.17 s, 1.1 s); the progress line grows from the left
 *   - at the end 'intro:done' is set (T), two frames later the curtain opens upwards: the bottom edge of
 *     the layer moves to the top with clip-path in 0.9 s (curve "vorhang"); entrances start at T
 * Our own (PLAN 5 no. 13, the reference's flaws F2 to F4 are not rebuilt):
 *   - real progress instead of a simulated curve: fonts, the page load and the WebGL layer
 *     ('webgl:progress', 'webgl:ready'; a page without WebGL, or WebGL off, counts as loaded at once),
 *     weighted by TIMING.intro.weights. The displayed value follows it, never faster than one full sweep in
 *     sweepMin, so the count 01 to 07 can be read. The count is a strip of the seven numbers in the HTML
 *     that moves one row per seventh (0.6 s, "streifen").
 *   - time limit: after `limit` seconds the intro ends whatever is still loading (WebGL then appears later
 *     or never; the still stands in); a second, real-time backstop ends it even if frames stall. If the
 *     core ends the intro first (its own limit), the curtain opens at once.
 *   - the layer is shown by CSS from the first paint (no flash of the page, F4) and hides itself after a CSS
 *     time limit if no script ever runs; boot failure hides it at once.
 *   - reduced motion: no intro at all, the page is there at once.
 * Lenis is stopped while the layer covers the page.
 */
import { TIMING } from '../motion/curves.js';
import { fontsSettled } from '../core/fonts.js';
import { wait } from '../core/dom.js';

const T = TIMING.intro;
const FONT_LIMIT_MS = 3000;

export default {
  name: 'intro',
  options: {
    limit: T.limit,
    sweep: T.sweepMin,
  },

  setup(ctx) {
    const { el, opts, store, motion, scroll } = ctx;
    const strip = el.querySelector('[data-intro-strip]');
    const mark = el.querySelector('[data-intro-mark]');
    const bands = [...el.querySelectorAll('[data-intro-band]')];
    const line = el.querySelector('[data-intro-line]');
    const rows = strip ? strip.children.length : 0;
    const g = motion.group();
    const html = document.documentElement;

    let phase = 'warten';
    let shown = 0;
    // Row 1 ("01") is where the entrance of the strip ends; later rows follow the progress.
    let step = 1;
    let entered = false;
    let limitReached = false;
    let finishedAt = null;
    let startedAt = null;
    const parts = { fonts: 0, load: document.readyState === 'complete' ? 1 : 0 };
    const stats = { started: null, ended: null, curtainEnd: null, reason: null, progressAtEnd: null };

    const setPhase = (p) => {
      phase = p;
      el.setAttribute('data-intro-state', p);
    };

    function hide() {
      el.hidden = true;
      setPhase('fertig');
    }

    // Not the first view of this document (the intro already ran, or a page change brought us here): nothing.
    if (store.get('intro:done')) {
      hide();
      return { get phase() { return phase; }, stats };
    }

    // From now on the script owns the layer: the CSS time limit for a dead script steps back.
    setPhase('laedt');

    /* ---------- real progress ---------- */

    const hasWebgl = () => !!document.querySelector('[data-mod~="webgl"]');
    function webglPart() {
      if (!hasWebgl()) return 1;
      const state = html.getAttribute('data-webgl');
      if (state === 'aus' || state === 'statisch' || state === 'verloren') return 1;
      if (store.get('webgl:ready') === true || store.get('webgl:level') === 'statisch') return 1;
      const p = Number(store.get('webgl:progress'));
      return Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
    }
    function real() {
      if (limitReached) return 1;
      const w = T.weights;
      return Math.min(1, w.fonts * parts.fonts + w.load * parts.load + w.webgl * webglPart());
    }

    ctx.listen(window, 'load', () => {
      parts.load = 1;
    });

    /* ---------- end ---------- */

    function curtain() {
      if (phase === 'vorhang' || phase === 'fertig') return;
      setPhase('vorhang');
      let frames = T.curtainFrames;
      const go = () => {
        if (frames > 0) {
          frames -= 1;
          ctx.nextFrame(go, 'late');
          return;
        }
        g.tween(el, { clipBottom: 100 }, {
          duration: T.curtainDuration,
          ease: T.curtainEase,
          onComplete: () => {
            stats.curtainEnd = performance.now();
            motion.set(el, { clipBottom: 0 });
            hide();
          },
        });
      };
      go();
    }

    function end(reason) {
      if (phase !== 'laedt' && phase !== 'laeuft') return;
      stats.ended = performance.now();
      stats.reason = reason;
      stats.progressAtEnd = Math.round(shown * 1000) / 1000;
      scroll.start();
      store.set('intro:done', true);
      curtain();
    }

    // The core may end the intro on its own limit: then the curtain opens at once.
    ctx.on('intro:done', (done) => {
      if (!done) return;
      if (phase === 'laedt' || phase === 'laeuft') {
        stats.ended = performance.now();
        stats.reason = stats.reason || 'core';
        scroll.start();
        curtain();
      }
    });

    /* ---------- reduced motion: no intro ---------- */

    if (ctx.reduced) {
      hide();
      fontsSettled(FONT_LIMIT_MS).then(() => {
        stats.reason = 'reduced';
        store.set('intro:done', true);
      });
      return { get phase() { return phase; }, stats };
    }

    /* ---------- start ---------- */

    scroll.stop();
    if (strip) motion.set(strip, { yPercent: 100 / Math.max(1, rows) });
    if (mark) motion.set(mark, { scale: T.markScaleFrom, y: T.markYFrom });
    for (const b of bands) motion.set(b, { clipTop: 100 });
    if (line) motion.set(line, { scaleX: 0 });

    function start() {
      if (phase !== 'laedt') return;
      setPhase('laeuft');
      stats.started = performance.now();
      startedAt = motion.now();
      const t0 = startedAt;
      if (mark) g.tween(mark, { scale: 1, y: 0 }, { at: t0, delay: T.markAt, duration: T.markDuration, ease: T.ease });
      if (bands.length) g.tween(bands, { clipTop: 0 }, { at: t0, delay: T.markAt, duration: T.markDuration, ease: T.ease, stagger: T.markStagger });
      if (strip) {
        g.tween(strip, { yPercent: 0 }, {
          at: t0,
          delay: T.countAt,
          duration: T.textDuration,
          ease: T.ease,
          onComplete: () => {
            entered = true;
          },
        });
      }
    }

    // Displayed progress: follows the real one, at most one full sweep per `sweep` seconds.
    ctx.frame((t, dt) => {
      if (phase !== 'laeuft') return;
      const goal = real();
      const next = Math.min(goal, shown + Math.max(0, dt) / Math.max(0.1, opts.sweep));
      if (next !== shown) {
        shown = next;
        if (line) motion.set(line, { scaleX: shown });
      }
      const k = Math.min(rows, Math.max(1, Math.ceil(shown * rows - 1e-6)));
      if (strip && k !== step && (entered || motion.now() - startedAt >= T.countAt)) {
        step = k;
        g.tween(strip, { yPercent: (-(k - 1) * 100) / rows }, { duration: T.countStepDuration, ease: T.countStepEase });
      }
      if (shown >= 1 && finishedAt === null) finishedAt = motion.now();
      if (finishedAt !== null && motion.now() - finishedAt >= T.hold) end(limitReached ? 'limit' : 'loaded');
    }, 'late');

    fontsSettled(FONT_LIMIT_MS).then(() => {
      parts.fonts = 1;
      ctx.nextFrame(start, 'late');
    });

    // Time limit (real time, independent of frames): progress counts as complete; backstop if frames stall.
    let alive = true;
    ctx.own(() => {
      alive = false;
    });
    wait(opts.limit * 1000).then(() => {
      if (!alive) return;
      limitReached = true;
      if (phase === 'laedt') start();
    });
    wait((opts.limit + opts.sweep + 1) * 1000).then(() => {
      if (alive) end('backstop');
    });

    ctx.onDestroy(() => {
      g.kill();
      if (phase !== 'fertig') scroll.start();
    });

    return {
      get phase() {
        return phase;
      },
      get progress() {
        return { shown, real: real(), step, parts: { ...parts, webgl: webglPart() }, limitReached };
      },
      stats,
    };
  },
};
