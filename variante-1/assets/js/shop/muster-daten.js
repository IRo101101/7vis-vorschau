/**
 * Sample data of the study (PLAN 6 "Datenmodell", FRAGEN 1a, answers 5 to 7 provisional).
 *
 * One source for everything the study shows about products and prices: the sample adapter (muster.js)
 * reads it in the browser, and the page generator (tests/shop-seiten.cjs) writes the catalogue, the sample
 * product pages and every static price from it. That is the rule "Teaser und Kaufbox lesen dieselbe
 * Quelle" (PLAN 6) for a static study: the PHP shop later renders the same fields from its database.
 *
 * Contents:
 *   - the Pucker (force 03) with name and status, no price, no variants: it cannot be bought (FRAGEN 7a)
 *   - 100 sample records "Musterartikel 001" to "Musterartikel 100", visibly marked as samples, without 7Vis
 *     product names (PLAN 6, Drehbuch D11 b). 001 to 003 are the samples the home page and the preview of
 *     the navigation show since stage 3 (forces 02, 04, 06, CHF 10.00, CHF 20.00, sold out); 004 to 100
 *     follow the forces, so that the counts per force keep the proportions of the assortment list (W 07):
 *     16, 16, 15, 15, 15, 13, 10.
 *   - one amount per currency as an integer in Rappen and Cent, no exchange rate (PLAN 6, W 06)
 *   - variants with an article number, an attribute and a stock level; stock 0 = sold out (PLAN 6)
 *   - a sample shipping rule, sample orders of the sample account and a sample voucher code; all of it
 *     invented for the study and marked as such where it is shown (W 08: shipping rules are missing)
 *
 * Pure data and pure functions: no browser API, so Node can import this file as well.
 */

export const KRAEFTE = Object.freeze([
  Object.freeze({ nr: 1, name: 'Wärmen', wirkung: 'röstet die grüne Bohne' }),
  Object.freeze({ nr: 2, name: 'Mahlen', wirkung: 'gehärteter Stahl mahlt die geröstete Bohne' }),
  Object.freeze({ nr: 3, name: 'Verdichten', wirkung: 'das Pulver wird zum Puck getampt' }),
  Object.freeze({ nr: 4, name: 'Pumpen', wirkung: 'die Pumpe saugt das Wasser an' }),
  Object.freeze({ nr: 5, name: 'Auflösen', wirkung: 'heisses Wasser löst die Aromen' }),
  Object.freeze({ nr: 6, name: 'Fliessen', wirkung: 'das Wasser durchströmt den Puck, das Getränk entsteht' }),
  Object.freeze({ nr: 7, name: 'Entnehmen', wirkung: 'der Puck verlässt das Sieb' }),
]);

/** Sample records 004 to 100 per force; with 001 to 003 (forces 2, 4, 6) the W 07 proportions, 100 in all. */
const PRO_KRAFT = [16, 15, 15, 14, 15, 12, 10];
/** The three samples of stage 3 (home page cards, preview of the navigation): force, CHF, EUR, stock. */
const ERSTE = [[2, 1000, 1050, 24], [4, 2000, 2100, 24], [6, 3000, 3150, 0]];

/** Statuses of the data model (PLAN 6). The study uses 'in-vorbereitung', 'lieferbar' and 'ausverkauft'. */
export const STATUS = Object.freeze({
  'in-vorbereitung': 'In Vorbereitung',
  vormerkbar: 'Vormerkbar',
  lieferbar: 'Lieferbar',
  ausverkauft: 'Ausverkauft',
});

export const WAEHRUNGEN = Object.freeze(['CHF', 'EUR']);

/** Highest quantity per cart line (the reference offers 1 to 12, IS 4). */
export const HOECHSTMENGE = 12;

/** Swiss VAT, normal rate since 2024. Shown as "darin enthalten" for deliveries to CH and LI. [Anwalt] */
export const MWST_CH = 0.081;

const KURZ_MUSTER = 'Musterdatensatz der Studie, nicht im Verkauf.';

