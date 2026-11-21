/**
 * product-stack: the stage of screen-high sections (IS 3.2, IS 3.3, IS 6 "product-stack", IM 11; PLAN 5
 * no. 38). Used by /werkzeuge (own tools), the product pages and /die-sieben-kraefte.
 *
 * Markup (a complete document without script: the sections simply follow each other):
 *   <div class="stapel" data-mod="product-stack" data-theme="invers" data-product-stack-hold="0"
 *        data-product-stack-mobile="true|false">
 *     <div class="stapel__bahn" data-product-stack-track>
 *       <section data-product-stack-section> … <figure data-product-stack-image>…</figure></section>  × n
 *       optional: [data-product-stack-card] floating card with [data-product-stack-strip] (rolling lines,
 *                 one entry per section), [data-product-stack-pics] (one picture per section) and
 *                 [data-product-stack-button] (one link per section, only the active one shown)
 *       optional: [data-product-stack-hint] "Weiter" with [data-product-stack-strip] (next section names)
 *       optional: other overlays (the buy box column of a product page) stay where the markup puts them
 *     </div>
 *   </div>
 *
 * Stage mode (from 768 px, or on phones with data-product-stack-mobile="true"; never under reduced motion):
 * the stretch is (n + hold) viewports high, the track sticks for its whole length and holds the sections on
 * top of each other. Section k is revealed from the bottom up by clip-path (inset top 100 % -> 0), linear
 * with the scroll over viewport k (refmedia F8); its image comes from 6 % below at scale 1.12. The active
 * index switches at 50 % (CSS variable --stack-active, attribute data-product-stack-active); the card's
 * picture slides by 100 % and its lines roll by one line in 0.6 s ("streifen"), only the active button is
 * shown, and the hint names the next section. The last section holds for `hold` extra viewports.
 * Snap (IS 6, F8): after wheel input, once the smooth scroll has rested for 140 ms between two sections,
 * the stage goes on to the next section from 80 % (0.8 s, expo.out, locked) and otherwise back to the
 * section the movement started from; going up, mirrored. Never after keyboard or touch input and never
 * under reduced motion (like the guided scroll of FRAGEN 4b, switchable with 'scroll:guide').
 * The reference's forward jump from 33 % in its second section (F8) is not copied: our rule is the same
 * for every section. Keyboard focus moving into another section scrolls the stage to that section.
 * Store: 'stack:modus' = 'buehne' | 'fluss' (one stage per page).
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.stack;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default {
  name: 'product-stack',
  options: {
    hold: 0,
    mobile: true,
    snapAt: T.snapAt,
    snapDuration: T.snapDuration,
    snapEase: T.snapEase,
    restMs: T.restMs,
    parallax: T.parallax,
    imageScale: T.imageScale,
    activeAt: T.activeAt,
    cardDuration: T.cardDuration,
    cardEase: T.cardEase,
  },

  setup(ctx) {
    const { el, opts, store, motion, scroll } = ctx;
    const track = el.querySelector('[data-product-stack-track]');
    const sections = [...el.querySelectorAll('[data-product-stack-section]')];
    if (!track || sections.length < 2) return null;
    const n = sections.length;
    const images = sections.map((s) => s.querySelector('[data-product-stack-image]'));
    const card = el.querySelector('[data-product-stack-card]');
    const strips = [...el.querySelectorAll('[data-product-stack-strip]')];
    const pics = card ? [...card.querySelectorAll('[data-product-stack-pic]')] : [];
    const buttons = card ? [...card.querySelectorAll('[data-product-stack-button]')] : [];
    const g = motion.group();
    let mode = null;
    let index = -1;
    let geo = { top: 0, vh: innerHeight };
    let lastY = -1;
    let lastMove = 0;
    let lastInput = 'none';
    let origin = 0;
    let snapping = false;
    let rested = true;

    /* ---------- mode ---------- */

    function wanted() {
      if (ctx.reduced) return 'fluss';
      const bp = store.get('viewport') ? store.get('viewport').bp : 'd';
      if ((bp === 'ml' || bp === 'm') && !opts.mobile) return 'fluss';
      return 'buehne';
    }

    function measure() {
      geo = { top: el.getBoundingClientRect().top + scrollY, vh: track.getBoundingClientRect().height || innerHeight };
    }

    function clearStyles() {
      for (const s of sections) {
        s.style.removeProperty('clip-path');
        if (!s.getAttribute('style')) s.removeAttribute('style');
      }
      for (const img of images) {
        if (!img) continue;
        img.style.removeProperty('transform');
        if (!img.getAttribute('style')) img.removeAttribute('style');
      }
    }

    function setMode(next) {
      if (next === mode) return;
      mode = next;
      g.kill();
      el.setAttribute('data-product-stack-state', next);
      el.style.setProperty('--stack-n', String(n));
      el.style.setProperty('--stack-hold', String(opts.hold));
      store.set('stack:modus', next);
      if (next === 'fluss') {
        clearStyles();
        for (const b of buttons) b.hidden = false;
        for (const p of pics) p.style.removeProperty('transform');
        for (const s of strips) s.style.removeProperty('transform');
        index = -1;
        return;
      }
      for (const img of images) if (img) motion.set(img, { scale: opts.imageScale });
      measure();
      lastY = -1;
      index = -1;
      update(true);
    }

    /* ---------- progress ---------- */

    const progress = () => (scrollY - geo.top) / geo.vh;

    function show(i, instant) {
      const prev = index;
      index = i;
      el.setAttribute('data-product-stack-active', String(i));
      el.style.setProperty('--stack-active', String(i));
      for (const [k, b] of buttons.entries()) b.hidden = k !== i;
      const dir = prev < 0 ? 0 : Math.sign(i - prev);
      const now = motion.now();
      for (const s of strips) {
        // The strip holds one entry per position; yPercent is relative to the whole strip.
        const to = { yPercent: (-100 * i) / Math.max(1, s.children.length) };
        if (instant || prev < 0) motion.set(s, to);
        else g.tween(s, to, { at: now, duration: opts.cardDuration, ease: opts.cardEase });
      }
      pics.forEach((p, k) => {
        if (instant || prev < 0) {
          motion.set(p, { yPercent: k === i ? 0 : 100 });
          return;
        }
        if (k === i) {
          motion.set(p, { yPercent: dir >= 0 ? T.cardFrom : -T.cardFrom });
          p.style.zIndex = '2';
          g.tween(p, { yPercent: 0 }, { at: now, duration: opts.cardDuration, ease: opts.cardEase });
        } else if (k === prev) {
          p.style.zIndex = '1';
        } else {
          p.style.removeProperty('z-index');
          motion.set(p, { yPercent: 100 });
        }
      });
    }

    function update(force) {
      if (mode !== 'buehne') return;
      const y = scrollY;
      if (!force && y === lastY) return;
      lastY = y;
      const p = progress();
      for (let k = 1; k < n; k += 1) {
        const r = clamp(p - (k - 1), 0, 1);
        motion.set(sections[k], { clipTop: (1 - r) * 100 });
        if (images[k]) motion.set(images[k], { yPercent: (1 - r) * opts.parallax, scale: opts.imageScale });
      }
      const i = clamp(Math.floor(p + (1 - opts.activeAt)), 0, n - 1);
      if (i !== index) show(i, force);
    }

    /* ---------- snapping ---------- */

    function maybeSnap() {
      if (snapping || mode !== 'buehne' || ctx.reduced || !scroll.smooth || lastInput !== 'wheel') return;
      if (store.get('scroll:guide') === false || store.get('webgl:freeze')) return;
      const p = progress();
      if (p <= 0 || p >= n - 1) {
        origin = clamp(Math.round(p), 0, n - 1);
        return;
      }
      const k = Math.floor(p);
      const f = p - k;
      if (f < 0.002 || f > 0.998) {
        origin = Math.round(p);
        return;
      }
      let target;
      if (origin <= k) target = f >= opts.snapAt ? k + 1 : k;
      else target = f <= 1 - opts.snapAt ? k : k + 1;
      snapping = true;
      scroll.to(geo.top + target * geo.vh, { duration: opts.snapDuration, ease: opts.snapEase, lock: true }).then(() => {
        snapping = false;
        origin = target;
      });
    }

    ctx.frame(() => {
      if (mode !== 'buehne') return;
      const y = scrollY;
      const now = performance.now();
      if (y !== lastY) {
        lastMove = now;
        rested = false;
        update();
      } else if (!rested && now - lastMove >= opts.restMs && !(scroll.lenis && scroll.lenis.isScrolling)) {
        rested = true;
        maybeSnap();
      }
    }, 'scroll');

    ctx.listen(window, 'wheel', () => {
      lastInput = 'wheel';
    }, { passive: true });
    ctx.listen(window, 'keydown', () => {
      lastInput = 'key';
    });
    ctx.listen(window, 'touchstart', () => {
      lastInput = 'touch';
    }, { passive: true });
    // A mouse press (scrollbar drag, click) also ends the wheel series: only wheel scrolling is snapped.
    ctx.listen(window, 'pointerdown', (e) => {
      lastInput = e.pointerType === 'mouse' ? 'pointer' : 'touch';
    }, { passive: true });

    // Keyboard focus in another section: bring that section into the stage.
    ctx.listen(el, 'focusin', (e) => {
      if (mode !== 'buehne') return;
      const k = sections.findIndex((s) => s.contains(e.target));
      if (k < 0 || k === index) return;
      scroll.to(geo.top + k * geo.vh, { immediate: true });
    });

    /* ---------- lifecycle ---------- */

    const relayout = () => ctx.nextFrame(() => {
      const next = wanted();
      if (next !== mode) setMode(next);
      else if (mode === 'buehne') {
        measure();
        update(true);
      }
    }, 'input');
    ctx.on('viewport', relayout);
    ctx.on('layout:change', relayout);
    ctx.on('motion:reduced', relayout);
    ctx.on('transition:settled', relayout);
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(relayout);
      ro.observe(el);
      ctx.own(() => ro.disconnect());
    }
    ctx.onIn(() => {
      measure();
      origin = clamp(Math.round(progress()), 0, n - 1);
      update(true);
    });

    setMode(wanted());

    ctx.onDestroy(() => {
      g.kill();
      clearStyles();
      for (const b of buttons) b.hidden = false;
      for (const p of [...pics, ...strips]) {
        p.style.removeProperty('transform');
        p.style.removeProperty('z-index');
        if (!p.getAttribute('style')) p.removeAttribute('style');
      }
      for (const prop of ['--stack-n', '--stack-hold', '--stack-active']) el.style.removeProperty(prop);
      if (!el.getAttribute('style')) el.removeAttribute('style');
      el.removeAttribute('data-product-stack-state');
      el.removeAttribute('data-product-stack-active');
      store.set('stack:modus', null);
    });

    return {
      get mode() {
        return mode;
      },
      get index() {
        return index;
      },
      get progress() {
        return mode === 'buehne' ? progress() : null;
      },
      get geometry() {
        return { ...geo, n, hold: opts.hold };
      },
      get origin() {
        return origin;
      },
    };
  },
};
