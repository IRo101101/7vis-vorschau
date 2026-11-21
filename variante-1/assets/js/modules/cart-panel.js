/**
 * cart-panel: the cart drawer of the shell (IS 5, IM 11.12, Drehbuch 2.2, PLAN 5 no. 44 and 50).
 *
 * Markup (shell, outside [data-view]; hidden without the runtime, /warenkorb is the page without script):
 *   <div class="korb" data-mod="cart-panel" data-needs-core>
 *     <div data-cart-panel-backdrop></div>
 *     <section role="dialog" aria-modal="true" aria-labelledby="…" data-cart-panel-panel data-theme="hell">
 *       [data-cart-panel-child] header with [data-cart-panel-title="voll|leer"] and [data-cart-panel-close],
 *       [data-cart-panel-status] (role=status) with [data-cart-panel-msg="laedt|fehler|ausverkauft|aktualisiert"],
 *       <ul data-cart-panel-list>, <template data-cart-panel-template> (one line, all labels in the HTML),
 *       [data-cart-panel-empty], [data-cart-panel-summary] with [data-cart-panel-count], [data-cart-panel-subtotal]
 *       and [data-cart-panel-checkout]
 *     </section>
 *   </div>
 *
 * The neutral shop interface (PLAN 6) is the only source of the cart; the panel's open state is ours
 * (PLAN 6 "Den Zustand des Panels führt das Front-End"): store 'shop:panel' = zu | oeffnet | offen | schliesst.
 * Opens on a click on the cart button of the header ([data-nav-cart]) and on the event 'shop:panel-oeffnen'
 * (the buy box after adding, as the reference does: refmedia F19). Closes on the close button, Escape, a
 * click outside (fixed: the reference ignores it, F19) and at the start of a page change.
 *
 * Motion (TIMING.cart, refmedia clip cart): panel x 100 % -> 0 and opacity 0 -> 1 in 0.5 s ("paneel"),
 * children from x -12 % with 0.06 s between them; closing: children fade in 0.25 s (0.03 s, from the last),
 * the panel slides out in 0.5 s and fades in its last 0.3 s. A line being changed dims to 0.5 until the
 * adapter answers (F20). Reduced motion: states are set at once.
 * Focus: on open to the close button, Tab stays in the panel, on close back to where it came from. Removing
 * a line moves the focus to the next line or the panel title (the reference lost it to the body).
 * Lines are clones of the template; their quantity fields are qty-select modules started by the core's
 * observer, as the reference starts modules in cloned cart lines (IS 1).
 * The panel also owns the chosen currency (store 'shop:waehrung', <html data-waehrung>, kept per browser).
 */
import { core } from '../core/core.js';
import { TIMING } from '../motion/curves.js';
import { adapter } from '../shop/muster.js';
import { zeilenRendern } from '../shop/zeilen.js';

const T = TIMING.cart;
const WKEY = 'v1-waehrung';
const FOCUSABLE = 'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function readWaehrung() {
  try {
    const w = globalThis.localStorage && globalThis.localStorage.getItem(WKEY);
    return w === 'EUR' ? 'EUR' : 'CHF';
  } catch (err) {
    return 'CHF';
  }
}

