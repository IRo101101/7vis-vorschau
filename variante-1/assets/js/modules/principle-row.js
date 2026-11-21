/**
 * principle-row: the seven principles of the Pucker as a gliding row with autoplay (IM 11.10 "testimonial",
 * IM 10 row "Zitat", PLAN 4 row 5b, PLAN 5 no. 24; refmedia v1 clip testimonials).
 *
 * Markup (complete without script: a list of seven principles, each with title, image and statement):
 *   <section data-mod="principle-row">
 *     <div data-principle-row-window><ol id="…" data-principle-row-track>
 *       <li id="prinzip-1" data-principle-row-item>
 *         <h3 data-principle-row-head>number and title</h3>
 *         <div data-principle-row-image><div data-principle-row-image-inner>image</div></div>
 *         <p data-principle-row-text>statement</p>
 *       </li> …
 *     </ol></div>
 *     <div data-needs-core> seven buttons [data-principle-row-tab aria-controls="prinzip-n"],
 *       [data-principle-row-pause] with two labels [data-principle-row-pause-label="laeuft|steht"],
 *       [data-principle-row-prev], seven [data-principle-row-count] (one shown), [data-principle-row-next] </div>
 *   </section>
 *
 * A change (0.9 s, expo.out): the row glides so the active principle stands on the left; the other titles
 * dim to 0.65; the old statement fades (0.4 s, power2.in) and travels out with the row; the words of the new
 * one come in from 110 % to the right with a fade (0.8 s, 0.02 s apart, expo.out); the image frames of the
 * old and the new principle move against the row so both stay at the left slot, and the new image rises
 * in its frame from below on top of the old one.
 * Autoplay: every 5 s, endless, only while the section is visible, restarted after every change. A pause
 * switch stops and resumes it; keyboard focus inside the section holds it (PLAN 7). Never under reduced
 * motion: then changes are instant, nothing is split, and the switch is hidden.
 * The seven buttons, prev and next reach every principle without autoplay (acceptance 5b).
 */
import { splitText } from '../text/split.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.quote;
const SEL = Object.freeze({
  track: '[data-principle-row-track]',
  item: '[data-principle-row-item]',
  head: '[data-principle-row-head]',
  image: '[data-principle-row-image]',
  inner: '[data-principle-row-image-inner]',
  text: '[data-principle-row-text]',
  tab: '[data-principle-row-tab]',
  prev: '[data-principle-row-prev]',
  next: '[data-principle-row-next]',
  pause: '[data-principle-row-pause]',
  pauseLabel: '[data-principle-row-pause-label]',
  count: '[data-principle-row-count]',
});

/** Remembers original attribute values so destroy restores the markup exactly. */
function recorder() {
  const saved = new Map();
  return {
    set(el, name, value) {
      if (!el) return;
      let m = saved.get(el);
      if (!m) {
        m = new Map();
        saved.set(el, m);
      }
      if (!m.has(name)) m.set(name, el.getAttribute(name));
      if (value === null || value === false) el.removeAttribute(name);
      else el.setAttribute(name, value === true ? '' : String(value));
    },
    restore() {
      for (const [el, m] of saved) {
        for (const [name, value] of m) {
          if (value === null) el.removeAttribute(name);
          else el.setAttribute(name, value);
        }
      }
      saved.clear();
    },
  };
}

