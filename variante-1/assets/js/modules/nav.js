/**
 * nav: the persistent header of the shell (Drehbuch 2.1, PLAN 3, PLAN 5 no. 11 and 12, IM 11.11, IS 2).
 *
 * Markup (outside [data-view]):
 *   <header class="kopf" data-mod="nav" data-theme="hell">
 *     … <li data-nav-shop>
 *         <a href="…" data-nav-shop-trigger aria-controls="…">Werkzeuge</a>
 *         <div id="…" data-nav-shop-panel data-needs-core> … [data-nav-shop-item] … </div>
 *       </li> …
 *     <a href="…" data-nav-cart aria-label="Warenkorb, 0 Artikel">Warenkorb (<span data-nav-cart-count>0</span>)</a>
 *   </header>
 *
 * 1 Colour (IM 11.11, refmedia v1 F7): the header takes the theme of the section under a line 4 px below
 *   its bottom edge; the colour changes by CSS in 0.35 s. One IntersectionObserver with a 2 px band at that
 *   line instead of a hit test on every scroll event (PLAN 5 no. 11). Where sections are stacked (the
 *   slider covering the sticky hero), the one whose top edge is lowest above the line lies on top and wins.
 *   Below 768 px the bar is light and fixed (as in the reference).
 * 2 Preview of the tools (IS 2 "Shop-Dropdown", refmedia v1 clip nav-shop): only on devices with hover;
 *   opens on pointer enter or keyboard focus, panel 0.5 s ("paneel"), items rise from 35 % with 0.06 s
 *   between them; closes on pointer leave, focus leaving, Escape and page change: items fade in 0.25 s
 *   (0.03 s apart, from the last), the panel closes in 0.5 s and fades out in its last 0.3 s.
 *   Fixed against the reference: Escape closes the panel also when the pointer opened it (F15), and the
 *   panel opens below the bar instead of over the next link, so "Die sieben Kräfte" stays reachable.
 *   Without hover (touch) "Werkzeuge" stays a plain link (IS 2).
 * 3 Cart count from the shop adapter (PLAN 6, sample adapter in stage 3): number of units, also in the
 *   accessible name; store 'shop:warenkorb' { menge }.
 */
import { core } from '../core/core.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.nav;

