/**
 * fold-card: the mini card (IM 11.4, PLAN 5 no. 17).
 *
 * Markup (complete and visible without script):
 *   <article class="karte" data-mod="fold-card" data-guard>
 *     <div class="karte__traeger" data-fold-card-carrier>       content, gets a fixed px width while folding
 *       <div class="karte__text">
 *         <p class="kraft-marker">...<span data-fold-card-line>03 · Verdichten</span></p>
 *         ... more [data-fold-card-line] (a link may itself be a line)
 *       </div>
 *       <div class="karte__bild" data-fold-card-image>...</div>
 *     </div>
 *   </article>
 * The card's width comes from its container (CSS width 100 %), never from its content.
 *
 * Mode "unfold" (default): width 33 % -> 100 % and y 64 px -> 0 in 1.0 s (curve "karte"), opacity in
 * 0.75 s (power1.out). The image opens from the bottom up (clip, 1.0 s, "karte-bild"; opacity 0.6 s),
 * starting when the growing edge reaches the image (inverse of the curve) plus 0.35 s. Line i starts at
 * 0.35 + 0.1 i: characters 1.0 s, 0.01 s apart, "karte-text". Afterwards the carrier is flexible again.
 * Mode "fade" (data-fold-card-reveal="fade"): no width change; card fades in from 0.5 s in 1.2 s
 * (expo.out); each line rises as a whole from 200 % plus the character wave, lines from 0.3 s, 0.04 apart.
 * Page-out: opacity 0, width 33 %, y 64 in 0.4 s (power3.in). Trigger: once when visible.
 * Reduced motion: nothing moves, the card stands as in the HTML.
 */
import { splitText } from '../text/split.js';
import { invertEase } from '../motion/ease.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.foldCard;

