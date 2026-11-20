/**
 * textsplit: split only, no animation (IM 11.3). For modules of later stages that animate words or
 * characters themselves (principles quotes, slider titles). Emits on the element:
 *   'v1:split'  after the first split and after every line-break change (detail: the Split object)
 * The plain text stays readable for screen readers. Reduced motion: still splits (it does not move
 * anything), so consumers can rely on the structure.
 */
import { splitText } from '../text/split.js';

export default {
  name: 'textsplit',
  options: { lines: true },

  setup(ctx) {
    const { el } = ctx;
    const sp = splitText(el);
    if (!sp) {
      ctx.warn('element cannot be split', el);
      return { split: null };
    }
    const announce = () => el.dispatchEvent(new CustomEvent('v1:split', { detail: sp }));
    let scheduled = false;
    const relayout = () => {
      const changed = sp.measure();
      sp.measureClearance();
      if (changed) announce();
    };
    ctx.on('layout:change', () => {
      if (scheduled) return;
      scheduled = true;
      ctx.nextFrame(() => {
        scheduled = false;
        relayout();
      }, 'input');
    });
    ctx.onMount(() => {
      relayout();
      announce();
    });
    ctx.release();
    ctx.onDestroy(() => sp.restore());
    return { split: sp };
  },
};
