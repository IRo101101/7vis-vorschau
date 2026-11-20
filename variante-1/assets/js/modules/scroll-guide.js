/**
 * scroll-guide: guided scroll from the hero to the next section (IM 11.6), softened per FRAGEN 4b.
 *
 * Reference: entering the band from 1 % to 90 % of the hero height downwards scrolls to the next sibling in
 * 1.5 s (curve "schnapp", input locked); coming back up from the next section by more than 10 % of the hero
 * height scrolls to the top. Softened (4b):
 *   - only when the scroll was started by a wheel or trackpad (never keyboard, touch or the scrollbar);
 *   - never under reduced motion (Lenis is off then, so there is no smooth scroll to guide);
 *   - switchable: store 'scroll:guide' false turns it off (review tool), default on.
 * Put it on the hero; the target is the hero's next element sibling, or the element that the selector in
 * data-scroll-guide-target names (stage 3: the card overlay sits between hero and slider in the markup).
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.guidedScroll;

export default {
  name: 'scroll-guide',
  options: { target: '' },

  setup(ctx) {
    const { el, opts, store, scroll } = ctx;
    const next = (opts.target && (el.closest('[data-view]') || document).querySelector(opts.target)) || el.nextElementSibling;
    if (!next) {
      ctx.warn('the hero needs a next sibling to guide to');
      return null;
    }
    let input = 'none';
    let busy = false;
    let lastY = scroll.y();
    let guided = 0;

    const mark = (kind) => () => {
      input = kind;
    };
    ctx.listen(window, 'wheel', mark('wheel'), { passive: true });
    ctx.listen(window, 'keydown', mark('key'));
    ctx.listen(window, 'touchstart', mark('touch'), { passive: true });
    ctx.listen(window, 'pointerdown', mark('pointer'), { passive: true });

    // Document positions: the hero may be sticky, its parent is not. Rectangles follow the native scroll
    // position, so they are added to scrollY; the smoothed value of Lenis would make the band jitter by a
    // fraction of a pixel and let a step back slip past the 90 % line (stage 3).
    const band = () => {
      const host = el.parentElement || el;
      const top = host.getBoundingClientRect().top + scrollY;
      const h = el.offsetHeight;
      return { top, h, start: top + h * T.startFraction, end: top + h * T.endFraction, target: next.getBoundingClientRect().top + scrollY };
    };

    const go = (y) => {
      busy = true;
      guided += 1;
      scroll.to(y, { lock: true }).then(() => {
        busy = false;
        lastY = scroll.y();
      });
    };

    ctx.own(scroll.on(({ y }) => {
      const prev = lastY;
      lastY = y;
      if (busy || !scroll.smooth || ctx.reduced || store.get('scroll:guide') === false || input !== 'wheel') return;
      const b = band();
      if (y > prev && prev < b.start && y >= b.start && y < b.end) go(b.target);
      else if (y < prev && prev >= b.top + b.h * (1 - T.backFraction) && y < b.top + b.h * (1 - T.backFraction) && y > b.top) go(b.top);
    }));

    return {
      get guided() {
        return guided;
      },
      get busy() {
        return busy;
      },
    };
  },
};
