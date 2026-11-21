/**
 * Order details shared by the sample payment page, the confirmation and the account page (stage 5).
 *
 * Slots in the HTML: [data-order-field="nr|datum|status|email|total|zwischen|rabatt|versand|versandart|
 * adresse|mwst"] get text; [data-order-lines] is filled from its <template data-order-line-template>
 * ([data-line-name], [data-line-variant] with [data-line-variant-value], [data-line-qty], [data-line-price]);
 * [data-order-row="rabatt|mwst"] are shown only when they apply.
 */
import { formatBetrag, mwstAnteil, LAENDER } from './muster-daten.js';

const datum = (iso) => {
  const [y, m, d] = String(iso || '').split('-');
  return y && m && d ? `${d}.${m}.${y}` : '';
};

export function adresseText(a) {
  if (!a) return '';
  const land = (LAENDER.find((l) => l.code === a.land) || {}).name || a.land || '';
  return [[a.vorname, a.nachname].filter(Boolean).join(' '), a.firma, a.strasse, a.zusatz, [a.plz, a.ort].filter(Boolean).join(' '), land].filter(Boolean).join(', ');
}

export function bestellungFuellen(root, b) {
  const w = b.waehrung;
  const s = b.summen;
  const set = (key, value) => {
    for (const n of root.querySelectorAll(`[data-order-field="${key}"]`)) n.textContent = value;
  };
  set('nr', b.nr);
  set('datum', datum(b.datum));
  set('status', b.status === 'offen' ? 'Zahlung offen' : b.status);
  set('email', b.email || '');
  set('zwischen', formatBetrag(s.zwischen, w));
  set('rabatt', formatBetrag(-s.rabatt, w));
  set('versand', formatBetrag(s.versand, w));
  set('versandart', b.versand ? `${b.versand.name}, ${b.versand.frist}` : '');
  set('total', formatBetrag(s.total, w));
  set('mwst', formatBetrag(mwstAnteil(s.total), w));
  set('adresse', adresseText(b.adresse));
  for (const r of root.querySelectorAll('[data-order-row="rabatt"]')) r.hidden = !s.rabatt;
  const swiss = !b.adresse || ['CH', 'LI'].includes(b.adresse.land);
  for (const r of root.querySelectorAll('[data-order-row="mwst"]')) r.hidden = !swiss;
  const list = root.querySelector('[data-order-lines]');
  const tpl = root.querySelector('[data-order-line-template]');
  if (list && tpl) {
    list.textContent = '';
    for (const z of b.zeilen) {
      const li = tpl.content.firstElementChild.cloneNode(true);
      const n = li.querySelector('[data-line-name]');
      if (n) n.textContent = z.name;
      const v = li.querySelector('[data-line-variant]');
      if (v) {
        v.hidden = !z.merkmal;
        const val = v.querySelector('[data-line-variant-value]');
        if (val) val.textContent = z.varianteName;
      }
      const qn = li.querySelector('[data-line-qty]');
      if (qn) qn.textContent = String(z.menge);
      const p = li.querySelector('[data-line-price]');
      if (p) p.textContent = formatBetrag(z.einzelpreis[w] * z.menge, w);
      list.append(li);
    }
  }
}

/** Remove what bestellungFuellen wrote (module destroy). */
export function bestellungLeeren(root, originals) {
  for (const [n, t] of originals) n.textContent = t;
  for (const list of root.querySelectorAll('[data-order-lines]')) list.textContent = '';
}

export function felderMerken(root) {
  return new Map([...root.querySelectorAll('[data-order-field]')].map((n) => [n, n.textContent]));
}
