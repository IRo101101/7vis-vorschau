/**
 * buy-box: the buy box of a product page (IS 3.3 "Kaufbox", IS 4 steps 3 to 7, IS 6 pdp-meta; PLAN 5 no. 43,
 * PLAN 6 steps 2 and 3).
 *
 * Markup: a real form that works without script (GET to /warenkorb with variante and menge; the cart page
 * takes them over, the PHP shop answers the same request on the server):
 *   <form action="warenkorb.html" method="get" data-mod="buy-box">
 *     radios name="variante" (data-preis-chf, data-preis-eur, data-bestand; sold out = disabled) or one
 *     hidden input, the qty-select (select name="menge"), a submit button with
 *     [data-buy-box-label="bereit|laedt|aus"] and [data-buy-box-price] holding [data-preis-w="CHF|EUR"],
 *     a status line [data-buy-box-message] (role=status) with [data-buy-box-msg="ok|ausverkauft|bestand|
 *     hoechstmenge|stoerung"] and [data-buy-box-stock] for the number left.
 *
 * Behaviour: the price in the button is the unit price of the chosen variant times the quantity, in the
 * chosen currency (fixed: the reference keeps the unit price at every quantity, refmedia F20). Submitting
 * adds through the shop adapter; the button shows the loading state while the adapter works (the reference
 * shows its loading class for about 1.1 s, F19), then the cart panel opens by itself ('shop:panel-oeffnen').
 * Errors stay in the box, said by the status line: sold out, not enough in stock (with the number left),
 * more than the highest quantity, shop not reachable. Variants without stock are disabled with "ausverkauft".
 * State on the form: data-buy-box-state = bereit | laedt | aus.
 */
import { adapter } from '../shop/muster.js';
import { formatBetrag } from '../shop/muster-daten.js';

export default {
  name: 'buy-box',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const form = el.tagName === 'FORM' ? el : el.querySelector('form');
    if (!form) return null;
    const submit = form.querySelector('[data-buy-box-submit]');
    const qty = form.querySelector('select[name="menge"]');
    const priceEls = [...form.querySelectorAll('[data-buy-box-price] [data-preis-w]')];
    const priceOriginal = priceEls.map((p) => p.textContent);
    const labels = [...form.querySelectorAll('[data-buy-box-label]')];
    const message = form.querySelector('[data-buy-box-message]');
    const msgs = message ? [...message.querySelectorAll('[data-buy-box-msg]')] : [];
    const hiddenBefore = new Map([...labels, ...msgs].map((n) => [n, n.hidden]));
    const stockEl = form.querySelector('[data-buy-box-stock]');
    let state = 'bereit';
    let alive = true;

    const variantInput = () => form.querySelector('input[name="variante"]:checked') || form.querySelector('input[type="hidden"][name="variante"]');

    function current() {
      const v = variantInput();
      if (!v) return null;
      return {
        id: v.value,
        chf: Number(v.getAttribute('data-preis-chf')) || 0,
        eur: Number(v.getAttribute('data-preis-eur')) || 0,
        bestand: Number(v.getAttribute('data-bestand')) || 0,
      };
    }

    function say(kind) {
      for (const m of msgs) m.hidden = m.getAttribute('data-buy-box-msg') !== kind;
      if (message) message.setAttribute('data-buy-box-say', kind || '');
    }

    function setState(next) {
      state = next;
      form.setAttribute('data-buy-box-state', next);
      for (const l of labels) l.hidden = l.getAttribute('data-buy-box-label') !== next;
      if (submit) {
        submit.toggleAttribute('aria-busy', next === 'laedt');
        if (next === 'laedt') submit.setAttribute('aria-busy', 'true');
        submit.setAttribute('aria-disabled', next === 'bereit' ? 'false' : 'true');
      }
    }

    function update() {
      const v = current();
      const n = Math.max(1, Number(qty ? qty.value : 1) || 1);
      if (v) {
        for (const p of priceEls) {
          const w = p.getAttribute('data-preis-w');
          p.textContent = formatBetrag((w === 'EUR' ? v.eur : v.chf) * n, w);
        }
      }
      if (state !== 'laedt') setState(v && v.bestand > 0 ? 'bereit' : 'aus');
    }

    ctx.listen(form, 'change', (e) => {
      if (e.target.name === 'variante' || e.target.name === 'menge') {
        say('');
        update();
      }
    });

    ctx.listen(form, 'submit', async (e) => {
      e.preventDefault();
      if (state !== 'bereit') {
        if (state === 'aus') say('ausverkauft');
        return;
      }
      const v = current();
      const n = Math.max(1, Number(qty ? qty.value : 1) || 1);
      if (!v) return;
      setState('laedt');
      say('');
      try {
        await adapter.hinzufuegen(v.id, n);
        if (!alive) return;
        setState('bereit');
        say('ok');
        store.emit('shop:panel-oeffnen', { quelle: submit || form });
      } catch (err) {
        if (!alive) return;
        update();
        setState(current() && current().bestand > 0 ? 'bereit' : 'aus');
        const code = err && err.code;
        if (code === 'bestand' || code === 'hoechstmenge') {
          const left = Math.max(0, (err.verfuegbar || 0) - (err.imKorb || 0));
          if (stockEl) stockEl.textContent = String(left);
          say(code === 'bestand' ? 'bestand' : 'hoechstmenge');
        } else if (code === 'ausverkauft') {
          say('ausverkauft');
        } else {
          say('stoerung');
        }
      } finally {
        if (alive) update();
      }
    });

    say('');
    update();

    ctx.onDestroy(() => {
      alive = false;
      priceEls.forEach((p, i) => {
        p.textContent = priceOriginal[i];
      });
      for (const [n, h] of hiddenBefore) n.hidden = h;
      if (message) message.removeAttribute('data-buy-box-say');
      form.removeAttribute('data-buy-box-state');
      if (submit) {
        submit.removeAttribute('aria-busy');
        submit.removeAttribute('aria-disabled');
      }
    });

    return {
      get state() {
        return state;
      },
      update,
    };
  },
};
