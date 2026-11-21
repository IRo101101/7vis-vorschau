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
 *   - time limit, counted from navigation start (stage 7; performance.now() is navigation relative): the
 *     curtain is open `limit` seconds after the navigation at the latest, so the claim is never covered
 *     longer, however late the script arrives (1.6 Mbit/s, 300 ms RTT: the module ran only after 4.7 s and
 *     the old limit, counted from setup, kept the claim covered until 10.3 s). From `limit` minus curtain,
 *     sweep and hold on the progress counts as complete; at `limit` minus the curtain the intro ends in any
 *     case (real time, also when frames stall); a script that comes too late for a curtain hides the layer
 *     at once, and one that finds the layer already hidden by the CSS limit leaves it hidden. If the core
 *     ends the intro first (its own limit), the curtain opens at once.
 *   - the layer is shown by CSS from the first paint (no flash of the page, F4) and hides itself after a CSS
 *     time limit (3.5 s after the first paint, the only clock CSS has) if no script takes over; boot failure
 *     hides it at once. Titles whose guard the CSS limit already showed stay as they are (core/guard.js).
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
    // Navigation-relative deadlines in ms: curtain open at `limit`, intro end (T) at `latestEnd` at the latest.
    const limitMs = opts.limit * 1000;
    const curtainMs = T.curtainDuration * 1000 + T.curtainFrames * 17;
    const latestEnd = limitMs - curtainMs;
    const softAt = latestEnd - (opts.sweep + T.hold) * 1000;
    const now = () => performance.now();
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

    // The script came late: the CSS limit already hid the layer, or there is no time left for a curtain
    // before the limit. The page has been there (or is there now) without the intro; it stays that way.
    const cssGaveUp = !ctx.reduced && getComputedStyle(el).visibility === 'hidden';
    if (!ctx.reduced && (cssGaveUp || now() >= latestEnd)) {
      const left = limitMs - now();
      stats.reason = cssGaveUp ? 'css' : 'spaet';
      stats.started = stats.ended = now();
      if (cssGaveUp || left < 400) {
        hide();
        stats.curtainEnd = now();
      } else {
        setPhase('vorhang');
        g.tween(el, { clipBottom: 100 }, {
          duration: (left - 2 * 17) / 1000,
          ease: T.curtainEase,
          onComplete: () => {
            stats.curtainEnd = now();
            motion.set(el, { clipBottom: 0 });
            hide();
          },
        });
        wait(left + 300).then(() => {
          if (phase !== 'fertig') {
            motion.set(el, { clipBottom: 0 });
            hide();
          }
        });
      }
      store.set('intro:done', true);
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
      // Late end (the frames were slow or the core ended it): the curtain is shorter, never past the limit.
      const left = limitMs - now();
      if (left < curtainMs) {
        if (left < 400) {
          stats.curtainEnd = now();
          hide();
          return;
        }
        g.tween(el, { clipBottom: 100 }, {
          duration: (left - 2 * 17) / 1000,
          ease: T.curtainEase,
          onComplete: () => {
            stats.curtainEnd = now();
            motion.set(el, { clipBottom: 0 });
            hide();
          },
        });
        return;
      }
      // The opening shows `curtainFrames` frames after T: the tween starts one frame before that. Only real
      // frames count (a callback added while a frame runs fires in that same frame, so a plain chain of
      // nextFrame calls collapsed into the frame of T, and a long frame at T then ate into the opening).
      let frames = Math.max(0, T.curtainFrames - 1);
      let last = motion.now();
      const go = () => {
        if (frames > 0) {
          const stop = ctx.frame((t) => {
            if (t <= last) return;
            last = t;
            frames -= 1;
            if (frames > 0) return;
            stop();
            go();
          }, 'late');
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

    // Displayed progress: follows the real one, at most one full sweep per `sweep` seconds. The first frame
    // after the start only sets the base: the delta of that frame can hold time from before the start (a frame
    // that began before a long boot task), which made the sweep up to 0.18 s shorter than `sweep`.
    let counting = false;
    ctx.frame((t, dt) => {
      if (phase !== 'laeuft') return;
      const goal = real();
      const delta = counting ? Math.max(0, dt) : 0;
      counting = true;
      const next = Math.min(goal, shown + delta / Math.max(0.1, opts.sweep));
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

    // Time limits (real time, from navigation start, independent of frames): progress counts as complete at
    // softAt; the intro ends at latestEnd whatever the frames do; the layer is gone shortly after the limit.
    let alive = true;
    ctx.own(() => {
      alive = false;
    });
    wait(Math.max(0, softAt - now())).then(() => {
      if (!alive) return;
      limitReached = true;
      if (phase === 'laedt') start();
    });
    wait(Math.max(0, latestEnd - now())).then(() => {
      if (alive) end('limit');
    });
    wait(Math.max(0, limitMs + 300 - now())).then(() => {
      if (!alive || phase === 'fertig') return;
      g.kill();
      motion.set(el, { clipBottom: 0 });
      stats.curtainEnd = now();
      hide();
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