export default {
  name: 'cart-panel',
  options: {},

  setup(ctx) {
    const { el, store, motion, scroll } = ctx;
    const html = document.documentElement;
    const q = (sel) => el.querySelector(sel);
    const panel = q('[data-cart-panel-panel]');
    const backdrop = q('[data-cart-panel-backdrop]');
    const closeBtn = q('[data-cart-panel-close]');
    const list = q('[data-cart-panel-list]');
    const tpl = q('[data-cart-panel-template]');
    const empty = q('[data-cart-panel-empty]');
    const summary = q('[data-cart-panel-summary]');
    const statusEl = q('[data-cart-panel-status]');
    const countEl = q('[data-cart-panel-count]');
    const subtotalEl = q('[data-cart-panel-subtotal]');
    const checkout = q('[data-cart-panel-checkout]');
    const titles = [...el.querySelectorAll('[data-cart-panel-title]')];
    if (!panel || !list || !tpl) {
      ctx.warn('markup incomplete, the panel stays off');
      return null;
    }
    const children = () => [...panel.querySelectorAll('[data-cart-panel-child]')].filter((c) => !c.hidden);
    // The hidden flags as the markup has them (destroy puts them back exactly).
    const hiddenBefore = new Map([el, ...el.querySelectorAll('[hidden], [data-cart-panel-title], [data-cart-panel-msg], [data-cart-panel-child]')].map((n) => [n, n.hidden]));
    for (const n of [list, empty, summary].filter(Boolean)) hiddenBefore.set(n, n.hidden);
    const textBefore = new Map([countEl, subtotalEl].filter(Boolean).map((n) => [n, n.textContent]));
    const g = motion.group();
    let state = 'zu';
    let cart = null;
    let back = null;
    let alive = true;
    const pending = new Set();

    /* ---------- currency (owned here: the shell is on every page) ---------- */

    if (!store.get('shop:waehrung')) store.set('shop:waehrung', readWaehrung());
    const applyWaehrung = (w) => {
      html.setAttribute('data-waehrung', w === 'EUR' ? 'EUR' : 'CHF');
      try {
        if (globalThis.localStorage) globalThis.localStorage.setItem(WKEY, w);
      } catch (err) {
        /* per-viewer convenience only */
      }
      render();
    };
    ctx.on('shop:waehrung', applyWaehrung);

    /* ---------- state and attributes ---------- */

    const triggers = () => [...document.querySelectorAll('[data-nav-cart]')];
    const remembered = new Map();
    function markTriggers(open) {
      for (const t of triggers()) {
        if (!remembered.has(t)) remembered.set(t, { exp: t.getAttribute('aria-expanded'), pop: t.getAttribute('aria-haspopup'), ctl: t.getAttribute('aria-controls') });
        t.setAttribute('aria-haspopup', 'dialog');
        t.setAttribute('aria-controls', panel.id);
        t.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
    }

    function setState(next) {
      state = next;
      el.setAttribute('data-cart-panel-state', next);
      store.set('shop:panel', next);
      markTriggers(next === 'oeffnet' || next === 'offen');
    }

    // Everything outside the panel is out of reach while it is open (aria-modal plus inert for keyboards).
    const outside = () => [document.querySelector('header.kopf'), core.view && core.view.root].filter(Boolean);
    const madeInert = new Set();
    function inertOutside(on) {
      if (on) {
        for (const n of outside()) {
          if (!n.inert) {
            n.inert = true;
            madeInert.add(n);
          }
        }
      } else {
        for (const n of madeInert) n.inert = false;
        madeInert.clear();
      }
    }

    function closedLook() {
      motion.set(panel, { xPercent: 100, opacity: 0 });
      motion.set(children(), { xPercent: 0, opacity: 1 });
      panel.inert = true;
      el.hidden = false;
    }

    /* ---------- open and close ---------- */

    function open(source) {
      if (state === 'offen' || state === 'oeffnet') return;
      g.kill();
      const active = source instanceof Element ? source : document.activeElement;
      back = active && active !== document.body && !panel.contains(active) ? active : null;
      setState('oeffnet');
      panel.inert = false;
      inertOutside(true);
      if (!store.get('webgl:freeze')) scroll.stop();
      const t0 = motion.now();
      const kids = children();
      motion.set(panel, { xPercent: 100, opacity: 0 });
      motion.set(kids, { xPercent: T.open.childFromX, opacity: 0 });
      g.tween(panel, { xPercent: 0, opacity: 1 }, { at: t0, duration: T.open.duration, ease: T.open.ease });
      g.tween(kids, { xPercent: 0, opacity: 1 }, { at: t0, duration: T.open.duration, ease: T.open.ease, stagger: T.open.childStagger });
      ctx.nextFrame(() => (closeBtn || panel).focus({ preventScroll: true }), 'late');
      g.all().then((ok) => {
        if (ok && state === 'oeffnet') setState('offen');
      });
      render();
    }

    function finishClose(returnFocus) {
      motion.set(children(), { xPercent: 0, opacity: 1 });
      motion.set(panel, { xPercent: 100, opacity: 0 });
      panel.inert = true;
      inertOutside(false);
      setState('zu');
      if (!store.get('webgl:freeze')) scroll.start();
      if (returnFocus) {
        const target = back && back.isConnected && !back.closest('[inert]') ? back : triggers()[0];
        if (target) target.focus({ preventScroll: true });
      }
      back = null;
    }

    function close({ instant = false, returnFocus = true } = {}) {
      if (state === 'zu' || state === 'schliesst') return;
      g.kill();
      if (instant || ctx.reduced) {
        finishClose(returnFocus);
        return;
      }
      setState('schliesst');
      const c = T.close;
      const t0 = motion.now();
      g.tween(children(), { opacity: 0 }, { at: t0, duration: c.childDuration, ease: 'power1.out', stagger: { each: c.childStagger, from: 'end' } });
      g.tween(panel, { xPercent: 100 }, { at: t0, duration: c.slideDuration, ease: T.open.ease });
      g.tween(panel, { opacity: 0 }, { at: t0, delay: c.slideDuration - c.fadeLead, duration: c.fadeDuration, ease: c.fadeEase });
      // Focus leaves the panel at once (it becomes inert at the end).
      if (returnFocus) {
        const target = back && back.isConnected ? back : triggers()[0];
        inertOutside(false);
        if (target) target.focus({ preventScroll: true });
      }
      g.all().then((ok) => {
        if (ok && state === 'schliesst') finishClose(false);
      });
    }

    /* ---------- lines ---------- */

    const fmt = (geld) => adapter.betrag(geld, 'de-CH', store.get('shop:waehrung') || 'CHF');

    function render() {
      if (!alive || !cart) return;
      zeilenRendern(list, tpl, cart, { fmt, pending, motion });
      const has = cart.zeilen.length > 0;
      for (const t of titles) t.hidden = t.getAttribute('data-cart-panel-title') !== (has ? 'voll' : 'leer');
      if (empty) empty.hidden = has;
      if (summary) summary.hidden = !has;
      list.hidden = !has;
      if (countEl) countEl.textContent = String(cart.menge);
      if (subtotalEl) subtotalEl.textContent = fmt(cart.zwischensumme);
      if (checkout) {
        const blocked = !cart.bestellbar;
        checkout.toggleAttribute('aria-disabled', blocked);
        if (blocked) checkout.setAttribute('aria-disabled', 'true');
        checkout.setAttribute('data-cart-panel-blocked', blocked ? 'true' : 'false');
      }
      el.setAttribute('data-cart-panel-filled', has ? 'true' : 'false');
    }

    function say(kind) {
      if (!statusEl) return;
      for (const m of statusEl.querySelectorAll('[data-cart-panel-msg]')) m.hidden = m.getAttribute('data-cart-panel-msg') !== kind;
      statusEl.setAttribute('data-cart-panel-say', kind || '');
    }

    async function change(li, fn) {
      const id = li.getAttribute('data-cart-line');
      pending.add(id);
      li.removeAttribute('data-cart-line-error');
      list.setAttribute('aria-busy', 'true');
      say('laedt');
      render();
      try {
        cart = await fn();
        say('aktualisiert');
      } catch (err) {
        if (!alive) return;
        if (li.isConnected) li.setAttribute('data-cart-line-error', err && err.code ? err.code : 'stoerung');
        say(err && err.code === 'stoerung' ? 'fehler' : err && (err.code === 'bestand' || err.code === 'ausverkauft') ? 'ausverkauft' : 'fehler');
        cart = await adapter.warenkorb();
      } finally {
        pending.delete(id);
        if (alive) {
          if (!pending.size) list.removeAttribute('aria-busy');
          render();
        }
      }
    }

    function focusAfterRemove(next) {
      ctx.nextFrame(() => {
        if (state !== 'offen' && state !== 'oeffnet') return;
        const btn = next && next.isConnected ? next.querySelector('[data-cart-line-remove]') : null;
        if (btn) btn.focus({ preventScroll: true });
        else if (empty && !empty.hidden) (empty.querySelector(FOCUSABLE) || panel).focus({ preventScroll: true });
        else panel.focus({ preventScroll: true });
      }, 'late');
    }

    ctx.listen(list, 'change', (e) => {
      const sel = e.target.closest('[data-cart-line-qty]');
      if (!sel) return;
      const li = sel.closest('[data-cart-line]');
      const id = li && li.getAttribute('data-cart-line');
      if (!id) return;
      const n = Number(sel.value); // read before the pending render writes the old value back
      change(li, () => adapter.menge_aendern(id, n));
    });
    ctx.listen(list, 'click', (e) => {
      const rm = e.target.closest('[data-cart-line-remove]');
      if (!rm) return;
      const li = rm.closest('[data-cart-line]');
      const id = li && li.getAttribute('data-cart-line');
      if (!id || pending.has(id)) return;
      const wasFocused = li.contains(document.activeElement);
      const neighbour = li.nextElementSibling || li.previousElementSibling;
      change(li, () => adapter.entfernen(id)).then(() => {
        if (wasFocused && !li.isConnected) focusAfterRemove(neighbour);
      });
    });

    /* ---------- triggers ---------- */

    // Capture phase: the cart button is a link, and the page router (also on document) must not follow it.
    ctx.listen(document, 'click', (e) => {
      const t = e.target.closest && e.target.closest('[data-nav-cart]');
      if (!t || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (state === 'offen' || state === 'oeffnet') close();
      else open(t);
    }, { capture: true });
    if (closeBtn) ctx.listen(closeBtn, 'click', () => close());
    if (backdrop) ctx.listen(backdrop, 'pointerdown', (e) => {
      e.preventDefault();
      close();
    });
    ctx.listen(document, 'keydown', (e) => {
      if (state !== 'offen' && state !== 'oeffnet') return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter((n) => !n.closest('[hidden]') && n.getClientRects().length);
      if (!items.length) {
        e.preventDefault();
        panel.focus({ preventScroll: true });
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    });
    // A blocked checkout (sold-out line) stays a link for the document, but does not navigate.
    if (checkout) ctx.listen(checkout, 'click', (e) => {
      if (checkout.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
        say('ausverkauft');
      }
    });
    ctx.on('shop:panel-oeffnen', (data) => open(data && data.quelle));
    ctx.on('page:out', () => close({ returnFocus: false }));
    ctx.on('webgl:freeze', (on) => on && state !== 'zu' && close({ returnFocus: false }));

    /* ---------- data ---------- */

    adapter.warenkorb().then((w) => {
      if (!alive) return;
      cart = w;
      render();
    });
    ctx.own(adapter.bei_aenderung((w) => {
      cart = w;
      render();
    }));

    closedLook();
    setState('zu');
    html.setAttribute('data-waehrung', store.get('shop:waehrung') === 'EUR' ? 'EUR' : 'CHF');

    ctx.onDestroy(() => {
      alive = false;
      g.kill();
      inertOutside(false);
      if (state !== 'zu' && !store.get('webgl:freeze')) scroll.start();
      list.textContent = '';
      list.removeAttribute('aria-busy');
      for (const c of panel.querySelectorAll('[data-cart-panel-child]')) {
        c.style.removeProperty('transform');
        c.style.removeProperty('opacity');
        if (!c.getAttribute('style')) c.removeAttribute('style');
      }
      for (const [n, h] of hiddenBefore) n.hidden = h;
      for (const [n, t] of textBefore) n.textContent = t;
      if (statusEl) statusEl.removeAttribute('data-cart-panel-say');
      panel.style.removeProperty('transform');
      panel.style.removeProperty('opacity');
      if (!panel.getAttribute('style')) panel.removeAttribute('style');
      panel.inert = false;
      for (const [t, r] of remembered) {
        for (const [attr, v] of [['aria-expanded', r.exp], ['aria-haspopup', r.pop], ['aria-controls', r.ctl]]) {
          if (v === null) t.removeAttribute(attr);
          else t.setAttribute(attr, v);
        }
      }
      if (checkout) {
        checkout.removeAttribute('aria-disabled');
        checkout.removeAttribute('data-cart-panel-blocked');
      }
      el.removeAttribute('data-cart-panel-state');
      el.removeAttribute('data-cart-panel-filled');
      html.removeAttribute('data-waehrung');
      store.set('shop:panel', 'zu');
    });

    return {
      open,
      close,
      get state() {
        return state;
      },
      get cart() {
        return cart;
      },
    };
  },
};
