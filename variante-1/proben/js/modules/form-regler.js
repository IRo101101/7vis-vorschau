/**
 * form-regler: a native range input that sets the figure's form in the store (spike S1, FRAGEN 3a).
 * 0 is the bean, 1 the puck. Review aid of the S1 probe: on pages with the force slider the figure derives
 * its form from 'slider:index' and this value is only the fallback. A plain, keyboard-operable range.
 *
 *   <input type="range" min="0" max="100" value="0" data-mod="form-regler">
 */
export default {
  name: 'form-regler',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const input = el.matches('input[type="range"]') ? el : el.querySelector('input[type="range"]');
    if (!input) {
      ctx.warn('needs an <input type="range">');
      return null;
    }
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const toForm = () => (Number(input.value) - min) / (max - min || 1);
    const sync = () => {
      const f = store.get('figur:form');
      if (typeof f === 'number') input.value = String(Math.round(min + f * (max - min)));
    };
    sync();
    if (typeof store.get('figur:form') !== 'number') store.set('figur:form', toForm());
    ctx.listen(input, 'input', () => store.set('figur:form', toForm()));
    ctx.on('figur:form', (f) => {
      if (Math.abs(f - toForm()) > 0.005) sync();
    });
    return { sync };
  },
};
