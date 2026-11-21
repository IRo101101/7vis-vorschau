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
 * 1 Colour (IM 11.11, refmedia v1 F7): the bar takes the tone of what lies under the centre of the screen on
 *   a line 4 px below its bottom edge, as in the reference; the colour changes by CSS in 0.35 s. Correction A
 *   (finding 5): each link and the word mark also take the tone of what lies under their own centre, 4 px
 *   below their own text (data-theme on the item), so a light card or image under a part of the bar no longer carries light
 *   text; an item with an edge under it (another tone left and right) gets a backdrop in its own surface
 *   colour (data-nav-grund="an"). The tone comes from a hit test (elementsFromPoint) of the painted surface:
 *   background colour by luminance, images by their declared tone (data-bild-ton or --bild-ton), background
 *   images by their theme. One pass in every frame in which the page moved, on layout changes and twice a
 *   second at rest. Below 768 px the bar is light and fixed (as in the reference).
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
import { TIMING } from '../motion/curves.js';

const T = TIMING.nav;

export default {
  name: 'nav',
  options: {
    lineOffset: T.lineOffset,
    fixedAt: 'ml m',
    lightAbove: 0.18,
    idleCheckMs: 500,
  },

  setup(ctx) {
    const { el, opts, store, motion } = ctx;
    const html = document.documentElement;

    /* ---------- 1 colour of the bar and of each item ---------- */

    let theme = el.getAttribute('data-theme') || 'hell';
    const original = theme;
    // Links and the word mark of the bar (not the links inside the preview panel).
    const marks = [...el.querySelectorAll('a')].filter((a) => !a.closest('[data-nav-shop-panel]'));
    const itemTone = new Map();
    let passes = 0;
    let lastCost = 0;

    const fixed = () => String(opts.fixedAt).split(/\s+/).includes(store.get('viewport')?.bp);

    function apply(next) {
      if (next === theme) return;
      theme = next;
      el.setAttribute('data-theme', next);
    }

    function setItem(a, tone, mixed) {
      const prev = itemTone.get(a);
      if (prev && prev.tone === tone && prev.mixed === mixed) return;
      itemTone.set(a, { tone, mixed });
      if (tone) a.setAttribute('data-theme', tone);
      else a.removeAttribute('data-theme');
      if (mixed) a.setAttribute('data-nav-grund', 'an');
      else a.removeAttribute('data-nav-grund');
    }

    function clearItems() {
      for (const a of marks) setItem(a, null, false);
    }

    const toneOfColour = (rgb) => {
      const f = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      };
      // Above this luminance dark text has the better contrast (black and white meet near 0.18).
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]) > opts.lightAbove ? 'hell' : 'invers';
    };
    const themeOf = (node) => {
      const t = node.closest('[data-theme]');
      return t && t.getAttribute('data-theme') === 'invers' ? 'invers' : 'hell';
    };

    /**
     * Tone of the surface painted at a point of the viewport: the topmost element under it (outside the bar)
     * that paints something there. A background colour decides by its luminance, an image by its declared
     * tone (data-bild-ton, or --bild-ton in CSS; otherwise the theme it stands in), a background image by
     * its theme. Transparent elements and elements faded below half opacity are looked through.
     */
    function surfaceAt(x, y, cache) {
      const key = `${Math.round(x)}`;
      if (cache.has(key)) return cache.get(key);
      let tone = null;
      const opacityOf = (node) => {
        let o = 1;
        for (let n = node; n && n.nodeType === 1 && o >= 0.5; n = n.parentElement) {
          let v = cache.get(n);
          if (v === undefined) {
            v = Number(getComputedStyle(n).opacity);
            cache.set(n, v);
          }
          o *= v;
        }
        return o;
      };
      for (const node of document.elementsFromPoint(x, y)) {
        if (el.contains(node)) continue;
        if (node === document.documentElement || node === document.body) break;
        if (opacityOf(node) < 0.5) continue;
        const tag = node.tagName;
        if (tag === 'IMG' || tag === 'VIDEO' || tag === 'PICTURE') {
          const holder = node.closest('[data-bild-ton]');
          const declared = (holder && holder.getAttribute('data-bild-ton')) || getComputedStyle(node).getPropertyValue('--bild-ton').trim();
          tone = declared === 'hell' || declared === 'invers' ? declared : themeOf(node);
          break;
        }
        const cs = getComputedStyle(node);
        const m = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor);
        if (m) {
          const c = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
          if ((c.length < 4 ? 1 : c[3]) >= 0.5) {
            tone = toneOfColour(c);
            break;
          }
        }
        if (cs.backgroundImage && cs.backgroundImage !== 'none') {
          tone = themeOf(node);
          break;
        }
      }
      if (!tone) tone = 'hell';
      cache.set(key, tone);
      return tone;
    }

    // Box of what the item shows: the text of a link, the word mark of the mark.
    function textBox(a) {
      const svg = a.querySelector('svg');
      let r;
      if (svg) r = svg.getBoundingClientRect();
      else {
        const range = document.createRange();
        range.selectNodeContents(a);
        r = range.getBoundingClientRect();
      }
      return r.width && r.height ? r : null;
    }

    // One pass: the bar takes the tone under the centre of the screen at the line 4 px below it (IM 11.11),
    // each link and the mark the tone under their own centre, 4 px below their text; a link with a different tone left and right of
    // it (an edge of a card or an image under it) gets its own backdrop (data-nav-grund).
    function pass() {
      if (!el.isConnected) return;
      if (fixed()) {
        apply(original);
        clearItems();
        return;
      }
      const t0 = performance.now();
      const fit = (v) => Math.min(innerHeight - 1, Math.max(0, v));
      const caches = new Map();
      const at = (x, y) => {
        const k = Math.round(y);
        if (!caches.has(k)) caches.set(k, new Map());
        return surfaceAt(x, k, caches.get(k));
      };
      apply(at(innerWidth / 2, fit(el.getBoundingClientRect().bottom + opts.lineOffset)));
      for (const a of marks) {
        const r = textBox(a);
        if (!r) {
          setItem(a, null, false);
          continue;
        }
        // The same rule per item: 4 px below its own text, so small surfaces right under the bar (a button
        // row of a card) count where the text stands, not where the bar ends.
        const y = fit(r.bottom + opts.lineOffset);
        const inset = Math.min(4, r.width / 4);
        const mid = at(r.left + r.width / 2, y);
        const mixed = at(r.left + inset, y) !== mid || at(r.right - inset, y) !== mid;
        setItem(a, mid, mixed);
      }
      passes += 1;
      lastCost = performance.now() - t0;
    }

    // After every scroll movement (in the frame that moved, after the engine wrote it), on layout changes,
    // and twice a second while nothing scrolls, for content that moves by itself under the bar.
    let lastY = null;
    let lastPass = 0;
    let dirty = true;
    ctx.frame(() => {
      const y = scrollY;
      const now = performance.now();
      if (y !== lastY || dirty || now - lastPass > opts.idleCheckMs) {
        lastY = y;
        dirty = false;
        lastPass = now;
        pass();
      }
    }, 'late');
    const scan = () => {
      dirty = true;
    };
    ctx.on('viewport', scan);
    ctx.on('page:in', scan);
    ctx.on('layout:change', scan);
    ctx.on('transition:settled', scan);
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
      clearItems();
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
      get items() {
        return marks.map((a) => ({ name: a.textContent.trim() || a.getAttribute('aria-label'), ...(itemTone.get(a) || { tone: null, mixed: false }) }));
      },
      get passes() {
        return passes;
      },
      get cost() {
        return lastCost;
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
