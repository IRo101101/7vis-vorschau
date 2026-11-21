/**
 * gallery: three picture surfaces change places with the scroll (IM 11 "gallery", IS 3.3 block 3), on the
 * product page in the last stage section during its hold (data-product-stack-hold="2").
 *
 * Markup (without script a list of words and three pictures in a row):
 *   <div class="galerie" data-mod="gallery">
 *     <ol> <li data-gallery-word>Einsetzen</li> … </ol>
 *     <div data-gallery-stage> <figure data-gallery-image>…</figure> × 3 </div>
 *   </div>
 * Like a conveyor in the reference recording (refmedia product, frames 41 to 76): a picture enters small at
 * the bottom left, becomes the large one, moves small to the top right and leaves upwards; the word of the
 * large picture is bright, the others are dimmed. t runs from 0 to (pictures - 1) over the hold of the stage
 * (or over the section's own way through the viewport when the stage is off on wide screens).
 * Only in stage mode; on phones, without script and under reduced motion the pictures stand in a row.
 */
import { TIMING } from '../motion/curves.js';
import { resolveEase } from '../motion/ease.js';

const T = TIMING.gallery;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// Slots as fractions of the stage box: x, y, w, h. Index = position on the conveyor.
const SLOTS = {
  '-2': [0.02, 1.02, 0.12, 0.16],
  '-1': [0.02, 0.76, 0.18, 0.24],
  0: [0.24, 0.08, 0.5, 0.74],
  1: [0.74, -0.02, 0.24, 0.3],
  2: [0.76, -0.42, 0.16, 0.22],
};

export default {
  name: 'gallery',
  options: {},

  setup(ctx) {
    const { el, store, motion } = ctx;
    const stageBox = el.querySelector('[data-gallery-stage]');
    const pics = [...el.querySelectorAll('[data-gallery-image]')];
    const words = [...el.querySelectorAll('[data-gallery-word]')];
    const stack = el.closest('[data-mod~="product-stack"]');
    if (!stageBox || pics.length < 2 || !stack) return null;
    const ease = resolveEase(T.ease);
    const hold = Number(stack.getAttribute('data-product-stack-hold')) || 0;
    const n = stack.querySelectorAll('[data-product-stack-section]').length;
    let on = false;
    let top = 0;
    let vh = innerHeight;
    let lastY = null;
    let active = -1;

    const wanted = () => store.get('stack:modus') === 'buehne' && hold > 0 && !ctx.reduced && !['ml', 'm'].includes((store.get('viewport') || {}).bp);

    function slot(u) {
      const lo = clamp(Math.floor(u), -2, 2);
      const hi = clamp(lo + 1, -2, 2);
      const f = ease(clamp(u - lo, 0, 1));
      const a = SLOTS[lo];
      const b = SLOTS[hi];
      return a.map((v, i) => v + (b[i] - v) * (lo === hi ? 0 : f));
    }

    function apply(t) {
      pics.forEach((p, k) => {
        const [x, y, w, h] = slot(clamp(t - k, -2, 2));
        motion.set(p, { '--gx': x * 100, '--gy': y * 100, '--gw': w * 100, '--gh': h * 100 });
      });
      const a = clamp(Math.round(t), 0, words.length - 1);
      if (a !== active) {
        active = a;
        words.forEach((w, i) => w.setAttribute('data-gallery-state', i === a ? 'an' : 'aus'));
        el.setAttribute('data-gallery-active', String(a));
      }
    }

    function reset() {
      for (const p of pics) {
        for (const prop of ['--gx', '--gy', '--gw', '--gh']) p.style.removeProperty(prop);
        if (!p.getAttribute('style')) p.removeAttribute('style');
      }
      for (const w of words) w.removeAttribute('data-gallery-state');
      el.removeAttribute('data-gallery-active');
      active = -1;
    }

    function evaluate() {
      const next = wanted();
      if (next !== on) {
        on = next;
        el.setAttribute('data-gallery-mode', on ? 'band' : 'reihe');
        if (!on) reset();
      }
      if (on) {
        top = stack.getBoundingClientRect().top + scrollY;
        vh = innerHeight;
        lastY = null;
        frame();
      }
    }

    function frame() {
      if (!on || scrollY === lastY) return;
      lastY = scrollY;
      const p = (scrollY - top) / vh;
      const q = clamp((p - (n - 1)) / hold, 0, 1);
      apply(q * (pics.length - 1));
    }

    ctx.frame(frame, 'scroll');
    const later = () => ctx.nextFrame(evaluate, 'input');
    ctx.on('stack:modus', later);
    ctx.on('viewport', later);
    ctx.on('layout:change', later);
    ctx.on('motion:reduced', later);
    // After a page change the view is back in flow only at transition:settled: measure the stage again then.
    ctx.on('transition:settled', later);
    ctx.onIn(later);
    evaluate();

    ctx.onDestroy(() => {
      reset();
      el.removeAttribute('data-gallery-mode');
    });

    return {
      get active() {
        return active;
      },
      get mode() {
        return on ? 'band' : 'reihe';
      },
    };
  },
};
