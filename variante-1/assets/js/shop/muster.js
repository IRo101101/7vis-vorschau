/**
 * Shop adapter "Muster" (PLAN 6 "Neutrale Schnittstelle", FRAGEN 1a): sample data for the study.
 *
 * The front end talks to a shop only through an adapter with this small contract (names of PLAN 6):
 *   produkte(filter, sprache)      produkt(pfad, sprache)
 *   warenkorb()                    hinzufuegen(variante, menge)
 *   menge_aendern(zeile, menge)    entfernen(zeile)
 *   versandvorschau(land)          kasse()            betrag(geld, sprache)
 *   anfrage(art, felder)           bei_aenderung(funktion)
 * Stage 3 needs only the cart count of the navigation; the rest of the contract is here so that stage 5
 * (panel, /warenkorb, catalogue) and later the PHP adapter replace data, not modules.
 *
 * Data: the Pucker with name and status but no price (FRAGEN 7a: no purchase), plus sample records that
 * are visibly marked "Muster" and carry no 7Vis product names (PLAN 6). The full set of about 100 records
 * follows with the catalogue in stage 5. Prices are integers in Rappen and Cent per currency (PLAN 6).
 * Cart: kept in the browser (localStorage, every access guarded); it counts units, like the reference
 * (refmedia v1 F20). Nothing here is sold.
 */

const KEY = 'v1-warenkorb-muster';
const CURRENCIES = Object.freeze({ CHF: 'de-CH', EUR: 'de-CH' });

const PRODUKTE = Object.freeze([
  Object.freeze({ id: 'pucker', pfad: 'pucker', name: 'Pucker', kraft: 3, status: 'in-vorbereitung', muster: false, preis: null, varianten: Object.freeze([]) }),
  Object.freeze({ id: 'muster-01', pfad: 'muster-01', name: 'Musterwerkzeug 01', kraft: 2, status: 'lieferbar', muster: true, preis: Object.freeze({ CHF: 1000, EUR: 1000 }), varianten: Object.freeze(['muster-01-a']) }),
  Object.freeze({ id: 'muster-02', pfad: 'muster-02', name: 'Musterwerkzeug 02', kraft: 4, status: 'lieferbar', muster: true, preis: Object.freeze({ CHF: 2000, EUR: 2000 }), varianten: Object.freeze(['muster-02-a']) }),
  Object.freeze({ id: 'muster-03', pfad: 'muster-03', name: 'Musterwerkzeug 03', kraft: 6, status: 'ausverkauft', muster: true, preis: Object.freeze({ CHF: 3000, EUR: 3000 }), varianten: Object.freeze(['muster-03-a']) }),
]);

const listeners = new Set();

function read() {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : null;
    return Array.isArray(data && data.zeilen) ? data : { zeilen: [] };
  } catch (err) {
    return { zeilen: [] };
  }
}

function write(cart) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(KEY, JSON.stringify(cart));
  } catch (err) {
    /* storage blocked: the cart lives for this page only */
  }
  memory = cart;
  for (const fn of [...listeners]) {
    try {
      fn(summary(cart));
    } catch (err) {
      console.error('[v1:shop] listener failed', err);
    }
  }
}

let memory = null;
const current = () => memory || (memory = read());

function variantProduct(variante) {
  return PRODUKTE.find((p) => p.varianten.includes(variante)) || null;
}

function summary(cart) {
  const zeilen = cart.zeilen.map((z) => ({ ...z }));
  return { zeilen, menge: zeilen.reduce((n, z) => n + z.menge, 0) };
}

const notInStudy = (what) => Promise.reject(new Error(`[v1:shop] ${what}: not part of the sample adapter (stage 5 or the PHP shop)`));

export const adapter = Object.freeze({
  name: 'muster',

  produkte(filter = {}) {
    let list = [...PRODUKTE];
    if (filter.kraft) list = list.filter((p) => p.kraft === filter.kraft);
    return Promise.resolve(list);
  },

  produkt(pfad) {
    return Promise.resolve(PRODUKTE.find((p) => p.pfad === pfad) || null);
  },

  warenkorb() {
    return Promise.resolve(summary(current()));
  },

  hinzufuegen(variante, menge = 1) {
    const p = variantProduct(variante);
    if (!p || p.status !== 'lieferbar') return Promise.reject(new Error(`[v1:shop] variant "${variante}" cannot be added`));
    const cart = current();
    const zeilen = cart.zeilen.map((z) => ({ ...z }));
    const hit = zeilen.find((z) => z.variante === variante);
    if (hit) hit.menge += menge;
    else zeilen.push({ zeile: `z-${variante}`, variante, produkt: p.id, menge });
    write({ zeilen });
    return this.warenkorb();
  },

  menge_aendern(zeile, menge) {
    const zeilen = current().zeilen.map((z) => (z.zeile === zeile ? { ...z, menge: Math.max(0, menge) } : { ...z })).filter((z) => z.menge > 0);
    write({ zeilen });
    return this.warenkorb();
  },

  entfernen(zeile) {
    write({ zeilen: current().zeilen.filter((z) => z.zeile !== zeile).map((z) => ({ ...z })) });
    return this.warenkorb();
  },

  versandvorschau() {
    return notInStudy('versandvorschau');
  },

  kasse() {
    return notInStudy('kasse');
  },

  anfrage() {
    return notInStudy('anfrage');
  },

  /** Amount in Rappen or Cent as text, e.g. { CHF: 1000 } -> "CHF 10.00". */
  betrag(geld, sprache = 'de-CH', waehrung = 'CHF') {
    if (!geld || !Number.isFinite(geld[waehrung])) return '';
    const locale = CURRENCIES[waehrung] || sprache;
    return new Intl.NumberFormat(locale, { style: 'currency', currency: waehrung, minimumFractionDigits: 2 }).format(geld[waehrung] / 100);
  },

  /** Subscribe to cart changes; returns a function that unsubscribes. */
  bei_aenderung(funktion) {
    listeners.add(funktion);
    return () => listeners.delete(funktion);
  },
});

/** Test and review aid: empty the sample cart. */
export function leeren() {
  write({ zeilen: [] });
}
