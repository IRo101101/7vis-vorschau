/**
 * currency-switch: CHF or EUR (PLAN 3 and 6: "Preise in CHF und EUR kommen aus einer Quelle").
 *
 * Markup (needs the runtime; without script every price shows CHF):
 *   <div class="waehrung" role="group" aria-label="Währung" data-mod="currency-switch" data-needs-core>
 *     <button type="button" data-currency-switch-value="CHF" aria-pressed="true">CHF</button>
 *     <button type="button" data-currency-switch-value="EUR" aria-pressed="false">EUR</button>
 *   </div>
 * Every switch on the page writes the store key 'shop:waehrung'; the cart panel of the shell owns the
 * value (<html data-waehrung>, kept per browser). Static prices carry both amounts from the same data
 * ([data-preis-w="CHF|EUR"]) and CSS shows the chosen one; live amounts (buy box, panel, checkout) are
 * formatted by the shop adapter. Which currency a customer in Switzerland may see alone is a question for
 * the lawyer (PLAN 6, [Anwalt]).
 */
export default {
  name: 'currency-switch',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const buttons = [...el.querySelectorAll('[data-currency-switch-value]')];
    const originals = buttons.map((b) => b.getAttribute('aria-pressed'));

    function show(w) {
      const cur = w === 'EUR' ? 'EUR' : 'CHF';
      for (const b of buttons) b.setAttribute('aria-pressed', b.getAttribute('data-currency-switch-value') === cur ? 'true' : 'false');
    }

    for (const b of buttons) {
      ctx.listen(b, 'click', () => store.set('shop:waehrung', b.getAttribute('data-currency-switch-value') === 'EUR' ? 'EUR' : 'CHF'));
    }
    ctx.on('shop:waehrung', show);
    show(store.get('shop:waehrung'));

    ctx.onDestroy(() => {
      buttons.forEach((b, i) => {
        if (originals[i] === null) b.removeAttribute('aria-pressed');
        else b.setAttribute('aria-pressed', originals[i]);
      });
    });
    return { show };
  },
};