/* Deterministic pseudo random numbers (mulberry32), so every run and every page shows the same samples. */
function zufall(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const drei = (n) => String(n).padStart(3, '0');

/** Swiss retail amounts end on .00, .50 or .90 (5-Rappen rounding); the samples follow that. */
function endung(rappen) {
  const franken = Math.floor(rappen / 100);
  const rest = rappen % 100;
  const ziel = rest < 25 ? 0 : rest < 70 ? 50 : 90;
  return franken * 100 + ziel;
}

function erzeugen() {
  const rnd = zufall(20261120);
  const liste = [];
  liste.push(Object.freeze({
    id: 'pucker',
    pfad: 'pucker',
    nr: 0,
    name: 'Pucker',
    kraft: 3,
    muster: false,
    status: 'in-vorbereitung',
    kurz: 'Mechanische Espresso-Tamperstation',
    preis: null,
    merkmal: null,
    varianten: Object.freeze([]),
  }));
  let nr = 0;
  for (const [kraft, chf, eur, bestand] of ERSTE) {
    nr += 1;
    liste.push({
      id: `m${drei(nr)}`,
      pfad: `muster-${drei(nr)}`,
      nr,
      name: `Musterartikel ${drei(nr)}`,
      kraft,
      muster: true,
      status: 'lieferbar',
      kurz: KURZ_MUSTER,
      preis: Object.freeze({ CHF: chf, EUR: eur }),
      merkmal: null,
      varianten: [Object.freeze({ id: `m${drei(nr)}-standard`, sku: `7V-M${drei(nr)}-S`, name: 'Standard', preis: Object.freeze({ CHF: chf, EUR: eur }), bestand })],
    });
  }
  PRO_KRAFT.forEach((anzahl, k) => {
    for (let i = 0; i < anzahl; i += 1) {
      nr += 1;
      const basis = endung(Math.round(800 + rnd() * rnd() * 17000));
      // Own amount per currency, no conversion rate (PLAN 6): the EUR sample sits a little above.
      const eur = endung(Math.round(basis * (1.02 + rnd() * 0.06)));
      const mitVarianten = rnd() < 0.4;
      const varianten = [];
      const namen = mitVarianten ? ['A', 'B', 'C'] : ['Standard'];
      namen.forEach((v, j) => {
        const aufschlag = j * endung(Math.round(150 + rnd() * 350));
        varianten.push(Object.freeze({
          id: `m${drei(nr)}-${v.toLowerCase()}`,
          sku: `7V-M${drei(nr)}-${v === 'Standard' ? 'S' : v}`,
          name: v,
          preis: Object.freeze({ CHF: basis + aufschlag, EUR: eur + aufschlag }),
          bestand: rnd() < 0.08 ? 0 : rnd() < 0.12 ? 3 : 24,
        }));
      });
      liste.push({
        id: `m${drei(nr)}`,
        pfad: `muster-${drei(nr)}`,
        nr,
        name: `Musterartikel ${drei(nr)}`,
        kraft: k + 1,
        muster: true,
        status: 'lieferbar',
        kurz: KURZ_MUSTER,
        preis: Object.freeze({ CHF: basis, EUR: eur }),
        merkmal: mitVarianten ? 'Variante' : null,
        varianten,
      });
    }
  });

  // Fixed cases the study demonstrates (independent of the random draw):
  //   001  three variants at the same price: A in stock, B low stock (3: the error "only 3 left"), C sold out
  //   002  in stock (home page, preview), 003 sold out (home page, preview, catalogue state)
  //   plus seven more sold-out records, so the catalogue filter has something to hide
  const setze = (n, f) => f(liste.find((x) => x.nr === n));
  setze(1, (p) => {
    p.merkmal = 'Variante';
    p.varianten = [
      Object.freeze({ id: 'm001-a', sku: '7V-M001-A', name: 'A', preis: Object.freeze({ CHF: 1000, EUR: 1050 }), bestand: 24 }),
      Object.freeze({ id: 'm001-b', sku: '7V-M001-B', name: 'B', preis: Object.freeze({ CHF: 1000, EUR: 1050 }), bestand: 3 }),
      Object.freeze({ id: 'm001-c', sku: '7V-M001-C', name: 'C', preis: Object.freeze({ CHF: 1000, EUR: 1050 }), bestand: 0 }),
    ];
  });
  for (const n of [9, 26, 41, 66, 85, 95, 99]) {
    setze(n, (p) => {
      p.varianten = p.varianten.map((v) => Object.freeze({ ...v, bestand: 0 }));
    });
  }
  for (const p of liste) {
    if (!p.muster) continue;
    if (p.varianten.every((v) => v.bestand === 0)) p.status = 'ausverkauft';
    p.varianten = Object.freeze(p.varianten);
    Object.freeze(p);
  }
  return Object.freeze(liste);
}

export const PRODUKTE = erzeugen();

/** Products of the stage on /werkzeuge: the own tool plus two samples (Drehbuch D11 b). */
export const BUEHNE = Object.freeze(['pucker', 'm001', 'm002']);
/** Samples in the preview of the navigation (stage 3: forces 02, 04, 06; the last one sold out). */
export const VORSCHAU = Object.freeze(['m001', 'm002', 'm003']);

/**
 * Sample shipping rule (W 08: rules, costs and countries are missing). Invented for the study, shown as
 * "Musterregel" wherever it appears. Countries and labels of the delivery address form.
 */
export const LAENDER = Object.freeze([
  Object.freeze({ code: 'CH', name: 'Schweiz', plz: /^[1-9]\d{3}$/, plzHinweis: '4 Ziffern', mwst: true }),
  Object.freeze({ code: 'LI', name: 'Liechtenstein', plz: /^94(8[5-9]|9\d)$/, plzHinweis: '4 Ziffern, 9485 bis 9499', mwst: true }),
  Object.freeze({ code: 'DE', name: 'Deutschland', plz: /^\d{5}$/, plzHinweis: '5 Ziffern', mwst: false }),
  Object.freeze({ code: 'AT', name: 'Österreich', plz: /^\d{4}$/, plzHinweis: '4 Ziffern', mwst: false }),
  Object.freeze({ code: 'FR', name: 'Frankreich', plz: /^\d{5}$/, plzHinweis: '5 Ziffern', mwst: false }),
  Object.freeze({ code: 'IT', name: 'Italien', plz: /^\d{5}$/, plzHinweis: '5 Ziffern', mwst: false }),
]);

export const VERSAND = Object.freeze({
  CH: Object.freeze([
    Object.freeze({ id: 'ch-economy', name: 'Paket Economy (Muster)', frist: '2 bis 3 Werktage', preis: Object.freeze({ CHF: 900, EUR: 950 }) }),
    Object.freeze({ id: 'ch-priority', name: 'Paket Priority (Muster)', frist: '1 Werktag', preis: Object.freeze({ CHF: 1200, EUR: 1250 }) }),
  ]),
  EU: Object.freeze([
    Object.freeze({ id: 'eu-international', name: 'Paket International (Muster)', frist: '5 bis 8 Werktage', preis: Object.freeze({ CHF: 2400, EUR: 2500 }) }),
  ]),
});

export function versandFuer(land) {
  return land === 'CH' || land === 'LI' ? VERSAND.CH : VERSAND.EU;
}

/** Sample voucher (vouchers are phase 2, W 06): shows the field's success and error states. */
export const GUTSCHEINE = Object.freeze({ MUSTER10: 10 });

/** Orders of the sample account (shown on /konto, marked as samples). */
export const MUSTER_BESTELLUNGEN = Object.freeze([
  Object.freeze({
    nr: 'M-2026-0007',
    datum: '2026-11-03',
    status: 'Versendet',
    waehrung: 'CHF',
    zeilen: Object.freeze([Object.freeze({ variante: 'm002-standard', menge: 2 }), Object.freeze({ variante: 'm001-a', menge: 1 })]),
  }),
  Object.freeze({
    nr: 'M-2026-0004',
    datum: '2026-10-12',
    status: 'Zugestellt',
    waehrung: 'CHF',
    zeilen: Object.freeze([Object.freeze({ variante: 'm001-b', menge: 1 })]),
  }),
]);

/* ---------- helpers shared by the adapter and the generator ---------- */

export function produktVon(id) {
  return PRODUKTE.find((p) => p.id === id || p.pfad === id) || null;
}

export function varianteVon(id) {
  for (const p of PRODUKTE) {
    const v = p.varianten.find((x) => x.id === id);
    if (v) return { produkt: p, variante: v };
  }
  return null;
}

/** Lowest price of a product (catalogue and teasers show "ab" when variants differ). */
export function preisAb(p) {
  if (!p.varianten.length) return null;
  const chf = Math.min(...p.varianten.map((v) => v.preis.CHF));
  const eur = Math.min(...p.varianten.map((v) => v.preis.EUR));
  const gleich = p.varianten.every((v) => v.preis.CHF === p.varianten[0].preis.CHF);
  return { CHF: chf, EUR: eur, ab: !gleich };
}

/**
 * Amount in Rappen or Cent as text: "CHF 1'490.00". Thousands with an apostrophe (W 04), the decimal
 * point of Swiss price tags. Own formatter, so Node (generator) and the browser write the same text.
 */
export function formatBetrag(betrag, waehrung = 'CHF') {
  if (!Number.isFinite(betrag)) return '';
  const negativ = betrag < 0;
  const abs = Math.abs(Math.round(betrag));
  const ganz = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const rest = String(abs % 100).padStart(2, '0');
  return `${waehrung} ${negativ ? '-' : ''}${ganz}.${rest}`;
}

/** Included VAT of a gross amount (Swiss deliveries). */
export function mwstAnteil(brutto) {
  return Math.round((brutto * MWST_CH) / (1 + MWST_CH));
}
