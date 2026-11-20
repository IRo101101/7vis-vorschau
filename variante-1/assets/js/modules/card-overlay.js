/**
 * card-overlay: the card layer of the hero stretch that seems to stand still and is covered cleanly by the
 * top edge of the section that slides over the hero (IM 11.5 "mini-card-sticky", PLAN 5 no. 16).
 *
 * Markup: an absolutely positioned layer at the top of the stretch, one viewport high, holding the hero
 * card(s). It lies above the WebGL front layer on phones (the reference puts its cards above the can there,
 * IM 3) and therefore cannot rely on the stacking order to be covered by the slider; instead, as in the
 * reference, a scrub from scroll 0 to its own height moves it down by exactly the scrolled distance (it
 * stands still on screen) and clips it from the bottom by the same amount (the covering edge).
 *   <div class="held-karten" data-mod="card-overlay"> <article class="karte" data-mod="fold-card"> … </div>
 * Linear with the native scroll position of the stretch (refmedia v1 F7: "clipped linearly"). Once fully
 * covered the layer is hidden, so its links leave the focus order (the reference keeps them focusable).
 * Reduced motion
 * keeps the scrub: it is a position, not an animation (the page would show a card floating over the slider
 * otherwise).
 */
export default {
  name: 'card-overlay',
  options: {},

  setup(ctx) {
    const { el, motion } = ctx;
    const host = el.parentElement;
    let last = -1;

    function update() {
      const h = el.offsetHeight;
      if (!host || !h) return;
      const passed = -host.getBoundingClientRect().top;
      const p = Math.min(1, Math.max(0, passed / h));
      const v = Math.round(p * 10000) / 100;
      if (v === last) return;
      last = v;
      motion.set(el, { yPercent: v, clipBottom: v });
      // Fully covered: out of the focus order too, so the keyboard never lands on an invisible card.
      el.style.visibility = v >= 100 ? 'hidden' : '';
    }

    // Scroll events of Lenis come from the scroll lane of the one frame loop, so card and slider edge move in
    // the same frame; without Lenis (reduced motion, touch) the native scroll event drives it.
    ctx.own(ctx.scroll.on(update));
    const again = () => {
      last = -1;
      ctx.nextFrame(update, 'scroll');
    };
    ctx.on('layout:change', again);
    ctx.on('viewport', again);
    ctx.on('page:in', again);
    ctx.onDestroy(() => {
      motion.set(el, { yPercent: 0, clipBottom: 0 });
      el.style.removeProperty('visibility');
    });
    update();

    return {
      get progress() {
        return last / 100;
      },
    };
  },
};
