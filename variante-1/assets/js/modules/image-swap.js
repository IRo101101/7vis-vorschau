/**
 * image-swap: the second image of a card on hover (IM 11 row "img-hover", refmedia v1 clip card-hover).
 *
 * Markup: the card holds its second image in [data-image-swap-second] (aria-hidden, a duplicate view).
 *   <a class="werkzeug" href="…" data-mod="image-swap"> … <span data-image-swap-second>…</span> … </a>
 * Pointer enters: the second image fades in (0 to 1 in 0.35 s, power2.out) and settles from 1.03 to 1
 * (1.0 s, expo.out); leaving reverses both. Only a mouse or a pen swaps: the reference also swapped while a
 * finger swiped over a card on the phone (refmedia v1 mobile home), which shows a flicker, not a second view.
 * Without the module the second image stays hidden (CSS). Reduced motion: the swap is instant.
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.imgHover;

export default {
  name: 'image-swap',
  options: {
    opacityDuration: T.opacityDuration,
    opacityEase: T.opacityEase,
    scaleFrom: T.scaleFrom,
    scaleDuration: T.scaleDuration,
    scaleEase: T.scaleEase,
  },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const second = el.querySelector('[data-image-swap-second]');
    if (!second) return null;
    const g = motion.group();
    let shown = false;

    // The CSS shows the second image once the module is ready; the module keeps it at opacity 0 until hover.
    motion.set(second, { opacity: 0, scale: opts.scaleFrom });
    el.setAttribute('data-image-swap', 'bereit');

    function show(on) {
      if (on === shown) return;
      shown = on;
      g.kill();
      const at = motion.now();
      g.tween(second, { opacity: on ? 1 : 0 }, { at, duration: opts.opacityDuration, ease: opts.opacityEase });
      g.tween(second, { scale: on ? 1 : opts.scaleFrom }, { at, duration: opts.scaleDuration, ease: opts.scaleEase });
    }

    ctx.listen(el, 'pointerenter', (e) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen') show(true);
    });
    ctx.listen(el, 'pointerleave', () => show(false));
    ctx.on('page:out', () => show(false));

    ctx.onDestroy(() => {
      g.kill();
      motion.set(second, { opacity: 1, scale: 1 });
      second.style.removeProperty('opacity');
      second.style.removeProperty('transform');
      el.removeAttribute('data-image-swap');
    });

    return {
      get shown() {
        return shown;
      },
      show,
    };
  },
};