export default {
  name: 'nav',
  options: {
    lineOffset: T.lineOffset,
    fixedAt: 'ml m',
  },

  setup(ctx) {
    const { el, opts, store, motion } = ctx;
    const html = document.documentElement;

    /* ---------- 1 colour of the bar ---------- */

    let io = null;
    const hits = new Set();
    let theme = el.getAttribute('data-theme') || 'hell';
    const original = theme;

    const fixed = () => String(opts.fixedAt).split(/\s+/).includes(store.get('viewport')?.bp);

    function apply(next) {
      if (next === theme) return;
      theme = next;
      el.setAttribute('data-theme', next);
    }

    let watched = [];
    function pick() {
      // DOM order: when two sections share their top edge (the sticky hero and the slider leaving together),
      // the later one is painted on top and wins.
      let best = null;
      let bestTop = -Infinity;
      for (const s of watched) {
        if (!hits.has(s) || !s.isConnected) continue;
        const top = s.getBoundingClientRect().top;
        if (top >= bestTop - 0.5) {
          bestTop = top;
          best = s;
        }
      }
      if (best) apply(best.getAttribute('data-theme') === 'invers' ? 'invers' : 'hell');
    }

    function sections() {
      const root = core.view ? core.view.root : document.querySelector('main[data-view]');
      if (!root) return [];
      return [...root.querySelectorAll(':scope > [data-theme], :scope > * > [data-theme], :scope > footer, :scope > * > footer')].filter((s) => s.hasAttribute('data-theme'));
    }

    function scan() {
      if (io) io.disconnect();
      io = null;
      hits.clear();
      if (fixed()) {
        apply(original);
        return;
      }
      const line = Math.round(el.getBoundingClientRect().bottom + opts.lineOffset);
      const below = Math.max(0, innerHeight - line - 2);
      io = new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) hits.add(e.target);
          else hits.delete(e.target);
        }
        pick();
      }, { rootMargin: `${-line}px 0px ${-below}px 0px`, threshold: 0 });
      watched = sections();
      for (const s of watched) io.observe(s);
    }
    ctx.own(() => io && io.disconnect());
    ctx.on('viewport', () => ctx.nextFrame(scan, 'input'));
    ctx.on('page:in', () => ctx.nextFrame(scan, 'input'));
    ctx.on('transition:settled', () => ctx.nextFrame(scan, 'input'));
    scan();

    /* ---------- 2 preview panel ---------- */

    const wrap = el.querySelector('[data-nav-shop]');
    const trigger = wrap && wrap.querySelector('[data-nav-shop-trigger]');
    const panel = wrap && wrap.querySelector('[data-nav-shop-panel]');
    const items = panel ? [...panel.querySelectorAll('[data-nav-shop-item]')] : [];
    const g = motion.group();
    let state = 'zu';

    const canHover = () => {
      const v = store.get('viewport');
      return !!v && v.hover && !v.coarse;
    };

    function setState(next) {
      state = next;
      if (!wrap) return;
      wrap.setAttribute('data-nav-shop-state', next);
      trigger.setAttribute('aria-expanded', next === 'offen' || next === 'oeffnet' ? 'true' : 'false');
    }

    function open() {
      if (!panel || !canHover() || state === 'offen' || state === 'oeffnet') return;
      g.kill();
      setState('oeffnet');
      const t0 = motion.now();
      motion.set(panel, { clipBottom: 100, opacity: 0 });
      motion.set(items, { yPercent: T.open.itemFrom, opacity: 0 });
      g.tween(panel, { clipBottom: 0, opacity: 1 }, { at: t0, duration: T.open.duration, ease: T.open.ease });
      g.tween(items, { yPercent: 0, opacity: 1 }, { at: t0, duration: T.open.duration, ease: T.open.ease, stagger: T.open.itemStagger });
      g.all().then((ok) => {
        if (ok && state === 'oeffnet') setState('offen');
      });
    }

    function close({ instant = false } = {}) {
      if (!panel || state === 'zu' || state === 'schliesst') return;
      g.kill();
      if (instant || ctx.reduced) {
        motion.set(panel, { clipBottom: 0, opacity: 1 });
        motion.set(items, { yPercent: 0, opacity: 1 });
        setState('zu');
        return;
      }
      setState('schliesst');
      const c = T.close;
      const t0 = motion.now();
      g.tween(items, { opacity: 0 }, { at: t0, duration: c.itemDuration, ease: 'power1.out', stagger: { each: c.itemStagger, from: 'end' } });
      g.tween(panel, { clipBottom: 100 }, { at: t0, duration: c.heightDuration, ease: T.open.ease });
      g.tween(panel, { opacity: 0 }, { at: t0, delay: c.heightDuration - c.fadeLead, duration: c.fadeDuration, ease: c.fadeEase });
      g.all().then((ok) => {
        if (!ok || state !== 'schliesst') return;
        motion.set(panel, { clipBottom: 0, opacity: 1 });
        motion.set(items, { yPercent: 0, opacity: 1 });
        setState('zu');
      });
    }

    if (wrap && trigger && panel) {
      trigger.setAttribute('aria-expanded', 'false');
      setState('zu');
      ctx.listen(wrap, 'pointerenter', (e) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') open();
      });
      ctx.listen(wrap, 'pointerleave', (e) => {
        if (e.pointerType === 'mouse' || e.pointerType === 'pen') {
          if (!wrap.contains(document.activeElement) || document.activeElement === trigger) close();
        }
      });
      // Focus returned to the trigger by Escape must not open the panel again.
      let quiet = false;
      ctx.listen(wrap, 'focusin', () => {
        if (quiet) {
          quiet = false;
          return;
        }
        if (html.getAttribute('data-nav-input') !== 'pointer') open();
      });
      ctx.listen(wrap, 'focusout', (e) => {
        if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) close();
      });
      // Escape closes in every case (the reference ignored it after a pointer open, F15).
      ctx.listen(document, 'keydown', (e) => {
        if (e.key !== 'Escape' || (state !== 'offen' && state !== 'oeffnet')) return;
        const inside = wrap.contains(document.activeElement);
        close();
        if (inside && document.activeElement !== trigger) {
          quiet = true;
          trigger.focus();
        }
      });
      // A click on the trigger with the pointer focuses it; that is not keyboard focus.
      ctx.listen(document, 'pointerdown', () => html.setAttribute('data-nav-input', 'pointer'), { capture: true, passive: true });
      ctx.listen(document, 'keydown', (e) => {
        if (e.key === 'Tab') html.setAttribute('data-nav-input', 'keyboard');
      }, { capture: true });
      ctx.on('page:out', () => close({ instant: true }));
      ctx.on('webgl:freeze', (on) => on && close({ instant: true }));
      ctx.on('viewport', () => !canHover() && close({ instant: true }));
    }

    /* ---------- 3 cart count ---------- */

    const cart = el.querySelector('[data-nav-cart]');
    const count = cart && cart.querySelector('[data-nav-cart-count]');
    const label = cart ? cart.getAttribute('aria-label') : null;
    let menge = count ? Number(count.textContent) || 0 : 0;
    let alive = true;
    function showCount(n) {
      if (!alive || !count) return;
      menge = n;
      count.textContent = String(n);
      cart.setAttribute('aria-label', `Warenkorb, ${n} Artikel`);
      store.set('shop:warenkorb', Object.freeze({ menge: n }));
    }
    if (cart && count) {
      import('../shop/muster.js').then(({ adapter }) => {
        if (!alive) return;
        adapter.warenkorb().then((w) => showCount(w.menge));
        ctx.own(adapter.bei_aenderung((w) => showCount(w.menge)));
      }).catch((err) => ctx.warn('shop adapter not available, the count stays as in the HTML', err));
    }

    ctx.onDestroy(() => {
      alive = false;
      g.kill();
      el.setAttribute('data-theme', original);
      html.removeAttribute('data-nav-input');
      if (wrap) {
        wrap.removeAttribute('data-nav-shop-state');
        trigger.removeAttribute('aria-expanded');
        panel.style.removeProperty('clip-path');
        panel.style.removeProperty('opacity');
      }
      if (cart && label !== null) cart.setAttribute('aria-label', label);
    });

    return {
      get theme() {
        return theme;
      },
      get state() {
        return state;
      },
      get menge() {
        return menge;
      },
      open,
      close,
      scan,
    };
  },
};
