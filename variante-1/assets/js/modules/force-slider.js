/**
 * force-slider: the forces slider of the home page (IM 11.7, PLAN 4 section 2, PLAN 5 no. 19 and 20,
 * spike S2). Seven positions "01 Wärmen" to "07 Entnehmen".
 *
 * Markup (complete without script: seven blocks with jump marks, PLAN 9 no. 11):
 *   <section class="sx kraefte-slider" data-theme="invers" data-mod="force-slider" data-guard>
 *     <div data-force-slider-surface data-needs-core><div data-force-slider-wipe></div></div>
 *     <nav aria-label="…"><button data-force-slider-prev …> <ol>
 *       <li><a id="s2-tab-01" href="#s2-kraft-01" data-force-slider-nav aria-label="…">…</a></li> …
 *     </ol><button data-force-slider-next …></nav>
 *     <ol data-force-slider-list>
 *       <li id="s2-kraft-01" data-force-slider-panel>
 *         … <h3 class="t-riesig" data-force-slider-title>Wärmen</h3>
 *         <p data-force-slider-line>röstet die grüne Bohne</p> …
 *         <div data-force-slider-card><div data-force-slider-strip>link or card</div></div>
 *       </li> …
 *     </ol>
 *   </section>
 *
 * Modes (decided by the breakpoint, data-force-slider-list-at, default "ml m"):
 *   slider  panels stacked, one visible; tabs (role tab) switch by click, Enter, Space, arrow keys,
 *           Home, End, the step buttons and the figure drag ('slider:drag')
 *   list    the HTML as it is: seven blocks, the markers stay jump marks; the index follows the block at
 *           the reading line, 30 % from the top of the viewport (source 'scroll')
 *
 * A change (IM 10, IM 11.7): the old title falls back into its masks (0.6 s, 0.01 s per character from the
 * end, 0.06 s per line, power3.in), the new one rises after half the exit time plus 0.06 s (1.2 s, 0.02 s,
 * 0.12 s, curve "titel"); the effect line follows like a text block (1.0 s, 0.02 s, "karte-text"); the
 * card content moves as a vertical strip (0.6 s, "streifen"); the surface wipes in (2.0 s, expo.inOut) and
 * then takes the new tone. Lock 2 s (IM 11.7). Wipe side (data-force-slider-wipe-from): 'right' (default,
 * the reference: from the right edge in every change, also backwards, refmedia v1 F10) or 'movement'
 * (from the side the change comes from, spike S2).
 * Inputs during the lock are not dropped: the latest one is queued and runs when the lock ends.
 *
 * Coupling only through the store (CONTRACT section 7):
 *   'slider:index'  value  null or { index, previous, direction, count, source, seq }, set when a change starts
 *   'slider:locked' value  true while a change runs
 *   'slider:armed'  value  true when a figure drag may switch: slider mode, not locked, slider covers the view
 *   'slider:drag'   event  { direction: +1 | -1 } from the figure (S1) or its stand-in: one step
 * Reduced motion: nothing is split or moved, changes are instant, no lock; only the surface colour changes.
 * Destroy restores the markup exactly.
 */
import { splitText } from '../text/split.js';
import { fitWords } from '../text/fit.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.slider;
const TR = TIMING.textrise;
const SEL = Object.freeze({
  panel: '[data-force-slider-panel]',
  title: '[data-force-slider-title]',
  line: '[data-force-slider-line]',
  strip: '[data-force-slider-strip]',
  nav: '[data-force-slider-nav]',
  prev: '[data-force-slider-prev]',
  next: '[data-force-slider-next]',
  list: '[data-force-slider-list]',
  surface: '[data-force-slider-surface]',
  wipe: '[data-force-slider-wipe]',
});

