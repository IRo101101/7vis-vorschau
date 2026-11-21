/**
 * Shop adapter "Muster" (PLAN 6 "Neutrale Schnittstelle", FRAGEN 1a): the sample adapter of the study.
 *
 * The front end talks to a shop only through an adapter with this contract (names of PLAN 6, plus the
 * account and order calls the checkout study needs, stage 5):
 *
 *   catalogue   produkte(filter, sprache)   produkt(pfad, sprache)
 *   cart        warenkorb()   hinzufuegen(variante, menge)   menge_aendern(zeile, menge)   entfernen(zeile)
 *               bei_aenderung(funktion)
 *   checkout    versandvorschau(land)   gutschein(code)   kasse(daten) -> { adresse, nr }
 *               bestellung(nr)   zahlung_bestaetigen(nr)   zahlung_abbrechen(nr)
 *   account     konto()   anmelden_start(email)   anmelden_code(email, code)   abmelden()   einstellung(name, wert)
 *   other       betrag(geld, sprache, waehrung)   anfrage(art, felder)
 *
 * Every call returns a promise; errors are Error objects with a `code`:
 *   'ausverkauft' variant sold out   'bestand' more than in stock (err.verfuegbar)   'hoechstmenge' more
 *   than HOECHSTMENGE in one line   'unbekannt' no such variant, line or order   'ungueltig' invalid input
 *   'stoerung' the shop does not answer (network, server)
 *
 * The PHP adapter (shop project) implements the same calls against the shop's form endpoints; the pages
 * stay server rendered. Where it plugs in is listed in build/ETAPPE-5.md section 5.
 *
 * This adapter keeps everything in the browser (localStorage, every access guarded): nothing is sent,
 * nothing is sold, payment and confirmation are samples. Latency follows the reference clip (TIMING.cart),
 * so loading states can be seen. stoerung(art) is a review and test aid: 'fehler' (every call fails as if
 * the network were down), 'langsam' (latency x 4), 'ausverkauft' (every variant in the cart sold out),
 * null (normal).
 */
import {
  PRODUKTE, KRAEFTE, HOECHSTMENGE, VERSAND, LAENDER, GUTSCHEINE, MUSTER_BESTELLUNGEN,
  produktVon, varianteVon, versandFuer, formatBetrag, mwstAnteil,
} from './muster-daten.js';
import { TIMING } from '../motion/curves.js';

const KEYS = Object.freeze({
  cart: 'v1-warenkorb-muster',
  konto: 'v1-konto-muster',
  bestellungen: 'v1-bestellungen-muster',
  anmeldung: 'v1-anmeldung-muster',
  stoerung: 'v1-stoerung-muster',
});
const L = TIMING.cart.latency;

const listeners = new Set();
const memory = new Map();