export default {
  name: 'fold-card',
  options: {
    reveal: 'unfold',
    delay: 0,
    duration: T.duration,
    ease: T.ease,
    widthFrom: T.widthFrom,
    yFrom: T.yFrom,
    opacityDuration: T.opacityDuration,
    opacityEase: T.opacityEase,
    imageDuration: T.imageDuration,
    imageEase: T.imageEase,
    imageOpacityDuration: T.imageOpacityDuration,
    imageDelay: T.imageDelay,
    textDelay: T.textDelay,
    stagger: T.lineStagger,
    textDuration: T.textDuration,
    textEase: T.textEase,
    charStagger: T.charStagger,
    fadeDelay: T.fade.delay,
    fadeDuration: T.fade.duration,
    fadeEase: T.fade.ease,
    riseFrom: T.fade.riseFrom,
    fadeTextDelay: T.fade.textDelay,
    fadeStagger: T.fade.lineStagger,
    exitDuration: T.exit.duration,
    exitEase: T.exit.ease,
    threshold: 0,
    rootMargin: '0px',
  },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const g = motion.group();
    const fade = opts.reveal === 'fade';
    const carrier = el.querySelector('[data-fold-card-carrier]');
    const image = el.querySelector('[data-fold-card-image]');
    let lines = [];
    let state = 'static';
    let width = 0;
    let imageRatio = 0;
    let scheduled = false;

    const api = {
      play: () => play(),
      exit: () => exit(),
      replay: () => replay(),
      settle: () => settle(),
      imageStart: () => imageStart(),
      get state() {
        return state;
      },
      get lines() {
        return lines;
      },
      get width() {
        return width;
      },
    };

    if (ctx.reduced) return api;
    if (!fade && !carrier) {
      ctx.warn('unfold needs [data-fold-card-carrier], card left as it is', el);
      return api;
    }
    lines = [...el.querySelectorAll('[data-fold-card-line]')].map((lineEl) => ({ el: lineEl, split: splitText(lineEl) }));
    state = 'hidden';

    /** Final width of the card and the image position inside it, measured at full width. */
    function measure() {
      if (fade) return;
      const prev = el.style.width;
      el.style.width = '';
      carrier.style.width = '';
      // Inner width (the carrier sits inside the border). offset* ignore transforms, safe while moving.
      width = el.clientWidth;
      if (image) imageRatio = width ? Math.max(0, image.offsetLeft) / width : 0;
      el.style.width = prev;
      if (state !== 'shown') carrier.style.width = `${width}px`;
    }

    /** Seconds after the start of the unfold at which the image opens. */
    function imageStart() {
      const from = opts.widthFrom / 100;
      const need = (imageRatio - from) / (1 - from);
      const p = need <= 0 ? 0 : invertEase(opts.ease, Math.min(1, need));
      return p * opts.duration + opts.imageDelay;
    }

    const startOf = (line) => (line.split && line.split.clearance ? line.split.clearance.startPercent : 130);

    function applyStart() {
      if (fade) {
        motion.set(el, { opacity: 0 });
        lines.forEach((line) => motion.set(line.el, { yPercent: opts.riseFrom }));
      } else {
        motion.set(el, { widthPercent: opts.widthFrom, y: opts.yFrom, opacity: 0 });
      }
      if (image) motion.set(image, { clipTop: 100, opacity: 0 });
      for (const line of lines) if (line.split) motion.set(line.split.chars.map((c) => c.inner), { yPercent: startOf(line) });
    }

    function relayout() {
      for (const line of lines) {
        if (!line.split) continue;
        line.split.measure();
        line.split.measureClearance();
      }
      if (state === 'hidden' || state === 'playing') measure();
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

    function finishLayout() {
      if (fade) return;
      carrier.style.width = '';
      el.style.width = '';
    }

    function play() {
      if (state === 'playing' || state === 'shown') return Promise.resolve(true);
      g.kill();
      state = 'playing';
      const t0 = motion.now();
      const at = (extra) => ({ at: t0, delay: opts.delay + extra });
      if (fade) {
        g.tween(el, { opacity: 1 }, { ...at(opts.fadeDelay), duration: opts.fadeDuration, ease: opts.fadeEase });
        lines.forEach((line, i) => {
          const start = opts.fadeTextDelay + i * opts.fadeStagger;
          g.tween(line.el, { yPercent: 0 }, { ...at(start), duration: opts.fadeDuration, ease: opts.fadeEase });
          if (line.split) g.tween(line.split.chars.map((c) => c.inner), { yPercent: 0 }, { ...at(start), duration: opts.textDuration, ease: opts.textEase, stagger: opts.charStagger });
        });
        if (image) {
          g.tween(image, { clipTop: 0 }, { ...at(opts.fadeDelay), duration: opts.imageDuration, ease: opts.imageEase });
          g.tween(image, { opacity: 1 }, { ...at(opts.fadeDelay), duration: opts.imageOpacityDuration });
        }
      } else {
        measure();
        g.tween(el, { widthPercent: 100, y: 0 }, { ...at(0), duration: opts.duration, ease: opts.ease });
        g.tween(el, { opacity: 1 }, { ...at(0), duration: opts.opacityDuration, ease: opts.opacityEase });
        if (image) {
          const start = imageStart();
          g.tween(image, { clipTop: 0 }, { ...at(start), duration: opts.imageDuration, ease: opts.imageEase });
          g.tween(image, { opacity: 1 }, { ...at(start), duration: opts.imageOpacityDuration });
        }
        lines.forEach((line, i) => {
          if (!line.split) return;
          g.tween(line.split.chars.map((c) => c.inner), { yPercent: 0 }, {
            ...at(opts.textDelay + i * opts.stagger),
            duration: opts.textDuration,
            ease: opts.textEase,
            stagger: opts.charStagger,
          });
        });
      }
      return g.all().then((ok) => {
        if (ok && state === 'playing') {
          state = 'shown';
          finishLayout();
        }
        return ok;
      });
    }

    function exit() {
      if (state === 'hidden') return Promise.resolve(true);
      g.kill();
      state = 'exiting';
      const props = fade ? { opacity: 0 } : { opacity: 0, widthPercent: opts.widthFrom, y: opts.yFrom };
      if (!fade) {
        carrier.style.width = `${el.clientWidth}px`;
        motion.set(el, { widthPercent: 100 });
      }
      g.tween(el, props, { at: motion.now(), duration: opts.exitDuration, ease: opts.exitEase });
      return g.all().then((ok) => {
        if (ok && state === 'exiting') {
          state = 'hidden';
          applyStart();
        }
        return ok;
      });
    }

    function replay() {
      if (ctx.reduced) return Promise.resolve(true);
      g.kill();
      state = 'hidden';
      measure();
      applyStart();
      return play();
    }

    function settle() {
      if (state !== 'playing' && state !== 'shown') {
        state = 'hidden';
        play();
      }
      g.finish();
      if (state === 'playing') {
        state = 'shown';
        finishLayout();
      }
    }

    measure();
    relayout();
    ctx.release();

    ctx.on('layout:change', schedule);
    ctx.on('motion:reduced', (reduced) => reduced && settle());
    ctx.on('motion:settle', settle);
    ctx.on('motion:replay', replay);
    let lastWidth = el.parentElement ? el.parentElement.clientWidth : 0;
    if (el.parentElement) {
      const ro = new ResizeObserver(() => {
        const w = el.parentElement.clientWidth;
        if (w === lastWidth) return;
        lastWidth = w;
        schedule();
      });
      ro.observe(el.parentElement);
      ctx.own(() => ro.disconnect());
    }

    ctx.onIn(() => {
      relayout();
      if (state !== 'hidden') return;
      ctx.watchOnce('entrance', el, ({ visible }) => visible && play(), { threshold: opts.threshold, rootMargin: opts.rootMargin });
    });
    ctx.onOut(() => exit(), { onlyIfVisible: true });

    ctx.onDestroy(() => {
      g.kill();
      for (const line of lines) if (line.split) line.split.restore();
      lines = [];
      for (const prop of ['width', 'transform', 'opacity']) el.style.removeProperty(prop);
      if (carrier) carrier.style.removeProperty('width');
      if (image) for (const prop of ['clip-path', 'opacity']) image.style.removeProperty(prop);
      state = 'static';
    });

    return api;
  },
};
