/**
 * account: /konto, the sample customer account (W 06 E4 and E5; reference: Shopify customer accounts,
 * refmedia v1 F24). Shows the orders of the sample account (two sample orders plus the ones placed in this
 * browser), the default address, the separate newsletter consent (E6, not ticked by default) and sign-out.
 * Not signed in: the state [data-account-state="aus"] with the way to /anmelden.
 * Markup: konto.html ([data-account-*], order list template as in shop/bestellung.js per order).
 */
import { adapter } from '../shop/muster.js';
import { bestellungFuellen, adresseText } from '../shop/bestellung.js';

export default {
  name: 'account',
  options: {},

  setup(ctx) {
    const { el } = ctx;
    const list = el.querySelector('[data-account-orders]');
    const tpl = el.querySelector('[data-account-order-template]');
    const mailOut = [...el.querySelectorAll('[data-account-mail]')];
    const mailBefore = mailOut.map((n) => n.textContent);
    const addrOut = el.querySelector('[data-account-address]');
    const addrBefore = addrOut ? addrOut.textContent : '';
    const news = el.querySelector('[data-account-newsletter]');
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    let alive = true;
    let konto = null;

    const state = (k) => {
      for (const n of el.querySelectorAll('[data-account-state]')) n.hidden = n.getAttribute('data-account-state') !== k;
      el.setAttribute('data-account-view', k);
    };

    function render() {
      if (!konto) {
        state('aus');
        return;
      }
      state('an');
      for (const n of mailOut) n.textContent = konto.email;
      for (const n of el.querySelectorAll('[data-account-new]')) n.hidden = !konto.neu;
      if (addrOut) addrOut.textContent = konto.adresse ? adresseText(konto.adresse) : addrBefore;
      if (news) news.checked = !!konto.newsletter;
      if (list && tpl) {
        list.textContent = '';
        for (const b of konto.bestellungen) {
          const li = tpl.content.firstElementChild.cloneNode(true);
          bestellungFuellen(li, b);
          list.append(li);
        }
      }
    }

    async function load() {
      konto = await adapter.konto();
      if (alive) render();
    }

    ctx.listen(el, 'click', async (e) => {
      if (e.target.closest('[data-account-signout]')) {
        e.preventDefault();
        await adapter.abmelden();
        if (!alive) return;
        konto = null;
        render();
        const t = el.querySelector('[data-account-state="aus"] h1, [data-account-state="aus"] h2');
        if (t) {
          t.setAttribute('tabindex', '-1');
          t.focus();
        }
      }
    });
    if (news) {
      ctx.listen(news, 'change', async () => {
        try {
          konto = await adapter.einstellung('newsletter', news.checked);
          const ok = el.querySelector('[data-account-saved]');
          if (ok) ok.hidden = false;
        } catch (err) {
          news.checked = !news.checked;
        }
      });
    }
    ctx.on('page:in', () => load());
    load();

    ctx.onDestroy(() => {
      alive = false;
      if (list) list.textContent = '';
      for (const [n, h] of hiddenBefore) n.hidden = h;
      mailOut.forEach((n, i) => {
        n.textContent = mailBefore[i];
      });
      if (addrOut) addrOut.textContent = addrBefore;
      if (news) news.checked = news.defaultChecked;
      el.removeAttribute('data-account-view');
      const t = el.querySelector('[data-account-state="aus"] [tabindex="-1"]');
      if (t) t.removeAttribute('tabindex');
    });

    return {
      get konto() {
        return konto;
      },
    };
  },
};