function lesen(key, fallback) {
  try {
    const raw = globalThis.localStorage && globalThis.localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (err) {
    /* storage blocked or broken: fall back to memory */
  }
  return memory.has(key) ? memory.get(key) : fallback;
}

function schreiben(key, value) {
  memory.set(key, value);
  try {
    if (globalThis.localStorage) {
      if (value === null) globalThis.localStorage.removeItem(key);
      else globalThis.localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (err) {
    /* storage blocked: the value lives for this page only */
  }
}

const fehler = (code, message, extra = {}) => Object.assign(new Error(message), { code }, extra);

function stoerung() {
  return lesen(KEYS.stoerung, null);
}

/** Latency of the sample shop; 'fehler' rejects after it like a dropped request. */
function warten(sekunden) {
  const art = stoerung();
  const ms = sekunden * 1000 * (art === 'langsam' ? L.slowFactor : 1);
  return new Promise((resolve, reject) => {
    setTimeout(() => (art === 'fehler' ? reject(fehler('stoerung', 'Der Musterladen antwortet nicht.')) : resolve()), ms);
  });
}

/* ---------- cart ---------- */

function rohKorb() {
  const data = lesen(KEYS.cart, null);
  return data && Array.isArray(data.zeilen) ? data : { zeilen: [] };
}

function bestandVon(v) {
  return stoerung() === 'ausverkauft' ? 0 : v.bestand;
}

/** Cart with everything a view needs; amounts per currency in Rappen and Cent. */
function korb() {
  const zeilen = [];
  for (const z of rohKorb().zeilen) {
    const hit = varianteVon(z.variante);
    if (!hit) continue;
    const { produkt: p, variante: v } = hit;
    const bestand = bestandVon(v);
    zeilen.push({
      zeile: z.zeile,
      variante: v.id,
      sku: v.sku,
      produkt: p.id,
      pfad: p.pfad,
      name: p.name,
      muster: p.muster,
      kraft: p.kraft,
      merkmal: p.merkmal,
      varianteName: v.name,
      menge: z.menge,
      bestand,
      ausverkauft: bestand === 0,
      zuViel: bestand > 0 && z.menge > bestand,
      einzelpreis: { ...v.preis },
      summe: { CHF: v.preis.CHF * z.menge, EUR: v.preis.EUR * z.menge },
    });
  }
  const menge = zeilen.reduce((n, z) => n + z.menge, 0);
  const zwischensumme = {
    CHF: zeilen.reduce((n, z) => n + z.summe.CHF, 0),
    EUR: zeilen.reduce((n, z) => n + z.summe.EUR, 0),
  };
  const bestellbar = zeilen.length > 0 && zeilen.every((z) => !z.ausverkauft && !z.zuViel);
  return { zeilen, menge, zwischensumme, bestellbar };
}

function speichern(zeilen) {
  schreiben(KEYS.cart, { zeilen: zeilen.map((z) => ({ zeile: z.zeile, variante: z.variante, menge: z.menge })) });
  const k = korb();
  for (const fn of [...listeners]) {
    try {
      fn(k);
    } catch (err) {
      console.error('[v1:shop] listener failed', err);
    }
  }
  return k;
}

/* ---------- orders and account ---------- */

function bestellungen() {
  const list = lesen(KEYS.bestellungen, null);
  return Array.isArray(list) ? list : [];
}

function neueNummer() {
  const nr = 8 + bestellungen().length;
  return `M-2026-${String(nr).padStart(4, '0')}`;
}

function summen(zeilen, waehrung, versandPreis, prozent) {
  const zwischen = zeilen.reduce((n, z) => n + z.einzelpreis[waehrung] * z.menge, 0);
  const rabatt = prozent ? Math.round((zwischen * prozent) / 100) : 0;
  const versand = versandPreis || 0;
  const total = zwischen - rabatt + versand;
  return { zwischen, rabatt, versand, total };
}

function bestellzeilen(roh) {
  return roh.map((z) => {
    const hit = varianteVon(z.variante);
    if (!hit) return null;
    return {
      variante: z.variante,
      name: hit.produkt.name,
      pfad: hit.produkt.pfad,
      merkmal: hit.produkt.merkmal,
      varianteName: hit.variante.name,
      menge: z.menge,
      einzelpreis: { ...hit.variante.preis },
    };
  }).filter(Boolean);
}

function musterBestellung(b) {
  const zeilen = bestellzeilen(b.zeilen);
  const s = summen(zeilen, b.waehrung, versandFuer('CH')[0].preis[b.waehrung], 0);
  return { ...b, zeilen, summen: s, muster: true };
}

const gueltigeMail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());

/* ---------- the adapter ---------- */

export const adapter = Object.freeze({
  name: 'muster',

  produkte(filter = {}) {
    let list = [...PRODUKTE];
    if (filter.kraft) list = list.filter((p) => p.kraft === Number(filter.kraft));
    if (filter.lieferbar) list = list.filter((p) => p.status === 'lieferbar');
    return Promise.resolve(list);
  },

  produkt(pfad) {
    return Promise.resolve(produktVon(pfad));
  },

  kraefte() {
    return Promise.resolve(KRAEFTE);
  },

  warenkorb() {
    return Promise.resolve(korb());
  },

  async hinzufuegen(variante, menge = 1) {
    const hit = varianteVon(variante);
    const n = Math.floor(Number(menge));
    if (!hit || !hit.produkt.muster) throw fehler('unbekannt', `[v1:shop] variant "${variante}" cannot be added`);
    if (!(n >= 1)) throw fehler('ungueltig', 'Menge ungültig.');
    await warten(L.add);
    const bestand = bestandVon(hit.variante);
    if (bestand === 0) throw fehler('ausverkauft', 'Diese Variante ist ausverkauft.');
    const zeilen = rohKorb().zeilen.map((z) => ({ ...z }));
    const vorhanden = zeilen.find((z) => z.variante === variante);
    const neu = (vorhanden ? vorhanden.menge : 0) + n;
    if (neu > bestand) throw fehler('bestand', 'Nicht genug an Lager.', { verfuegbar: bestand, imKorb: vorhanden ? vorhanden.menge : 0 });
    if (neu > HOECHSTMENGE) throw fehler('hoechstmenge', 'Höchstmenge erreicht.', { verfuegbar: HOECHSTMENGE, imKorb: vorhanden ? vorhanden.menge : 0 });
    if (vorhanden) vorhanden.menge = neu;
    else zeilen.push({ zeile: `z-${variante}`, variante, menge: n });
    return speichern(zeilen);
  },

  async menge_aendern(zeile, menge) {
    const n = Math.floor(Number(menge));
    await warten(L.change);
    const zeilen = rohKorb().zeilen.map((z) => ({ ...z }));
    const z = zeilen.find((x) => x.zeile === zeile);
    if (!z) throw fehler('unbekannt', 'Diese Position gibt es nicht mehr.');
    if (n <= 0) return speichern(zeilen.filter((x) => x !== z));
    const hit = varianteVon(z.variante);
    const bestand = hit ? bestandVon(hit.variante) : 0;
    if (n > HOECHSTMENGE) throw fehler('hoechstmenge', 'Höchstmenge erreicht.', { verfuegbar: HOECHSTMENGE });
    if (n > bestand) throw fehler(bestand ? 'bestand' : 'ausverkauft', 'Nicht genug an Lager.', { verfuegbar: bestand });
    z.menge = n;
    return speichern(zeilen);
  },

  async entfernen(zeile) {
    await warten(L.remove);
    return speichern(rohKorb().zeilen.filter((z) => z.zeile !== zeile).map((z) => ({ ...z })));
  },

  /** Shipping methods for a country (sample rule) plus the countries the form offers. */
  versandvorschau(land = 'CH') {
    const arten = versandFuer(land).map((a) => ({ ...a, preis: { ...a.preis } }));
    return Promise.resolve({ land, arten, laender: LAENDER.map((l) => ({ code: l.code, name: l.name })) });
  },

  async gutschein(code) {
    await warten(L.change);
    const key = String(code || '').trim().toUpperCase();
    if (!GUTSCHEINE[key]) throw fehler('ungueltig', 'Dieser Code ist ungültig.');
    return { code: key, prozent: GUTSCHEINE[key] };
  },

  /**
   * Hand-off to the checkout of the payment service (PLAN 6 step 4). The sample keeps the order in the
   * browser as "offen" and returns the address of the sample payment page; the PHP shop creates the
   * order, starts a Payrexx or wallee payment and returns its hosted page.
   */
  async kasse(daten) {
    await warten(L.add);
    const k = korb();
    if (!k.bestellbar) throw fehler('ungueltig', 'Der Warenkorb kann so nicht bestellt werden.');
    const waehrung = daten.waehrung === 'EUR' ? 'EUR' : 'CHF';
    const art = versandFuer(daten.adresse.land).find((a) => a.id === daten.versand);
    if (!art) throw fehler('ungueltig', 'Versandart fehlt.');
    const zeilen = k.zeilen.map((z) => ({ variante: z.variante, menge: z.menge }));
    const nr = neueNummer();
    const best = {
      nr,
      datum: new Date().toISOString().slice(0, 10),
      status: 'offen',
      waehrung,
      email: daten.email,
      gast: !adapter.kontoSofort(),
      adresse: { ...daten.adresse },
      rechnung: daten.rechnung ? { ...daten.rechnung } : null,
      versand: { id: art.id, name: art.name, frist: art.frist, preis: art.preis[waehrung] },
      gutschein: daten.gutschein || null,
      zeilen,
    };
    schreiben(KEYS.bestellungen, [best, ...bestellungen()]);
    return { adresse: `zahlung-muster.html?bestellung=${encodeURIComponent(nr)}`, nr };
  },

  bestellung(nr) {
    const b = bestellungen().find((x) => x.nr === nr);
    if (!b) return Promise.resolve(null);
    const zeilen = bestellzeilen(b.zeilen);
    const prozent = b.gutschein ? b.gutschein.prozent : 0;
    return Promise.resolve({ ...b, zeilen, summen: summen(zeilen, b.waehrung, b.versand.preis, prozent), muster: true });
  },

  /** Stands for the signed webhook of the payment service (PLAN 6 step 5): only it confirms the payment. */
  async zahlung_bestaetigen(nr) {
    await warten(L.add);
    const list = bestellungen();
    const b = list.find((x) => x.nr === nr);
    if (!b) throw fehler('unbekannt', 'Diese Bestellung gibt es nicht.');
    if (b.status === 'offen') {
      b.status = 'Bezahlt (Muster)';
      schreiben(KEYS.bestellungen, list);
      speichern([]);
    }
    return adapter.bestellung(nr);
  },

  async zahlung_abbrechen(nr) {
    await warten(L.remove);
    const list = bestellungen().filter((x) => !(x.nr === nr && x.status === 'offen'));
    schreiben(KEYS.bestellungen, list);
    return true;
  },

  /* ---------- account (sample: e-mail plus a one-time code; any six digits pass, nothing is sent) ---------- */

  konto() {
    const k = lesen(KEYS.konto, null);
    if (!k || !k.email) return Promise.resolve(null);
    const eigene = bestellungen().filter((b) => b.email === k.email && b.status !== 'offen');
    return Promise.all(eigene.map((b) => adapter.bestellung(b.nr))).then((list) => ({
      email: k.email,
      seit: k.seit,
      neu: !!k.neu,
      newsletter: !!k.newsletter,
      adresse: k.adresse || null,
      bestellungen: [...list.filter(Boolean), ...MUSTER_BESTELLUNGEN.map(musterBestellung)],
    }));
  },

  /** Synchronous check used by the checkout to tell guests from account holders. */
  kontoSofort() {
    const k = lesen(KEYS.konto, null);
    return k && k.email ? k.email : null;
  },

  async anmelden_start(email) {
    const mail = String(email || '').trim();
    if (!gueltigeMail(mail)) throw fehler('ungueltig', 'Bitte eine gültige E-Mail-Adresse eingeben.');
    await warten(L.change);
    const bekannt = lesen(KEYS.anmeldung, { bekannt: [] }).bekannt || [];
    schreiben(KEYS.anmeldung, { bekannt, offen: mail.toLowerCase() });
    return { email: mail, neu: !bekannt.includes(mail.toLowerCase()) };
  },

  async anmelden_code(email, code) {
    const mail = String(email || '').trim().toLowerCase();
    if (!/^\d{6}$/.test(String(code || '').trim())) throw fehler('ungueltig', 'Der Code hat sechs Ziffern.');
    await warten(L.change);
    const st = lesen(KEYS.anmeldung, { bekannt: [] });
    if (st.offen !== mail) throw fehler('ungueltig', 'Bitte zuerst die E-Mail-Adresse eingeben.');
    const bekannt = st.bekannt || [];
    const neu = !bekannt.includes(mail);
    schreiben(KEYS.anmeldung, { bekannt: neu ? [...bekannt, mail] : bekannt, offen: null });
    const vorher = lesen(KEYS.konto, null);
    schreiben(KEYS.konto, { email: mail, seit: new Date().toISOString().slice(0, 10), neu, newsletter: !!(vorher && vorher.email === mail && vorher.newsletter) });
    return { email: mail, neu };
  },

  async abmelden() {
    schreiben(KEYS.konto, null);
    return true;
  },

  async einstellung(name, wert) {
    const k = lesen(KEYS.konto, null);
    if (!k) throw fehler('ungueltig', 'Nicht angemeldet.');
    await warten(L.remove);
    if (name === 'newsletter') k.newsletter = !!wert;
    if (name === 'adresse') k.adresse = wert;
    schreiben(KEYS.konto, k);
    return adapter.konto();
  },

  /** Enquiry of the dealer page and the contact form: nothing is sent in the study (PLAN 5 no. 48). */
  async anfrage(art, felder) {
    await warten(L.change);
    return { art, gesendet: false, muster: true, felder: Object.keys(felder || {}).length };
  },

  /** Amount in Rappen or Cent as text, e.g. { CHF: 1000 } -> "CHF 10.00" (own formatter, W 04). */
  betrag(geld, sprache = 'de-CH', waehrung = 'CHF') {
    if (!geld || !Number.isFinite(geld[waehrung])) return '';
    return formatBetrag(geld[waehrung], waehrung);
  },

  /** Included Swiss VAT of an amount (Rappen). */
  mwst(betrag) {
    return mwstAnteil(betrag);
  },

  laender() {
    return LAENDER;
  },

  versandarten() {
    return VERSAND;
  },

  /** Subscribe to cart changes; returns a function that unsubscribes. */
  bei_aenderung(funktion) {
    listeners.add(funktion);
    return () => listeners.delete(funktion);
  },

  /** Review and test aid (see header): 'fehler', 'langsam', 'ausverkauft' or null. */
  stoerung(art = null) {
    schreiben(KEYS.stoerung, art || null);
    const k = korb();
    for (const fn of [...listeners]) fn(k);
    return art || null;
  },
});

/** Test and review aid: empty the sample cart. */
export function leeren() {
  speichern([]);
}

/** Test and review aid: forget account, orders and sign-in state of the study. */
export function zuruecksetzen() {
  for (const key of [KEYS.konto, KEYS.bestellungen, KEYS.anmeldung, KEYS.stoerung]) schreiben(key, null);
  speichern([]);
}
