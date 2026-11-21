/**
 * info-slide: the buy box column of a product page slides in its info box (IS 6 "pdp-info Einschub").
 *
 * Markup (inside the product stage, after the first section; without script it simply follows the hero):
 *   <aside class="spalte" data-mod="info-slide">
 *     <div class="spalte__innen" data-info-slide-inner data-scroll-own>
 *       <form class="kaufbox" …> or <section class="statusbox" …>   (always visible)
 *       <div class="infobox" data-info-slide-info>…</div>
 *     </div>
 *   </aside>
 * Over the first viewport of the stage (h from 0 to 1) the inner box starts moved down by (its height minus
 * the buy box height), so only the buy box shows at the bottom; it reaches its place at h 0.75 while the
 * info box fades in from h 0.25 to 1, both through the curve "vorhang" (pdp-info-slide). The stage's scroll
 * hint fades out the other way. Only in stage mode of the product stack ('stack:modus' = 'buehne'), from
 * 768 px and never under reduced motion; otherwise everything stands as in the HTML. Flag:
 * data-info-slide-state = bereit | aus (the reference's data-pdp-ready).
 * A jump link to the data sheet (#datenblatt) brings the box to its end state at once.
 */
import { TIMING } from '../motion/curves.js';
import { resolveEase } from '../motion/ease.js';

const T = TIMING.infoSlide;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default {
  name: 'info-slide',
  options: { slideEnd: T.slideEnd, fadeStart: T.fadeStart, ease: T.ease },

  setup(ctx) {
    const { el, opts, store, motion } = ctx;
    const inner = el.querySelector('[data-info-slide-inner]');
    const info = el.querySelector('[data-info-slide-info]');
    const head = inner ? inner.firstElementChild : null;
    const stage = el.closest('[data-mod~="product-stack"]');
    const hint = stage ? stage.querySelector('[data-product-stack-hint]') : null;
    if (!inner || !info || !head || !stage) return null;
    const ease = resolveEase(opts.ease);
    let on = null; // null until the first evaluation sets the state attribute
    let offset = 0;
    let top = 0;
    let vh = innerHeight;
    let lastY = null;
    let forced = false;

    const wanted = () => store.get('stack:modus') === 'buehne' && !ctx.reduced && !['ml', 'm'].includes((store.get('viewport') || {}).bp);

    function measure() {
      motion.set(inner, { y: 0 });
      offset = Math.max(0, inner.getBoundingClientRect().height - head.getBoundingClientRect().height);
      top = stage.getBoundingClientRect().top + scrollY;
      vh = innerHeight;
      lastY = null;
    }

    function apply(h) {
      const slide = ease(clamp(h / opts.slideEnd, 0, 1));
      const fade = ease(clamp((h - opts.fadeStart) / (1 - opts.fadeStart), 0, 1));
      motion.set(inner, { y: (1 - slide) * offset });
      motion.set(info, { opacity: fade });
      if (hint) motion.set(hint, { opacity: 1 - fade });
    }

    function reset() {
      for (const n of [inner, info, hint]) {
        if (!n) continue;
        n.style.removeProperty('transform');
        n.style.removeProperty('opacity');
        if (!n.getAttribute('style')) n.removeAttribute('style');
      }
    }

    function evaluate() {
      const next = wanted();
      if (next !== on) {
        on = next;
        el.setAttribute('data-info-slide-state', on ? 'bereit' : 'aus');
        if (!on) reset();
      }
      if (on) {
        measure();
        frame();
      }
    }

    function frame() {
      if (!on) return;
      const y = scrollY;
      if (y === lastY) return;
      lastY = y;
      apply(forced ? 1 : (y - top) / vh);
    }

    ctx.frame(frame, 'scroll');
    const later = () => ctx.nextFrame(evaluate, 'input');
    ctx.on('stack:modus', later);
    ctx.on('viewport', later);
    ctx.on('layout:change', later);
    ctx.on('motion:reduced', later);
    ctx.on('transition:settled', later);
    ctx.onIn(later);
    // "Datenblatt ansehen" jumps to the info box: show it at once, wherever the stage stands.
    ctx.listen(document, 'click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a || !on) return;
      const target = document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
      if (!target || !info.contains(target)) return;
      forced = true;
      lastY = null;
      frame();
    });
    ctx.listen(window, 'scroll', () => {
      if (forced && scrollY <= top + 1) {
        forced = false;
        lastY = null;
      }
    }, { passive: true });
    evaluate();

    ctx.onDestroy(() => {
      reset();
      el.removeAttribute('data-info-slide-state');
    });

    return {
      get on() {
        return on === true;
      },
      get offset() {
        return offset;
      },
    };
  },
};
