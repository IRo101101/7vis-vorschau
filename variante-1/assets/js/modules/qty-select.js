/**
 * qty-select: quantity field of the buy box and of every cart line (IS 6 "qty-select").
 *
 * Markup (works without script as a plain select):
 *   <label class="menge" data-mod="qty-select">
 *     <span class="menge__etikett">Menge</span>
 *     <select name="menge">…</select>
 *     <span class="menge__wert" data-qty-select-value aria-hidden="true">1</span>
 *   </label>
 * As in the reference the real select stays on top (transparent, covering the field) and an own display
 * shows label, value and arrow; the module writes the text of the chosen option into the display on every
 * change and also when other code set the value without an event (checked once per frame while the field
 * exists; nothing is written unless the value changed).
 */
export default {
  name: 'qty-select',
  options: {},

  setup(ctx) {
    const { el } = ctx;
    const select = el.querySelector('select');
    const value = el.querySelector('[data-qty-select-value]');
    if (!select || !value) return null;
    const original = value.textContent;
    let shown = null;

    function sync() {
      const opt = select.options[select.selectedIndex];
      const text = opt ? opt.textContent : '';
      if (text === shown) return;
      shown = text;
      value.textContent = text;
    }

    el.setAttribute('data-qty-select', 'live');
    ctx.listen(select, 'change', sync);
    ctx.listen(select, 'input', sync);
    ctx.frame(sync, 'late');
    sync();

    ctx.onDestroy(() => {
      value.textContent = original;
      el.removeAttribute('data-qty-select');
    });

    return { sync };
  },
};
