/**
 * checkout: the sample checkout /kasse (PLAN 6 step 4, W 06; flow of the reference's hosted checkout,
 * refmedia v1 section 5: contact with sign-in link, delivery address, shipping methods only after the
 * address, payment, order summary with discount field, one button).
 *
 * Markup: kasse.html. Parts: [data-checkout-form] (the order form, POST for the PHP shop) with the sections
 * contact, delivery address, shipping ([data-checkout-ship-wait], [data-checkout-ship] with
 * [data-checkout-ship-list] and <template data-checkout-ship-template>), payment ([data-checkout-billing]
 * opens when "Rechnungsadresse wie Lieferadresse" is unticked), review (terms consent, submit with
 * [data-checkout-label="bereit|laedt"]); the summary aside with [data-checkout-lines] and its template,
 * [data-checkout-code] (discount form), totals [data-checkout-sum="zwischen|rabatt|versand|total|mwst"],
 * [data-checkout-summary-toggle] (phones: the summary folds like the reference's bar) and states
 * [data-checkout-empty], [data-checkout-cancelled], [data-checkout-blocked], [data-checkout-fail].
 *
 * Differences to the reference, on purpose (PLAN 6 [Anwalt], E6): the newsletter box is separate and NOT
 * ticked; the terms need an active tick; the steps up to the contract are listed; wrong input is listed
 * with links before the order. Guests order without an account; signed-in sample accounts get their
 * e-mail filled in. Swiss address format (postcode before town, 4 digits); the postcode rule follows the
 * country. Payment data never touch this page: the button hands over to the payment service (sample page).
 * Everything stays in the browser (sample adapter).
 */
import { TIMING } from '../motion/curves.js';
import { adapter } from '../shop/muster.js';
import { formatBetrag, mwstAnteil, LAENDER } from '../shop/muster-daten.js';
import { pruefen, feldPruefen, zusammenfassung, aufraeumen, werte } from '../shop/formular.js';

const R = TIMING.reveal;
const ADDRESS = ['land', 'vorname', 'nachname', 'strasse', 'plz', 'ort'];