/** Remembers original attribute values so a deactivation restores the markup exactly. */
function attributeRecorder() {
  const saved = new Map();
  const note = (el, name) => {
    let m = saved.get(el);
    if (!m) {
      m = new Map();
      saved.set(el, m);
    }
    if (!m.has(name)) m.set(name, el.getAttribute(name));
  };
  return {
    keep: note,
    set(el, name, value) {
      if (!el) return;
      note(el, name);
      if (value === null || value === false) el.removeAttribute(name);
      else el.setAttribute(name, value === true ? '' : String(value));
    },
    restore() {
      for (const [el, m] of saved) {
        for (const [name, value] of m) {
          if (value === null) el.removeAttribute(name);
          // Styles only through the CSSOM: setAttribute('style') counts as an inline style for the CSP.
          else if (name === 'style') el.style.cssText = value;
          else el.setAttribute(name, value);
        }
      }
      saved.clear();
    },
  };
}

export default {
  name: 'force-slider',
  options: {
    listAt: 'ml m',
    wipeFrom: 'right',
    lock: T.lock,
    wrap: true,
    duration: T.in.duration,
    charStagger: T.in.charStagger,
    stagger: T.in.lineStagger,
    ease: T.in.ease,
    exitDuration: T.out.duration,
    exitCharStagger: T.out.charStagger,
    exitStagger: T.out.lineStagger,
    exitEase: T.out.ease,
    swapDelay: T.swapDelay,
    lineDuration: TR.duration,
    lineCharStagger: TR.charStagger,
    lineEase: TR.ease,
    stripDuration: T.stripDuration,
    stripEase: T.stripEase,
    bgDuration: T.bgDuration,
    bgEase: T.bgEase,
    navTransition: T.navTransition,
    armCover: 0.75,
    // List mode: the block crossing this band (30 % from the top, the reading position) is the current one.
    readingLine: '-30% 0px -69% 0px',
    rootMargin: '0px 0px -20% 0px',
  },

  setup(ctx) {
    const { el, opts, motion, store } = ctx;
    const panels = [...el.querySelectorAll(SEL.panel)];
    const navs = [...el.querySelectorAll(SEL.nav)];
    const n = panels.length;
    if (!n || navs.length !== n || panels.some((p) => !p.id) || navs.some((a) => !a.id)) {
      ctx.warn('needs one [data-force-slider-nav] with an id per [data-force-slider-panel] with an id', el);
      ctx.release();
      return null;
    }
    const list = el.querySelector(SEL.list);
    const surface = el.querySelector(SEL.surface);
    const wipe = el.querySelector(SEL.wipe);
    const prevBtn = el.querySelector(SEL.prev);
    const nextBtn = el.querySelector(SEL.next);
    const tablist = navs[0].closest('ol, ul');
    const navLabel = navs[0].closest('nav')?.getAttribute('aria-label') || null;
    const parts = panels.map((p) => ({
      el: p,
      title: p.querySelector(SEL.title),
      line: p.querySelector(SEL.line),
      strip: p.querySelector(SEL.strip),
      titleSplit: null,
      lineSplit: null,
    }));

    const rec = attributeRecorder();
    const g = motion.group(); // the running change
    const ge = motion.group(); // the first entrance
    const T0 = { start: 130 };

    let mode = 'off';
    let index = Math.max(0, panels.findIndex((p) => `#${p.id}` === location.hash));
    let seq = 0;
    let locked = false;
    let lockUntil = 0;
    let queued = null;
    let queuedDir = 0;
    let changing = null;
    let entrance = 'pending';
    let covered = false;
    let scheduled = false;

    const wrapIndex = (i) => (opts.wrap ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i)));
    const tone = (i) => (i % 2 === 0 ? 'a' : 'b');
    const dirOf = (line) => (line % 2 === 0 ? 1 : -1);
    const startOf = (sp) => (sp && sp.clearance ? sp.clearance.startPercent : T0.start);
    const animated = () => mode === 'slider' && !ctx.reduced && parts.every((p) => !p.title || p.titleSplit);

    function publish(source, previous, direction) {
      seq += 1;
      store.set('slider:index', Object.freeze({ index, previous, direction, count: n, source, seq }));
    }

    function updateArmed() {
      store.set('slider:armed', mode === 'slider' && !locked && covered);
    }

    function setLocked(value) {
      locked = value;
      store.set('slider:locked', value);
      updateArmed();
    }

    function measureCover() {
      if (mode !== 'slider') {
        covered = false;
        updateArmed();
        return;
      }
      const r = el.getBoundingClientRect();
      const vh = innerHeight;
      const seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      covered = r.height > 0 && seen >= opts.armCover * Math.min(vh, r.height);
      updateArmed();
    }

    /* States: on (active, at rest), in (active, entering), out (leaving: only title, line, card visible), off. */
    function applyStates(active, leaving) {
      parts.forEach((p, i) => {
        const state = i === active ? (changing ? 'in' : 'on') : i === leaving ? 'out' : 'off';
        rec.set(p.el, 'data-force-slider-state', state);
        rec.set(p.el, 'inert', i === active ? null : true);
        rec.set(p.el, 'aria-hidden', i === active ? null : 'true');
      });
      navs.forEach((a, i) => {
        rec.set(a, 'aria-selected', i === active ? 'true' : 'false');
        rec.set(a, 'tabindex', i === active ? '0' : '-1');
      });
    }

    function markQueued() {
      navs.forEach((a, i) => rec.set(a, 'data-force-slider-queued', i === queued ? true : null));
    }

    /* ---------- splitting and measuring ---------- */

    function splitAll() {
      for (const p of parts) {
        if (p.title && !p.titleSplit) {
          rec.keep(p.title, 'style');
          p.titleSplit = splitText(p.title);
        }
        if (p.line && !p.lineSplit) {
          rec.keep(p.line, 'style');
          p.lineSplit = splitText(p.line);
        }
      }
    }

    function unsplitAll() {
      for (const p of parts) {
        if (p.titleSplit) p.titleSplit.restore();
        if (p.lineSplit) p.lineSplit.restore();
        p.titleSplit = null;
        p.lineSplit = null;
      }
    }

    /* All seven names share one size: the smallest fit, so no name looks louder than another. */
    function fitTitles() {
      const fits = [];
      for (const p of parts) {
        if (!p.titleSplit || !p.title.classList.contains('t-riesig')) continue;
        fitWords(p.title, p.titleSplit);
        const v = parseFloat(p.title.style.getPropertyValue('--titel-fit'));
        if (Number.isFinite(v)) fits.push(v);
      }
      if (!fits.length) return;
      const size = `${Math.min(...fits)}px`;
      for (const p of parts) if (p.titleSplit && p.title.classList.contains('t-riesig')) p.title.style.setProperty('--titel-fit', size);
    }

    function relayout() {
      if (mode !== 'slider') return;
      fitTitles();
      for (const p of parts) {
        for (const sp of [p.titleSplit, p.lineSplit]) {
          if (!sp) continue;
          sp.measure();
          sp.measureClearance();
        }
      }
      if (entrance === 'pending') hideActive();
      measureCover();
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      ctx.nextFrame(() => {
        scheduled = false;
        relayout();
      }, 'input');
    }

    /* ---------- pieces of a change ---------- */

    const charsOf = (sp) => (sp ? sp.chars.map((c) => c.inner) : []);

    function hideActive() {
      const p = parts[index];
      if (p.titleSplit) p.titleSplit.lines.forEach((line, i) => motion.set(line.chars.map((c) => c.inner), { yPercent: dirOf(i) * startOf(p.titleSplit) }));
      if (p.lineSplit) motion.set(charsOf(p.lineSplit), { yPercent: startOf(p.lineSplit) });
    }

    function restChars(p, shown) {
      if (p.titleSplit) {
        p.titleSplit.lines.forEach((line, i) => motion.set(line.chars.map((c) => c.inner), { yPercent: shown ? 0 : dirOf(i) * startOf(p.titleSplit) }));
      }
      if (p.lineSplit) motion.set(charsOf(p.lineSplit), { yPercent: shown ? 0 : startOf(p.lineSplit) });
      if (p.strip) motion.set(p.strip, { yPercent: 0 });
    }

    /** Exit of the old title and line; returns the exit time of the title (s). */
    function titleOut(p, t0, group) {
      let total = 0;
      const sp = p.titleSplit;
      if (sp) {
        sp.lines.forEach((line, i) => {
          const chars = line.chars.map((c) => c.inner);
          group.tween(chars, { yPercent: dirOf(i) * startOf(sp) }, {
            at: t0,
            delay: i * opts.exitStagger,
            duration: opts.exitDuration,
            ease: opts.exitEase,
            stagger: { each: opts.exitCharStagger, from: 'end' },
          });
          total = Math.max(total, i * opts.exitStagger + Math.max(0, chars.length - 1) * opts.exitCharStagger + opts.exitDuration);
        });
      }
      if (p.lineSplit) {
        group.tween(charsOf(p.lineSplit), { yPercent: startOf(p.lineSplit) }, {
          at: t0,
          duration: opts.exitDuration,
          ease: opts.exitEase,
          stagger: { each: opts.exitCharStagger, from: 'end' },
        });
      }
      return total;
    }

    function titleIn(p, t0, at, group) {
      const sp = p.titleSplit;
      let lines = 0;
      if (sp) {
        lines = sp.lines.length;
        sp.lines.forEach((line, i) => {
          const chars = line.chars.map((c) => c.inner);
          motion.set(chars, { yPercent: dirOf(i) * startOf(sp) });
          group.tween(chars, { yPercent: 0 }, { at: t0, delay: at + i * opts.stagger, duration: opts.duration, ease: opts.ease, stagger: opts.charStagger });
        });
      }
      if (p.lineSplit) {
        const chars = charsOf(p.lineSplit);
        motion.set(chars, { yPercent: startOf(p.lineSplit) });
        group.tween(chars, { yPercent: 0 }, { at: t0, delay: at + lines * opts.stagger, duration: opts.lineDuration, ease: opts.lineEase, stagger: opts.lineCharStagger });
      }
    }

    function clearWipe() {
      if (!wipe) return;
      motion.set(wipe, { clipLeft: 0, clipRight: 0 });
      rec.set(wipe, 'data-force-slider-tone', null);
    }

    /* ---------- changes ---------- */

    function completeChange() {
      changing = null;
      if (surface) rec.set(surface, 'data-force-slider-tone', tone(index));
      clearWipe();
      applyStates(index, -1);
    }

    function finishChange() {
      if (!changing) return;
      g.finish();
      completeChange();
    }

    function startChange(to, source, direction, instant = false) {
      if (changing) finishChange();
      const from = index;
      if (to === from) return;
      const dir = direction || (to > from ? 1 : -1);
      const p0 = parts[from];
      const p1 = parts[to];
      const hadFocus = p0.el.contains(document.activeElement);
      index = to;
      entrance = 'done';
      ge.finish();
      publish(source, from, dir);

      if (instant || !animated()) {
        g.kill();
        restChars(p0, false);
        restChars(p1, true);
        changing = null;
        if (surface) rec.set(surface, 'data-force-slider-tone', tone(to));
        clearWipe();
        applyStates(to, -1);
      } else {
        setLocked(true);
        lockUntil = motion.now() + opts.lock;
        const myChange = { from, to, dir };
        changing = myChange;
        applyStates(to, from);
        const t0 = motion.now();
        if (wipe) {
          rec.set(wipe, 'data-force-slider-tone', tone(to));
          const fromRight = opts.wipeFrom !== 'movement' || dir > 0;
          const side = fromRight ? 'clipLeft' : 'clipRight';
          motion.set(wipe, { clipLeft: fromRight ? 100 : 0, clipRight: fromRight ? 0 : 100 });
          g.tween(wipe, { [side]: 0 }, { at: t0, duration: opts.bgDuration, ease: opts.bgEase });
        }
        const exit = titleOut(p0, t0, g);
        titleIn(p1, t0, exit / 2 + opts.swapDelay, g);
        if (p0.strip) g.tween(p0.strip, { yPercent: -100 * dir }, { at: t0, duration: opts.stripDuration, ease: opts.stripEase });
        if (p1.strip) {
          motion.set(p1.strip, { yPercent: 100 * dir });
          g.tween(p1.strip, { yPercent: 0 }, { at: t0, duration: opts.stripDuration, ease: opts.stripEase });
        }
        g.all().then(() => {
          if (changing === myChange) completeChange();
        });
      }
      // Focus never stays inside a panel that becomes inert.
      if (hadFocus) navs[to].focus({ preventScroll: true });
    }

    function unlock() {
      setLocked(false);
      if (queued === null) return;
      const q = queued;
      queued = null;
      markQueued();
      if (q !== index) startChange(q, 'queue', queuedDir);
    }

    /** Every input ends here. Returns 'started', 'queued', 'same' or 'ignored'. */
    function request(to, source, direction = 0) {
      if (mode !== 'slider') return 'ignored';
      const target = wrapIndex(to);
      if (locked) {
        queued = target;
        queuedDir = direction;
        markQueued();
        return 'queued';
      }
      if (target === index) return 'same';
      startChange(target, source, direction);
      return 'started';
    }

    const base = () => (queued !== null ? queued : index);
    const step = (delta, source) => request(base() + delta, source, delta);

    /** End state now: running change finished, lock released, a queued target applied at once. */
    function settle() {
      ge.finish();
      finishChange();
      if (locked) setLocked(false);
      if (queued !== null) {
        const q = queued;
        queued = null;
        markQueued();
        if (q !== index) startChange(q, 'queue', 0, true);
      }
    }

    /* ---------- modes ---------- */

    function wantMode() {
      const bp = store.get('viewport')?.bp;
      return String(opts.listAt).split(/\s+/).includes(bp) ? 'list' : 'slider';
    }

    function deactivate() {
      if (mode === 'off') return;
      g.kill();
      ge.kill();
      changing = null;
      queued = null;
      if (locked) setLocked(false);
      unsplitAll();
      for (const p of parts) if (p.strip) motion.set(p.strip, { yPercent: 0 });
      if (wipe) motion.set(wipe, { clipLeft: 0, clipRight: 0 });
      rec.restore();
      mode = 'off';
    }

    function activate(next) {
      if (next === mode) return;
      deactivate();
      mode = next;
      rec.set(el, 'data-force-slider-mode', next);
      if (next === 'slider') {
        rec.keep(el, 'style');
        el.style.setProperty('--slider-nav-dauer', `${opts.navTransition}s`);
        el.style.setProperty('--slider-inaktiv-dauer', `${T.inactiveTransition}s`);
        el.style.setProperty('--slider-inaktiv-deckkraft', String(T.inactiveOpacity));
        el.style.setProperty('--slider-inaktiv-skala', String(T.inactiveScale));
        if (tablist) {
          rec.set(tablist, 'role', 'tablist');
          rec.set(tablist, 'aria-label', navLabel);
        }
        navs.forEach((a, i) => {
          if (a.parentElement && a.parentElement !== tablist) rec.set(a.parentElement, 'role', 'presentation');
          rec.set(a, 'role', 'tab');
          rec.set(a, 'aria-controls', panels[i].id);
        });
        panels.forEach((p, i) => {
          rec.set(p, 'role', 'tabpanel');
          rec.set(p, 'aria-labelledby', navs[i].id);
        });
        if (list) rec.set(list, 'aria-live', 'polite');
        for (const node of [wipe, surface, ...parts.map((p) => p.strip)]) if (node) rec.keep(node, 'style');
        if (surface) rec.set(surface, 'data-force-slider-tone', tone(index));
        applyStates(index, -1);
        if (!ctx.reduced) {
          splitAll();
          fitTitles();
          for (const p of parts) for (const sp of [p.titleSplit, p.lineSplit]) if (sp) {
            sp.measure();
            sp.measureClearance();
          }
          parts.forEach((p, i) => restChars(p, i === index));
          if (entrance === 'pending') hideActive();
        }
      }
      measureCover();
    }

    function playEntrance() {
      if (entrance !== 'pending' || mode !== 'slider') return;
      entrance = 'done';
      titleIn(parts[index], motion.now(), 0, ge);
    }

    /* ---------- inputs (listeners live as long as the module; each checks the mode) ---------- */

    navs.forEach((a, i) => {
      ctx.listen(a, 'click', (event) => {
        if (mode !== 'slider') return;
        event.preventDefault();
        request(i, 'click');
      });
    });
    ctx.listen(tablist || el, 'keydown', (event) => {
      if (mode !== 'slider') return;
      const tab = event.target.closest && event.target.closest(SEL.nav);
      const i = navs.indexOf(tab);
      if (i < 0) return;
      let to = null;
      let delta = 0;
      switch (event.key) {
        case 'ArrowRight':
          to = i + 1;
          delta = 1;
          break;
        case 'ArrowLeft':
          to = i - 1;
          delta = -1;
          break;
        case 'Home':
          to = 0;
          break;
        case 'End':
          to = n - 1;
          break;
        case ' ':
        case 'Spacebar':
          to = i;
          break;
        default:
          return;
      }
      event.preventDefault();
      to = wrapIndex(to);
      request(to, 'key', delta);
      navs[to].focus();
    });
    if (prevBtn) ctx.listen(prevBtn, 'click', () => step(-1, 'button'));
    if (nextBtn) ctx.listen(nextBtn, 'click', () => step(1, 'button'));
    ctx.on('slider:drag', (data) => {
      if (!data || mode !== 'slider') return;
      step(data.direction > 0 ? 1 : -1, 'drag');
    });

    // Lock: checked once per frame against the engine clock (works with the manual test clock).
    ctx.frame(() => {
      if (locked && motion.now() >= lockUntil) unlock();
    }, 'late');

    // List mode: the block crossing the reading line is the current one.
    panels.forEach((p, i) => {
      ctx.watch(p, ({ visible }) => {
        if (mode !== 'list' || !visible || i === index) return;
        const prev = index;
        index = i;
        publish('scroll', prev, i > prev ? 1 : -1);
      }, { rootMargin: opts.readingLine });
    });

    ctx.own(ctx.scroll.on(() => measureCover()));
    ctx.on('layout:change', schedule);
    ctx.on('viewport', () => {
      activate(wantMode());
      schedule();
    });
    ctx.on('motion:reduced', (reduced) => {
      if (!reduced) return;
      settle();
      // Splits stay (nothing moves any more); changes are instant from now on.
      for (const p of parts) restChars(p, p === parts[index]);
    });
    ctx.on('motion:settle', settle);

    ctx.onIn(() => {
      if (mode !== 'slider' || entrance !== 'pending' || ctx.reduced) {
        entrance = 'done';
        return;
      }
      const title = parts[index].title || panels[index];
      ctx.watchOnce('entrance', title, ({ visible }) => visible && playEntrance(), { rootMargin: opts.rootMargin });
    });

    ctx.onDestroy(() => {
      deactivate();
      store.set('slider:index', null);
      store.set('slider:locked', false);
      store.set('slider:armed', false);
    });

    // Start: mode from the breakpoint, initial index published, guard released.
    store.set('slider:locked', false);
    activate(wantMode());
    publish('init', null, 0);
    ctx.release();

    return {
      request: (i) => request(i, 'api'),
      next: () => step(1, 'api'),
      prev: () => step(-1, 'api'),
      settle,
      get index() {
        return index;
      },
      get queued() {
        return queued;
      },
      get locked() {
        return locked;
      },
      get mode() {
        return mode;
      },
      get changing() {
        return !!changing;
      },
      get parts() {
        return parts;
      },
    };
  },
};
