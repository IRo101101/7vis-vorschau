/**
 * order-view: the sample payment page (zahlung-muster.html) and the confirmation (/bestaetigung) of the
 * checkout study (PLAN 6 steps 4 and 5).
 *
 * Option data-order-view-rolle:
 *   'zahlung'      stands for the hosted payment page of Payrexx or wallee. It is NOT part of the site
 *                  (no shell, no router: the hand-off leaves the site like the real one). "Zahlung
 *                  bestätigen" stands for the signed webhook that alone confirms a payment, then the
 *                  browser comes back to /bestaetigung; "Abbrechen" goes back to /kasse.
 *   'bestaetigung' shows the order once the payment is confirmed; an unpaid or unknown order shows its own
 *                  state ([data-order-state="bezahlt|offen|keine"]) and title ([data-order-title], same
 *                  names). The document shows "keine" (no script, no or unknown number: no thanks without
 *                  an order, no sentence with an empty slot). Guests get the offer to open an account with
 *                  the same e-mail address, account holders a link to the account.
 * Order number from ?bestellung=. Everything comes from the sample adapter in this browser.
 */
import { adapter } from '../shop/muster.js';
import { bestellungFuellen, bestellungLeeren, felderMerken } from '../shop/bestellung.js';

export default {
  name: 'order-view',
  options: { rolle: 'bestaetigung' },

  setup(ctx) {
    const { el, opts } = ctx;
    const nr = new URLSearchParams(location.search).get('bestellung') || '';
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    const fields = felderMerken(el);
    // Links with a pattern in data-order-link ("anmelden.html?email={email}"); href is the plain fallback.
    const links = [...el.querySelectorAll('[data-order-link]')].map((a) => [a, a.getAttribute('data-order-link'), a.getAttribute('href')]);
    let alive = true;
    let order = null;

    const showState = (k) => {
      for (const n of el.querySelectorAll('[data-order-state]')) n.hidden = n.getAttribute('data-order-state') !== k;
      for (const n of el.querySelectorAll('[data-order-title]')) n.hidden = n.getAttribute('data-order-title') !== k;
      el.setAttribute('data-order-view-state', k);
    };

    function withNr(a, base) {
      a.setAttribute('href', base.replace('{nr}', encodeURIComponent(nr)).replace('{email}', encodeURIComponent((order && order.email) || '')));
    }

    async function load() {
      order = nr ? await adapter.bestellung(nr) : null;
      if (!alive) return;
      if (!order) {
        showState('keine');
        return;
      }
      bestellungFuellen(el, order);
      for (const [a, pattern] of links) withNr(a, pattern);
      if (opts.rolle === 'zahlung') {
        showState(order.status === 'offen' ? 'offen' : 'bezahlt');
        return;
      }
      showState(order.status === 'offen' ? 'offen' : 'bezahlt');
      const konto = adapter.kontoSofort();
      for (const n of el.querySelectorAll('[data-order-guest]')) n.hidden = !!konto;
      for (const n of el.querySelectorAll('[data-order-member]')) n.hidden = !konto;
    }

    if (opts.rolle === 'zahlung') {
      const busy = (on) => {
        for (const b of el.querySelectorAll('[data-order-action]')) {
          if (on) b.setAttribute('aria-busy', 'true');
          else b.removeAttribute('aria-busy');
          b.disabled = on;
        }
      };
      ctx.listen(el, 'click', async (e) => {
        const b = e.target.closest('[data-order-action]');
        if (!b || !order) return;
        busy(true);
        try {
          if (b.getAttribute('data-order-action') === 'bestaetigen') {
            await adapter.zahlung_bestaetigen(nr);
            location.assign(`bestaetigung.html?bestellung=${encodeURIComponent(nr)}`);
          } else {
            await adapter.zahlung_abbrechen(nr);
            location.assign(`kasse.html?abbruch=${encodeURIComponent(nr)}`);
          }
        } catch (err) {
          busy(false);
          const fail = el.querySelector('[data-order-fail]');
          if (fail) fail.hidden = false;
        }
      });
    }

    load();

    ctx.onDestroy(() => {
      alive = false;
      bestellungLeeren(el, fields);
      for (const [n, h] of hiddenBefore) n.hidden = h;
      for (const [a, , href] of links) a.setAttribute('href', href);
      for (const b of el.querySelectorAll('[data-order-action]')) {
        b.disabled = false;
        b.removeAttribute('aria-busy');
      }
      el.removeAttribute('data-order-view-state');
    });

    return {
      get order() {
        return order;
      },
    };
  },
};