export default {
  name: 'checkout',
  options: {},

  setup(ctx) {
    const { el, store, motion } = ctx;
    const q = (s) => el.querySelector(s);
    const form = q('[data-checkout-form]');
    if (!form) return null;
    const summaryBox = q('[data-formular-summe]');
    const shipWait = q('[data-checkout-ship-wait]');
    const ship = q('[data-checkout-ship]');
    const shipList = q('[data-checkout-ship-list]');
    const shipTpl = q('[data-checkout-ship-template]');
    const billing = q('[data-checkout-billing]');
    const same = form.elements.rechnung_gleich;
    const linesEl = q('[data-checkout-lines]');
    const lineTpl = q('[data-checkout-line-template]');
    const codeForm = q('[data-checkout-code]');
    const codeMsgs = codeForm ? [...codeForm.querySelectorAll('[data-checkout-code-msg]')] : [];
    const sums = Object.fromEntries([...el.querySelectorAll('[data-checkout-sum]')].map((n) => [n.getAttribute('data-checkout-sum'), n]));
    const rows = Object.fromEntries([...el.querySelectorAll('[data-checkout-row]')].map((n) => [n.getAttribute('data-checkout-row'), n]));
    const toggle = q('[data-checkout-summary-toggle]');
    const aside = q('[data-checkout-summary]');
    const totalShort = q('[data-checkout-total-short]');
    const labels = [...form.querySelectorAll('[data-checkout-label]')];
    const submit = form.querySelector('[type="submit"]');
    const states = Object.fromEntries(['empty', 'cancelled', 'blocked', 'fail', 'grid', 'account', 'signin', 'live'].map((k) => [k, q(`[data-checkout-${k}]`)]));
    const accountMail = q('[data-checkout-account-mail]');
    // Every element whose visibility this module may change gets its HTML state back on destroy.
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    // Texts the checkout writes (sums, short total, shipping, code, account), as the markup has them.
    const textBefore = new Map([...el.querySelectorAll('[data-checkout-sum], [data-checkout-total-short], [data-checkout-ship-value], [data-checkout-code-name], [data-checkout-account-mail]')].filter((n) => !n.children.length).map((n) => [n, n.textContent]));
    const g = motion.group();
    let cart = null;
    let rabatt = null;
    let shipOn = false;
    let busy = false;
    let alive = true;
    let land = form.elements.land ? form.elements.land.value : 'CH';

    const W = () => (store.get('shop:waehrung') === 'EUR' ? 'EUR' : 'CHF');
    const fmt = (n) => formatBetrag(n, W());

    form.noValidate = true;

    /* ---------- address and postcode rule ---------- */

    function plzOk(field) {
      if (field.name !== 'plz' && field.name !== 'rechnung_plz') return true;
      const code = field.name === 'plz' ? form.elements.land.value : (form.elements.rechnung_land || {}).value || 'CH';
      const l = LAENDER.find((x) => x.code === code);
      return !l || l.plz.test(field.value.trim());
    }

    function addressValid() {
      return ADDRESS.every((n) => {
        const f = form.elements[n];
        return f && f.checkValidity() && plzOk(f);
      });
    }

    /* ---------- shipping methods appear after the address ---------- */

    function reveal(node, open) {
      if (!node) return;
      if (open === !node.hidden) return;
      if (ctx.reduced || !open) {
        node.hidden = !open;
        return;
      }
      node.hidden = false;
      const h = node.scrollHeight;
      node.style.overflow = 'hidden';
      node.style.setProperty('--akk-h', '0');
      node.style.height = 'calc(var(--akk-h) * 1px)';
      g.tween(node, { '--akk-h': h }, {
        duration: R.duration,
        ease: R.ease,
        onComplete: () => {
          for (const p of ['height', 'overflow', '--akk-h']) node.style.removeProperty(p);
          if (!node.getAttribute('style')) node.removeAttribute('style');
        },
      });
    }

    async function renderShip() {
      const valid = addressValid();
      if (!valid) {
        if (shipOn) {
          shipOn = false;
          reveal(ship, false);
          if (shipWait) shipWait.hidden = false;
          for (const r of shipList.querySelectorAll('input')) r.checked = false;
          totals();
        }
        return;
      }
      const code = form.elements.land.value;
      if (shipOn && code === land && shipList.children.length) return;
      land = code;
      const v = await adapter.versandvorschau(code);
      if (!alive) return;
      const before = (form.querySelector('input[name="versand"]:checked') || {}).value;
      shipList.textContent = '';
      v.arten.forEach((a, i) => {
        const node = shipTpl.content.firstElementChild.cloneNode(true);
        const input = node.querySelector('input');
        input.value = a.id;
        input.id = `versand-${a.id}`;
        input.checked = before ? before === a.id : i === 0;
        input.setAttribute('data-preis-chf', String(a.preis.CHF));
        input.setAttribute('data-preis-eur', String(a.preis.EUR));
        node.querySelector('[data-ship-name]').textContent = a.name;
        node.querySelector('[data-ship-frist]').textContent = a.frist;
        node.querySelector('[data-ship-price]').textContent = formatBetrag(a.preis[W()], W());
        shipList.append(node);
      });
      if (!form.querySelector('input[name="versand"]:checked') && shipList.querySelector('input')) shipList.querySelector('input').checked = true;
      if (shipWait) shipWait.hidden = true;
      if (!shipOn) {
        shipOn = true;
        reveal(ship, true);
      }
      totals();
    }

    /* ---------- summary ---------- */

    function shipPrice() {
      const r = form.querySelector('input[name="versand"]:checked');
      if (!r || !shipOn) return null;
      return Number(r.getAttribute(W() === 'EUR' ? 'data-preis-eur' : 'data-preis-chf')) || 0;
    }

    function totals() {
      if (!cart) return;
      const w = W();
      const zwischen = cart.zwischensumme[w];
      const minus = rabatt ? Math.round((zwischen * rabatt.prozent) / 100) : 0;
      const versand = shipPrice();
      const total = zwischen - minus + (versand || 0);
      if (sums.zwischen) sums.zwischen.textContent = fmt(zwischen);
      if (sums.rabatt) sums.rabatt.textContent = fmt(-minus);
      if (rows.rabatt) rows.rabatt.hidden = !minus;
      if (sums.versand) {
        for (const n of sums.versand.querySelectorAll('[data-checkout-ship-state]')) n.hidden = n.getAttribute('data-checkout-ship-state') !== (versand === null ? 'offen' : 'betrag');
        const val = sums.versand.querySelector('[data-checkout-ship-value]');
        if (val) val.textContent = versand === null ? '' : fmt(versand);
      }
      if (sums.total) sums.total.textContent = fmt(total);
      if (totalShort) totalShort.textContent = fmt(total);
      const swiss = ['CH', 'LI'].includes(form.elements.land.value);
      if (rows.mwst) rows.mwst.hidden = !swiss;
      if (rows['mwst-eu']) rows['mwst-eu'].hidden = swiss;
      if (sums.mwst) sums.mwst.textContent = fmt(mwstAnteil(total));
      for (const r of shipList.querySelectorAll('input')) {
        const p = r.closest('label') && r.closest('label').querySelector('[data-ship-price]');
        if (p) p.textContent = formatBetrag(Number(r.getAttribute(w === 'EUR' ? 'data-preis-eur' : 'data-preis-chf')), w);
      }
    }

    function renderLines() {
      if (!cart || !linesEl || !lineTpl) return;
      linesEl.textContent = '';
      for (const z of cart.zeilen) {
        const li = lineTpl.content.firstElementChild.cloneNode(true);
        li.querySelector('[data-line-name]').textContent = z.name;
        const v = li.querySelector('[data-line-variant]');
        if (v) {
          v.hidden = !z.merkmal;
          const val = v.querySelector('[data-line-variant-value]');
          if (val) val.textContent = z.varianteName;
        }
        li.querySelector('[data-line-qty]').textContent = String(z.menge);
        li.querySelector('[data-line-price]').textContent = fmt(z.summe[W()]);
        const note = li.querySelector('[data-line-note]');
        if (note) note.hidden = !(z.ausverkauft || z.zuViel);
        linesEl.append(li);
      }
    }

    function render() {
      if (!cart) return;
      const has = cart.zeilen.length > 0;
      if (states.empty) states.empty.hidden = has;
      if (states.grid) states.grid.hidden = !has;
      if (states.blocked) states.blocked.hidden = !has || cart.bestellbar;
      renderLines();
      totals();
    }

    /* ---------- account (sample): fill in what the account knows ---------- */

    adapter.konto().then((k) => {
      if (!alive) return;
      if (states.account) states.account.hidden = !k;
      if (states.signin) states.signin.hidden = !!k;
      if (!k) return;
      if (accountMail) accountMail.textContent = k.email;
      if (!form.elements.email.value) form.elements.email.value = k.email;
      if (k.adresse) {
        for (const [name, value] of Object.entries(k.adresse)) if (form.elements[name] && !form.elements[name].value) form.elements[name].value = value;
        renderShip();
      }
    });

    /* ---------- events ---------- */

    ctx.listen(form, 'input', (e) => {
      if (ADDRESS.includes(e.target.name)) renderShip();
      if (e.target.getAttribute('aria-invalid') === 'true') feldPruefen(e.target, plzOk);
    });
    ctx.listen(form, 'change', (e) => {
      if (ADDRESS.includes(e.target.name)) renderShip();
      if (e.target.name === 'versand') totals();
      if (e.target.name === 'land') {
        if (form.elements.plz.value) feldPruefen(form.elements.plz, plzOk);
        totals();
      }
      if (e.target === same && billing) {
        reveal(billing, !same.checked);
        for (const f of billing.querySelectorAll('input, select')) f.disabled = same.checked;
      }
    });
    ctx.listen(form, 'focusout', (e) => {
      if (e.target.value && e.target.matches('input, select, textarea')) feldPruefen(e.target, plzOk);
    });
    if (billing && same) for (const f of billing.querySelectorAll('input, select')) f.disabled = same.checked;

    if (codeForm) {
      codeForm.noValidate = true;
      ctx.listen(codeForm, 'submit', async (e) => {
        e.preventDefault();
        const input = codeForm.querySelector('input');
        const say = (k) => codeMsgs.forEach((m) => {
          m.hidden = m.getAttribute('data-checkout-code-msg') !== k;
        });
        if (!input.value.trim()) {
          say('leer');
          return;
        }
        codeForm.setAttribute('aria-busy', 'true');
        try {
          rabatt = await adapter.gutschein(input.value);
          say('ok');
          const name = codeForm.querySelector('[data-checkout-code-name]');
          if (name) name.textContent = rabatt.code;
        } catch (err) {
          rabatt = null;
          say(err && err.code === 'stoerung' ? 'fehler' : 'ungueltig');
          input.setAttribute('aria-invalid', 'true');
        } finally {
          codeForm.removeAttribute('aria-busy');
          if (rabatt) input.removeAttribute('aria-invalid');
          totals();
        }
      });
    }

    if (toggle && aside) {
      ctx.listen(toggle, 'click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        aside.setAttribute('data-checkout-open', open ? 'true' : 'false');
      });
      toggle.setAttribute('aria-expanded', 'false');
      aside.setAttribute('data-checkout-open', 'false');
    }

    const setLabel = (k) => {
      for (const l of labels) l.hidden = l.getAttribute('data-checkout-label') !== k;
      if (submit) {
        if (k === 'laedt') submit.setAttribute('aria-busy', 'true');
        else submit.removeAttribute('aria-busy');
      }
    };

    ctx.listen(form, 'submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      if (states.fail) states.fail.hidden = true;
      const wrong = pruefen(form, plzOk);
      if (shipOn && !form.querySelector('input[name="versand"]:checked')) wrong.push(shipList.querySelector('input'));
      zusammenfassung(summaryBox, wrong.filter(Boolean));
      if (wrong.length) {
        if (summaryBox) summaryBox.focus();
        return;
      }
      if (!cart || !cart.bestellbar) {
        if (states.blocked) {
          states.blocked.hidden = false;
          states.blocked.focus();
        }
        return;
      }
      busy = true;
      setLabel('laedt');
      const v = werte(form);
      const adresse = Object.fromEntries(['land', 'vorname', 'nachname', 'firma', 'strasse', 'zusatz', 'plz', 'ort', 'telefon'].map((k) => [k, v[k] || '']));
      const rechnung = v.rechnung_gleich ? null : Object.fromEntries(['vorname', 'nachname', 'strasse', 'plz', 'ort', 'land'].map((k) => [k, v[`rechnung_${k}`] || '']));
      try {
        const res = await adapter.kasse({ email: v.email, newsletter: !!v.newsletter, adresse, rechnung, versand: v.versand, waehrung: W(), gutschein: rabatt });
        if (!alive) return;
        // The payment page belongs to the payment service: a normal page load, as with the real hand-off.
        store.emit('router:go', { href: res.adresse, extern: true });
      } catch (err) {
        if (!alive) return;
        if (states.fail) {
          states.fail.hidden = false;
          states.fail.focus();
        }
        busy = false;
        setLabel('bereit');
      }
    });

    /* ---------- data ---------- */

    if (states.cancelled) states.cancelled.hidden = !new URLSearchParams(location.search).get('abbruch');
    adapter.warenkorb().then((w) => {
      if (!alive) return;
      cart = w;
      render();
      renderShip();
    });
    ctx.own(adapter.bei_aenderung((w) => {
      cart = w;
      render();
    }));
    ctx.on('shop:waehrung', () => {
      renderLines();
      totals();
    });
    setLabel('bereit');
    if (states.live) states.live.hidden = false;

    ctx.onDestroy(() => {
      alive = false;
      g.kill();
      form.noValidate = false;
      if (codeForm) codeForm.noValidate = false;
      aufraeumen(form, summaryBox);
      for (const [n, h] of hiddenBefore) n.hidden = h;
      for (const [n, t] of textBefore) n.textContent = t;
      if (shipList) shipList.textContent = '';
      if (linesEl) linesEl.textContent = '';
      for (const n of [ship, billing]) {
        if (!n) continue;
        for (const p of ['height', 'overflow', '--akk-h']) n.style.removeProperty(p);
        if (!n.getAttribute('style')) n.removeAttribute('style');
      }
      if (billing) for (const f of billing.querySelectorAll('input, select')) f.disabled = false;
      if (toggle) toggle.removeAttribute('aria-expanded');
      if (aside) aside.removeAttribute('data-checkout-open');
      if (submit) submit.removeAttribute('aria-busy');
      if (codeForm) codeForm.removeAttribute('aria-busy');
    });

    return {
      get shipping() {
        return shipOn;
      },
      get busy() {
        return busy;
      },
      get rabatt() {
        return rabatt;
      },
      get cart() {
        return cart;
      },
    };
  },
};
