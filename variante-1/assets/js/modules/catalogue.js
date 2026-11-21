/**
 * catalogue: filter and sort the catalogue of /werkzeuge (PLAN 3 "Katalog nach Kraft mit Filter und
 * Sortierung", W 06 "Kategorien, Filter, Sortierung"; the reference has none, IS 3.2).
 *
 * Markup (written from the sample data by tests/shop-seiten.cjs, complete without script):
 *   <section data-mod="catalogue">
 *     <form data-catalogue-form method="get"> radios name="kraft" ("" = all), checkbox name="lieferbar",
 *       select name="sortierung" (kraft | preis-auf | preis-ab | name), [data-catalogue-apply] submit </form>
 *     [data-catalogue-count] with [data-catalogue-n]           role=status
 *     [data-catalogue-groups] > [data-catalogue-group="1..7"] > [data-catalogue-list] > [data-catalogue-item]
 *        items carry data-kraft, data-nr, data-status, data-preis-chf, data-preis-eur
 *     [data-catalogue-flat] (empty list for the sorted view)   [data-catalogue-empty]
 *   </section>
 * Sorted "Nach Kraft" the cards stay in their force groups; any other order shows one flat list (cards are
 * moved, not copied). Price order follows the chosen currency. The form also works as a GET form for the
 * PHP shop; with the runtime every change applies at once and the submit button is hidden. A URL with
 * ?kraft=3 (link from /die-sieben-kraefte) or the other fields starts filtered.
 */
export default {
  name: 'catalogue',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const form = el.querySelector('[data-catalogue-form]');
    const groupsBox = el.querySelector('[data-catalogue-groups]');
    const flat = el.querySelector('[data-catalogue-flat]');
    const nEl = el.querySelector('[data-catalogue-n]');
    const empty = el.querySelector('[data-catalogue-empty]');
    const apply = el.querySelector('[data-catalogue-apply]');
    if (!form || !groupsBox || !flat) return null;
    const groups = [...groupsBox.querySelectorAll('[data-catalogue-group]')];
    const items = [...groupsBox.querySelectorAll('[data-catalogue-item]')];
    const home = new Map(items.map((li) => [li, { parent: li.parentElement, next: li.nextElementSibling }]));
    const order = new Map(items.map((li, i) => [li, i]));
    const nOriginal = nEl ? nEl.textContent : '';
    // Exact restore on destroy: the child nodes of every list (text nodes included) and the hidden flags.
    const lists = [...new Set(items.map((li) => li.parentElement)), flat];
    const nodesBefore = new Map(lists.map((l) => [l, [...l.childNodes]]));
    const hiddenBefore = new Map([groupsBox, flat, empty, apply, ...groups, ...items].filter(Boolean).map((n) => [n, n.hidden]));
    const formOriginal = [...form.elements].map((f) => ({ f, checked: f.checked, value: f.value }));

    // Start values from the address (shareable filter links, the forces page links here with ?kraft=N).
    const params = new URLSearchParams(location.search);
    if (params.has('kraft')) {
      const r = form.querySelector(`input[name="kraft"][value="${CSS.escape(params.get('kraft'))}"]`);
      if (r) r.checked = true;
    }
    if (params.get('lieferbar') === '1' && form.elements.lieferbar) form.elements.lieferbar.checked = true;
    if (params.has('sortierung') && form.elements.sortierung) {
      const s = params.get('sortierung');
      if ([...form.elements.sortierung.options].some((o) => o.value === s)) form.elements.sortierung.value = s;
    }

    function readForm() {
      const kraft = (form.querySelector('input[name="kraft"]:checked') || {}).value || '';
      const lieferbar = !!(form.elements.lieferbar && form.elements.lieferbar.checked);
      const sortierung = form.elements.sortierung ? form.elements.sortierung.value : 'kraft';
      return { kraft, lieferbar, sortierung };
    }

    function restoreHome() {
      // Put every card back to its place in its group, in the original order.
      for (const li of [...items].sort((a, b) => order.get(a) - order.get(b))) home.get(li).parent.append(li);
    }

    let shown = items.length;
    function run() {
      const f = readForm();
      const w = store.get('shop:waehrung') === 'EUR' ? 'eur' : 'chf';
      const fits = (li) => (!f.kraft || li.getAttribute('data-kraft') === f.kraft) && (!f.lieferbar || li.getAttribute('data-status') === 'lieferbar');
      const visible = items.filter(fits);
      for (const li of items) li.hidden = !fits(li);
      if (f.sortierung === 'kraft') {
        restoreHome();
        flat.hidden = true;
        groupsBox.hidden = false;
        for (const g of groups) g.hidden = ![...g.querySelectorAll('[data-catalogue-item]')].some((li) => !li.hidden);
      } else {
        const price = (li) => Number(li.getAttribute(`data-preis-${w}`)) || 0;
        const cmp = {
          'preis-auf': (a, b) => price(a) - price(b) || order.get(a) - order.get(b),
          'preis-ab': (a, b) => price(b) - price(a) || order.get(a) - order.get(b),
          name: (a, b) => (a.getAttribute('data-name') || '').localeCompare(b.getAttribute('data-name') || '', 'de-CH') || order.get(a) - order.get(b),
        }[f.sortierung] || ((a, b) => order.get(a) - order.get(b));
        // Products without a price (the Pucker) go last in a price order.
        const sorted = [...items].sort((a, b) => {
          if (f.sortierung.startsWith('preis')) {
            const pa = a.hasAttribute(`data-preis-${w}`);
            const pb = b.hasAttribute(`data-preis-${w}`);
            if (pa !== pb) return pa ? -1 : 1;
          }
          return cmp(a, b);
        });
        for (const li of sorted) flat.append(li);
        flat.hidden = false;
        groupsBox.hidden = true;
      }
      shown = visible.length;
      if (nEl) nEl.textContent = String(shown);
      if (empty) empty.hidden = shown > 0;
      el.setAttribute('data-catalogue-view', f.sortierung === 'kraft' ? 'gruppen' : 'liste');
    }

    ctx.listen(form, 'change', run);
    ctx.listen(form, 'submit', (e) => {
      e.preventDefault();
      run();
    });
    ctx.on('shop:waehrung', () => {
      if (readForm().sortierung.startsWith('preis')) run();
    });
    if (apply) apply.hidden = true;
    run();

    ctx.onDestroy(() => {
      for (const [l, nodes] of nodesBefore) l.replaceChildren(...nodes);
      for (const [n, h] of hiddenBefore) n.hidden = h;
      if (nEl) nEl.textContent = nOriginal;
      for (const { f, checked, value } of formOriginal) {
        if (f.type === 'radio' || f.type === 'checkbox') f.checked = checked;
        else if ('value' in f && f.tagName !== 'BUTTON') f.value = value;
      }
      el.removeAttribute('data-catalogue-view');
    });

    return {
      run,
      get shown() {
        return shown;
      },
      get filter() {
        return readForm();
      },
    };
  },
};
