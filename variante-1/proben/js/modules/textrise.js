/**
 * textrise: text block entrance (IM 10 row "text-reveal", IM 11.2).
 *
 * Targets: the element itself; its only heading or paragraph child; children with data-textrise-line;
 * or all element children with data-textrise-block. All characters of all targets rise from below
 * (data-textrise-from="above" reverses) in one staggered tween: 1.0 s, 0.02 s per character, delay 0,
 * curve "karte-text". Trigger: once when visible.
 * Reduced motion: nothing is split.
 */
import { splitText } from '../../../assets/js/text/split.js';
import { TIMING } from '../../../assets/js/motion/curves.js';

const T = TIMING.textrise;

function targetsOf(el) {
  const marked = el.querySelectorAll(':scope > [data-textrise-line]');
  if (marked.length) return [...marked];
  if (el.hasAttribute('data-textrise-block')) return [...el.children];
  const kids = [...el.children];
  if (kids.length === 1 && /^(H[1-6]|P)$/.test(kids[0].tagName) && !el.textContent.replace(kids[0].textContent, '').trim()) return kids;
  return [el];
}

export default {
  name: 'textrise',
  options: {
    from: 'below',
    delay: T.delay,
    duration: T.duration,
    charStagger: T.charStagger,
    ease: T.ease,
    threshold: 0,
    rootMargin: '0px',
  },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const g = motion.group();
    let state = 'static';
    let splits = [];
    let scheduled = false;
    const api = {
      play: () => play(),
      replay: () => replay(),
      settle: () => settle(),
      get state() {
        return state;
      },
      get splits() {
        return splits;
      },
    };
    if (ctx.reduced) return api;

    splits = targetsOf(el).map((t) => splitText(t)).filter(Boolean);
    if (!splits.length) {
      ctx.warn('nothing to split', el);
      return api;
    }
    state = 'hidden';
    const sign = opts.from === 'above' ? -1 : 1;
    const chars = () => splits.flatMap((s) => s.chars.map((c) => c.inner));

    function applyStart() {
      for (const s of splits) motion.set(s.chars.map((c) => c.inner), { yPercent: sign * (s.clearance ? s.clearance.startPercent : 130) });
    }

    function relayout() {
      for (const s of splits) {
        s.measure();
        s.measureClearance();
      }
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

    function play() {
      if (state === 'playing' || state === 'shown') return Promise.resolve(true);
      g.kill();
      state = 'playing';
      g.tween(chars(), { yPercent: 0 }, { at: motion.now(), delay: opts.delay, duration: opts.duration, ease: opts.ease, stagger: opts.charStagger });
      return g.all().then((ok) => {
        if (ok && state === 'playing') state = 'shown';
        return ok;
      });
    }

    function replay() {
      if (ctx.reduced) return Promise.resolve(true);
      g.kill();
      state = 'hidden';
      applyStart();
      return play();
    }

    function settle() {
      if (state !== 'playing' && state !== 'shown') {
        state = 'hidden';
        play();
      }
      g.finish();
    }

    relayout();
    ctx.release();
    ctx.on('layout:change', schedule);
    ctx.on('motion:reduced', (reduced) => reduced && settle());
    ctx.on('motion:settle', settle);
    ctx.on('motion:replay', replay);

    ctx.onIn(() => {
      relayout();
      if (state !== 'hidden') return;
      ctx.watchOnce('entrance', el, ({ visible }) => visible && play(), { threshold: opts.threshold, rootMargin: opts.rootMargin });
    });

    ctx.onDestroy(() => {
      g.kill();
      for (const s of splits) s.restore();
      splits = [];
      state = 'static';
    });
    return api;
  },
};
