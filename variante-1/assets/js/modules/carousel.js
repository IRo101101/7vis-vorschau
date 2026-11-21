/**
 * carousel: a row of cards with drag and snap (IM 11.8, PLAN 5 no. 21, PLAN 11 "Werkzeugreihe").
 *
 * Markup (complete without script: the cards stand as a grid):
 *   <div class="karussell" data-mod="carousel">
 *     <div data-carousel-window>                       clips at the right screen edge (the row breaks out)
 *       <ul id="…" data-carousel-track> <li data-carousel-slide><a href="…">card</a></li> … </ul>
 *     </div>
 *     <div data-needs-core> <button data-carousel-prev aria-controls="…" aria-label="…"> …
 *                           <button data-carousel-next …> </div>
 *   </div>
 *
 * Modes (data-carousel-mode): 'karussell' from data-carousel-min (4) cards, otherwise 'raster', the grid of
 * the document (PLAN 11: a carousel with one card would have nothing to show; under two cards the section is
 * left out by the page, Drehbuch D11).
 * Geometry as in the reference: gap 8 px, peek 24 px, 3 cards from 768 px, 1 below; card width =
 * (content width - peek - gaps) / visible. The module writes these numbers as custom properties from the
 * timing table, the CSS lays the row out. Snap points are the left edges of the cards, capped at the
 * maximum travel (the last card ends at the right page margin).
 * Prev and Next go one point (1.2 s, expo.out) and are aria-disabled at the ends.
 * Drag (mouse, pen, touch): from 12 px of travel; if the vertical part dominates, nothing moves and the page
 * scrolls; otherwise the row follows the pointer 1:1 (bounded, no rubber band), smooth scrolling stops, and
 * on release the row snaps to the nearest point. Any pointer travel beyond clickSlop (6 px), in any
 * direction, cancels the following click: the reference opened a product after a short vertical drag (F11).
 * Keyboard focus on a card outside the window moves the row so the card is seen.
 * Reduced motion: steps and snaps are instant (engine); the drag still follows the pointer.
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.carousel;
const SEL = Object.freeze({
  window: '[data-carousel-window]',
  track: '[data-carousel-track]',
  slide: '[data-carousel-slide]',
  prev: '[data-carousel-prev]',
  next: '[data-carousel-next]',
});

export default {
  name: 'carousel',
  options: {
    min: T.minCarousel,
    visible: T.visible,
    visibleNarrow: T.visibleNarrow,
    narrowAt: 'ml m',
    gap: T.gap,
    peek: T.peek,
    duration: T.duration,
    ease: T.ease,
    threshold: T.dragThreshold,
    clickSlop: T.clickSlop,
  },

  setup(ctx) {
    const { el, opts, motion, store } = ctx;
    const win = el.querySelector(SEL.window);
    const track = el.querySelector(SEL.track);
    const slides = track ? [...track.querySelectorAll(SEL.slide)] : [];
    const prevBtn = el.querySelector(SEL.prev);
    const nextBtn = el.querySelector(SEL.next);
    const g = motion.group();
    const mode = win && track && slides.length >= opts.min ? 'karussell' : 'raster';
    let points = [0];
    let max = 0;
    let index = 0;
    let drag = null;
    let swallow = false;
    let swallowTimer = 0;
    let stoppedScroll = false;
    let scheduled = false;

    el.setAttribute('data-carousel-mode', mode);
    const api = {
      get mode() {
        return mode;
      },
      get index() {
        return index;
      },
      get points() {
        return points.slice();
      },
      get max() {
        return max;
      },
      get x() {
        return track ? motion.get(track, 'x') : 0;
      },
      get dragging() {
        return !!(drag && drag.state === 'drag');
      },
      go: (i, o) => go(i, o),
      next: () => go(index + 1),
      prev: () => go(index - 1),
    };
    ctx.onDestroy(() => el.removeAttribute('data-carousel-mode'));
    if (mode !== 'karussell') return api;

    const clampX = (x) => Math.min(0, Math.max(-max, x));

    function setVars() {
      const bp = (store.get('viewport') || {}).bp;
      const narrow = String(opts.narrowAt).split(/\s+/).includes(bp);
      el.style.setProperty('--karussell-sichtbar', String(narrow ? opts.visibleNarrow : opts.visible));
      el.style.setProperty('--karussell-luecke', `${opts.gap}px`);
      el.style.setProperty('--karussell-anschnitt', `${opts.peek}px`);
    }

    /** Snap points from the layout (offsetLeft ignores the transform of the track). */
    function measure() {
      const view = el.clientWidth;
      const last = slides[slides.length - 1];
      max = Math.max(0, Math.round(last.offsetLeft + last.offsetWidth - view));
      const pts = [];
      for (const s of slides) {
        const p = Math.min(s.offsetLeft, max);
        if (!pts.length || p - pts[pts.length - 1] > 1) pts.push(p);
      }
      if (pts[pts.length - 1] < max - 1) pts.push(max);
      points = pts;
      index = Math.min(index, points.length - 1);
    }

    function updateButtons() {
      if (prevBtn) prevBtn.setAttribute('aria-disabled', index <= 0 ? 'true' : 'false');
      if (nextBtn) nextBtn.setAttribute('aria-disabled', index >= points.length - 1 ? 'true' : 'false');
    }

    function go(i, { instant = false } = {}) {
      const to = Math.max(0, Math.min(points.length - 1, i));
      index = to;
      updateButtons();
      g.kill();
      if (instant) {
        motion.set(track, { x: -points[to] });
        return Promise.resolve(true);
      }
      return g.tween(track, { x: -points[to] }, { at: motion.now(), duration: opts.duration, ease: opts.ease }).done;
    }

    function nearest(x) {
      let best = 0;
      for (let i = 1; i < points.length; i += 1) if (Math.abs(points[i] - x) < Math.abs(points[best] - x)) best = i;
      return best;
    }

    function relayout() {
      setVars();
      measure();
      if (!drag || drag.state !== 'drag') go(index, { instant: true });
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      ctx.nextFrame(() => {
        scheduled = false;
        relayout();
      }, 'input');
    }

    /* ---------- buttons ---------- */
    const step = (d) => (e) => {
      e.preventDefault();
      if (drag && drag.state === 'drag') return;
      const btn = d < 0 ? prevBtn : nextBtn;
      if (btn && btn.getAttribute('aria-disabled') === 'true') return;
      go(index + d);
    };
    if (prevBtn) ctx.listen(prevBtn, 'click', step(-1));
    if (nextBtn) ctx.listen(nextBtn, 'click', step(1));

    /* ---------- drag ---------- */
    function startDrag(dx) {
      drag.state = 'drag';
      // 1:1 from the pointer-down position (the reference counts the threshold too); if a step was still
      // running, from where the row is now.
      if (g.active) drag.from = motion.get(track, 'x') - dx;
      g.kill();
      el.setAttribute('data-carousel-drag', '');
      if (ctx.scroll.smooth) {
        ctx.scroll.stop();
        stoppedScroll = true;
      }
    }

    function endDrag() {
      el.removeAttribute('data-carousel-drag');
      if (stoppedScroll) {
        ctx.scroll.start();
        stoppedScroll = false;
      }
      go(nearest(-motion.get(track, 'x')));
    }

    ctx.listen(win, 'pointerdown', (e) => {
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, from: motion.get(track, 'x'), state: 'pending', moved: 0 };
      swallow = false;
    });
    ctx.listen(win, 'pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      if (drag.state === 'pending') {
        if (Math.abs(dx) < opts.threshold && Math.abs(dy) < opts.threshold) return;
        // Mostly vertical: the page scrolls (touch), nothing moves; the click is cancelled all the same.
        if (Math.abs(dy) > Math.abs(dx)) {
          drag.state = 'off';
          return;
        }
        startDrag(dx);
        try {
          win.setPointerCapture(e.pointerId);
        } catch (err) {
          /* the pointer is already gone */
        }
      }
      if (drag.state === 'drag') motion.set(track, { x: clampX(drag.from + dx) });
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.moved > opts.clickSlop) {
        swallow = true;
        // The click, if any, follows the pointerup in the same task; drop the flag afterwards.
        clearTimeout(swallowTimer);
        swallowTimer = setTimeout(() => {
          swallow = false;
        }, 0);
      }
      const was = drag.state;
      drag = null;
      if (was === 'drag') endDrag();
    };
    ctx.listen(win, 'pointerup', release);
    ctx.listen(win, 'pointercancel', release);
    ctx.listen(win, 'click', (e) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    }, { capture: true });
    // Links and images are draggable by default; a native drag would steal the pointer.
    ctx.listen(win, 'dragstart', (e) => e.preventDefault());

    /* ---------- keyboard focus ---------- */
    ctx.listen(track, 'focusin', (e) => {
      const slide = e.target.closest(SEL.slide);
      if (!slide || !e.target.matches(':focus-visible')) return;
      const x = -points[index];
      const left = slide.offsetLeft + x;
      const right = left + slide.offsetWidth;
      if (left >= -1 && right <= el.clientWidth + 1) return;
      go(nearest(Math.min(slide.offsetLeft, max)));
    });

    /* ---------- layout ---------- */
    setVars();
    measure();
    go(0, { instant: true });
    ctx.on('viewport', schedule);
    ctx.on('layout:change', schedule);
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      schedule();
    });
    ro.observe(el);
    ctx.own(() => ro.disconnect());
    ctx.on('motion:settle', () => g.finish());

    ctx.onDestroy(() => {
      clearTimeout(swallowTimer);
      g.kill();
      motion.set(track, { x: 0 });
      track.style.removeProperty('transform');
      for (const p of ['--karussell-sichtbar', '--karussell-luecke', '--karussell-anschnitt']) el.style.removeProperty(p);
      el.removeAttribute('data-carousel-drag');
      if (prevBtn) prevBtn.removeAttribute('aria-disabled');
      if (nextBtn) nextBtn.removeAttribute('aria-disabled');
      if (stoppedScroll) ctx.scroll.start();
      stoppedScroll = false;
      drag = null;
    });

    return api;
  },
};
