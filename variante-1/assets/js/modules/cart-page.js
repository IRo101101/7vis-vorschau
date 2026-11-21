/**
 * cart-page: /warenkorb, the page of the cart (PLAN 3 "Warenkorb-Panel, /warenkorb: Shell und Rückfallseite",
 * PLAN 6 steps 2 and 3).
 *
 * The page is the target of the buy box form without script (GET ?variante=…&menge=…): with the runtime
 * this module takes such a request over once (adds through the adapter, then drops the query from the
 * address), which also covers a buy box whose module failed. In the PHP shop the server does it.
 * Lines, quantities, removing, subtotal and a shipping preview per country (sample rule) like the panel;
 * the states empty, loading (aria-busy, dimmed line), error and sold out (line note, checkout blocked).
 * Markup: warenkorb.html ([data-cart-page-*] plus the line template of shop/zeilen.js).
 */
import { adapter } from '../shop/muster.js';
import { formatBetrag } from '../shop/muster-daten.js';
import { zeilenRendern } from '../shop/zeilen.js';

export default {
  name: 'cart-page',
  options: {},

  setup(ctx) {
    const { el, store, motion } = ctx;
    const q = (s) => el.querySelector(s);
    const list = q('[data-cart-page-list]');
    const tpl = q('[data-cart-page-template]');
    if (!list || !tpl) return null;
    const statusEl = q('[data-cart-page-status]');
    const land = q('[data-cart-page-land]');
    const shipOut = q('[data-cart-page-ship]');
    const checkout = q('[data-cart-page-checkout]');
    const shipBefore = shipOut ? shipOut.textContent : '';
    // Texts the page writes (count, subtotal) and the country choice, as the markup has them.
    const textBefore = new Map([...el.querySelectorAll('[data-cart-page-count], [data-cart-page-subtotal]')].map((n) => [n, n.textContent]));
    const landBefore = land ? land.value : null;
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    const pending = new Set();
    let cart = null;
    let alive = true;
    const W = () => (store.get('shop:waehrung') === 'EUR' ? 'EUR' : 'CHF');
    const fmt = (geld) => adapter.betrag(geld, 'de-CH', W());

    function say(kind) {
      if (!statusEl) return;
      for (const m of statusEl.querySelectorAll('[data-cart-page-msg]')) m.hidden = m.getAttribute('data-cart-page-msg') !== kind;
    }

    async function shipping() {
      if (!shipOut || !land) return;
      const v = await adapter.versandvorschau(land.value);
      if (!alive) return;
      const a = v.arten[0];
      shipOut.textContent = `${a.name}, ${a.frist}: ${formatBetrag(a.preis[W()], W())}`;
    }

    function render() {
      if (!alive || !cart) return;
      zeilenRendern(list, tpl, cart, { fmt, pending, motion });
      const has = cart.zeilen.length > 0;
      for (const n of el.querySelectorAll('[data-cart-page-when]')) n.hidden = n.getAttribute('data-cart-page-when') !== (has ? 'voll' : 'leer');
      const c = q('[data-cart-page-count]');
      if (c) c.textContent = String(cart.menge);
      const s = q('[data-cart-page-subtotal]');
      if (s) s.textContent = fmt(cart.zwischensumme);
      const b = q('[data-cart-page-blocked]');
      if (b) b.hidden = !has || cart.bestellbar;
      if (checkout) {
        if (has && !cart.bestellbar) checkout.setAttribute('aria-disabled', 'true');
        else checkout.removeAttribute('aria-disabled');
      }
      shipping();
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
        if (li.isConnected) li.setAttribute('data-cart-line-error', (err && err.code) || 'stoerung');
        say('fehler');
        cart = await adapter.warenkorb();
      } finally {
        pending.delete(id);
        if (alive) {
          if (!pending.size) list.removeAttribute('aria-busy');
          render();
        }
      }
    }

    ctx.listen(list, 'change', (e) => {
      const sel = e.target.closest('[data-cart-line-qty]');
      const li = sel && sel.closest('[data-cart-line]');
      if (!li) return;
      const n = Number(sel.value); // read before the pending render writes the old value back
      change(li, () => adapter.menge_aendern(li.getAttribute('data-cart-line'), n));
    });
    ctx.listen(list, 'click', (e) => {
      const rm = e.target.closest('[data-cart-line-remove]');
      const li = rm && rm.closest('[data-cart-line]');
      if (!li || pending.has(li.getAttribute('data-cart-line'))) return;
      const neighbour = li.nextElementSibling || li.previousElementSibling;
      const focused = li.contains(document.activeElement);
      change(li, () => adapter.entfernen(li.getAttribute('data-cart-line'))).then(() => {
        if (!focused || li.isConnected) return;
        const btn = neighbour && neighbour.isConnected ? neighbour.querySelector('[data-cart-line-remove]') : null;
        (btn || q('[data-cart-page-title]') || el).focus({ preventScroll: true });
      });
    });
    if (land) ctx.listen(land, 'change', shipping);
    if (checkout) ctx.listen(checkout, 'click', (e) => {
      if (checkout.getAttribute('aria-disabled') === 'true') e.preventDefault();
    });
    ctx.on('shop:waehrung', render);
    ctx.own(adapter.bei_aenderung((w) => {
      cart = w;
      render();
    }));

    // Take over a request of the buy box form (no script there, or its module failed).
    const params = new URLSearchParams(location.search);
    const variante = params.get('variante');
    const start = variante
      ? adapter.hinzufuegen(variante, Number(params.get('menge')) || 1).then(() => say('hinzugefuegt')).catch(() => say('fehler')).finally(() => {
        const u = new URL(location.href);
        u.search = '';
        history.replaceState(history.state, '', u.href);
      })
      : Promise.resolve();
    start.then(() => adapter.warenkorb()).then((w) => {
      if (!alive) return;
      cart = w;
      render();
    });

    ctx.onDestroy(() => {
      alive = false;
      list.textContent = '';
      list.removeAttribute('aria-busy');
      for (const [n, h] of hiddenBefore) n.hidden = h;
      if (checkout) checkout.removeAttribute('aria-disabled');
      if (shipOut) shipOut.textContent = shipBefore;
      for (const [n, t] of textBefore) n.textContent = t;
      if (land) land.value = landBefore;
    });

    return {
      get cart() {
        return cart;
      },
    };
  },
};