export default {
  name: 'principle-row',
  options: {
    autoplay: T.autoplay,
    transition: T.transition,
    ease: T.ease,
    wordDuration: T.duration,
    wordStagger: T.wordStagger,
    wordFrom: T.fromXPercent,
    inactiveOpacity: T.inactiveOpacity,
    fadeOut: T.fadeOut,
    fadeOutEase: T.fadeOutEase,
    imageFrom: T.imageFrom,
    start: 1,
  },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const track = el.querySelector(SEL.track);
    const items = track ? [...track.querySelectorAll(SEL.item)] : [];
    const n = items.length;
    if (n < 2) {
      ctx.warn('needs at least two [data-principle-row-item] in a [data-principle-row-track]', el);
      return null;
    }
    const heads = items.map((it) => it.querySelector(SEL.head));
    const images = items.map((it) => it.querySelector(SEL.image));
    const inners = items.map((it) => it.querySelector(SEL.inner));
    const texts = items.map((it) => it.querySelector(SEL.text));
    const tabs = [...el.querySelectorAll(SEL.tab)];
    const counts = [...el.querySelectorAll(SEL.count)];
    const prevBtn = el.querySelector(SEL.prev);
    const nextBtn = el.querySelector(SEL.next);
    const pauseBtn = el.querySelector(SEL.pause);
    const pauseLabels = [...el.querySelectorAll(SEL.pauseLabel)];
    const rec = recorder();
    const g = motion.group();
    let splits = [];
    let index = Math.max(0, Math.min(n - 1, opts.start - 1));
    let step = 0;
    let playing = true;
    let visible = false;
    let focusHold = false;
    let next = null;
    let seq = 0;
    let scheduled = false;
    let changes = 0;
    let lastSource = 'init';

    const autoplayAllowed = () => !ctx.reduced && opts.autoplay > 0;
    const armed = () => autoplayAllowed() && playing && visible && !focusHold;

    function arm() {
      next = armed() ? motion.now() + opts.autoplay : null;
    }

    function measure() {
      // Fractional (offsetLeft rounds): both items carry the same transform, so the difference is the layout step.
      step = n > 1 ? items[1].getBoundingClientRect().left - items[0].getBoundingClientRect().left : items[0].getBoundingClientRect().width;
    }

    function place() {
      motion.set(track, { x: -index * step });
    }

    function markControls() {
      tabs.forEach((t, i) => rec.set(t, 'aria-current', i === index ? 'true' : null));
      counts.forEach((c, i) => rec.set(c, 'hidden', i === index ? null : true));
    }

    function markPause() {
      rec.set(el, 'data-principle-row-autoplay', autoplayAllowed() ? (playing ? 'laeuft' : 'steht') : 'aus');
      for (const l of pauseLabels) rec.set(l, 'hidden', l.getAttribute('data-principle-row-pause-label') === (playing ? 'laeuft' : 'steht') ? null : true);
    }

    /** Rest state of every item: the active one on, the others off; frames back in their items. */
    function settleAll() {
      items.forEach((it, i) => {
        rec.set(it, 'data-principle-row-state', i === index ? 'on' : 'off');
        if (images[i]) {
          motion.set(images[i], { x: 0 });
          images[i].style.removeProperty('z-index');
        }
        if (inners[i]) motion.set(inners[i], { yPercent: 0 });
        if (heads[i]) motion.set(heads[i], { opacity: i === index ? 1 : opts.inactiveOpacity });
        if (texts[i]) motion.set(texts[i], { opacity: 1 });
      });
    }

    function change(to, source = 'api') {
      const target = ((to % n) + n) % n;
      if (target === index) return Promise.resolve(false);
      g.finish();
      settleAll();
      const from = index;
      index = target;
      seq += 1;
      changes += 1;
      const mine = seq;
      const at = motion.now();
      const glide = { at, duration: opts.transition, ease: opts.ease };
      rec.set(items[from], 'data-principle-row-state', 'out');
      rec.set(items[target], 'data-principle-row-state', 'in');
      markControls();
      lastSource = source;

      g.tween(track, { x: -target * step }, glide);
      if (heads[from]) g.tween(heads[from], { opacity: opts.inactiveOpacity }, glide);
      if (heads[target]) g.tween(heads[target], { opacity: 1 }, glide);
      // Frames against the row: same curve and time, so both stay at the left slot.
      if (images[from] && images[target]) {
        images[target].style.zIndex = '2';
        images[from].style.zIndex = '1';
        motion.set(images[target], { x: (from - target) * step });
        g.tween(images[target], { x: 0 }, glide);
        g.tween(images[from], { x: (target - from) * step }, glide);
        if (inners[target]) {
          motion.set(inners[target], { yPercent: opts.imageFrom });
          g.tween(inners[target], { yPercent: 0 }, glide);
        }
      }
      if (texts[from]) g.tween(texts[from], { opacity: 0 }, { at, duration: opts.fadeOut, ease: opts.fadeOutEase });
      if (texts[target]) motion.set(texts[target], { opacity: 1 });
      const sp = splits[target];
      if (sp) {
        const words = sp.words.map((w) => w.el);
        motion.set(words, { xPercent: opts.wordFrom, opacity: 0 });
        g.tween(words, { xPercent: 0, opacity: 1 }, { at, duration: opts.wordDuration, ease: opts.ease, stagger: opts.wordStagger });
      }
      arm();
      return g.all().then((ok) => {
        if (ok && mine === seq) settleAll();
        return ok;
      });
    }

    /* ---------- controls ---------- */
    tabs.forEach((t, i) => ctx.listen(t, 'click', () => change(i, 'tab')));
    if (prevBtn) ctx.listen(prevBtn, 'click', () => change(index - 1, 'button'));
    if (nextBtn) ctx.listen(nextBtn, 'click', () => change(index + 1, 'button'));
    if (pauseBtn) {
      ctx.listen(pauseBtn, 'click', () => {
        playing = !playing;
        markPause();
        arm();
      });
    }
    // Keyboard focus inside the section holds the autoplay (pointer focus after a click does not).
    ctx.listen(el, 'focusin', (e) => {
      const kb = e.target && e.target.matches && e.target.matches(':focus-visible');
      if (kb && !focusHold) {
        focusHold = true;
        arm();
      }
    });
    ctx.listen(el, 'focusout', (e) => {
      if (focusHold && (!e.relatedTarget || !el.contains(e.relatedTarget))) {
        focusHold = false;
        arm();
      }
    });
    ctx.watch(el, ({ visible: v }) => {
      if (v === visible) return;
      visible = v;
      arm();
    }, { threshold: 0 });

    ctx.frame(() => {
      if (next !== null && motion.now() >= next) change(index + 1, 'auto');
    }, 'late');

    /* ---------- layout ---------- */
    function relayout() {
      measure();
      for (const s of splits) s.measure();
      if (!g.active) place();
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      ctx.nextFrame(() => {
        scheduled = false;
        g.finish();
        relayout();
        place();
      }, 'input');
    }

    if (!ctx.reduced) splits = texts.map((t) => (t ? splitText(t) : null));
    rec.set(el, 'data-principle-row-mode', 'reihe');
    measure();
    place();
    settleAll();
    markControls();
    markPause();

    ctx.on('viewport', schedule);
    ctx.on('layout:change', schedule);
    ctx.on('motion:settle', () => g.finish());
    ctx.on('motion:reduced', () => {
      g.finish();
      markPause();
      arm();
    });
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      schedule();
    });
    ro.observe(el);
    ctx.own(() => ro.disconnect());

    ctx.onDestroy(() => {
      g.kill();
      for (const s of splits) if (s) s.restore();
      splits = [];
      motion.set(track, { x: 0 });
      track.style.removeProperty('transform');
      items.forEach((it, i) => {
        for (const node of [images[i], inners[i], heads[i], texts[i]]) {
          if (!node) continue;
          motion.set(node, { x: 0, yPercent: 0, opacity: 1 });
          for (const p of ['transform', 'opacity', 'z-index']) node.style.removeProperty(p);
        }
      });
      rec.restore();
      next = null;
    });

    return {
      get index() {
        return index;
      },
      get count() {
        return n;
      },
      get playing() {
        return playing;
      },
      get armed() {
        return armed();
      },
      get next() {
        return next;
      },
      get visible() {
        return visible;
      },
      get held() {
        return focusHold;
      },
      get step() {
        return step;
      },
      get changes() {
        return changes;
      },
      get source() {
        return lastSource;
      },
      get busy() {
        return g.active;
      },
      go: (i) => change(i, 'api'),
      pause: (on = true) => {
        playing = !on;
        markPause();
        arm();
      },
    };
  },
};
