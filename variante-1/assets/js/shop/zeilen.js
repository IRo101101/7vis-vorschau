/**
 * Cart lines shared by the cart panel (shell) and the cart page /warenkorb (stage 5).
 *
 * A line is a clone of <template> (all labels in the HTML):
 *   <li data-cart-line> … [data-cart-line-link] [data-cart-line-name] [data-cart-line-variant] with
 *   [data-cart-line-variant-value], [data-cart-line-price], [data-cart-line-unit] with
 *   [data-cart-line-unit-value], the qty-select with select[data-cart-line-qty] (data-cart-line-qty-label
 *   "Menge für {name}"), button[data-cart-line-remove] (data-cart-line-remove-label "{name} entfernen"),
 *   [data-cart-line-note] with [data-cart-line-msg="ausverkauft|bestand|fehler"] and [data-cart-line-stock]
 * Data come from the shop adapter; the line state is data-cart-line-state = ok | laedt | ausverkauft |
 * bestand | fehler, and a pending line dims to TIMING.cart.pendingOpacity (refmedia F20).
 */
import { HOECHSTMENGE } from './muster-daten.js';
import { TIMING } from '../motion/curves.js';

const fill = (pattern, name) => String(pattern || '').replace('{name}', name);

export function zeilenName(z) {
  return z.merkmal ? `${z.name}, ${z.merkmal} ${z.varianteName}` : z.name;
}

export function zeileFuellen(li, z, { fmt, pending, motion }) {
  li.setAttribute('data-cart-line', z.zeile);
  const name = zeilenName(z);
  for (const a of li.querySelectorAll('[data-cart-line-link]')) a.setAttribute('href', `${z.pfad}.html`);
  const nameEl = li.querySelector('[data-cart-line-name]');
  if (nameEl) nameEl.textContent = z.name;
  const v = li.querySelector('[data-cart-line-variant]');
  if (v) {
    v.hidden = !z.merkmal;
    const val = v.querySelector('[data-cart-line-variant-value]');
    if (val) val.textContent = z.varianteName;
  }
  const price = li.querySelector('[data-cart-line-price]');
  if (price) price.textContent = fmt(z.summe);
  const unit = li.querySelector('[data-cart-line-unit]');
  if (unit) {
    unit.hidden = z.menge < 2;
    const val = unit.querySelector('[data-cart-line-unit-value]');
    if (val) val.textContent = fmt(z.einzelpreis);
  }
  const sel = li.querySelector('[data-cart-line-qty]');
  if (sel) {
    const max = Math.max(z.menge, Math.min(HOECHSTMENGE, z.bestand || z.menge));
    if (sel.options.length !== max) {
      sel.textContent = '';
      for (let n = 1; n <= max; n += 1) sel.append(new Option(String(n), String(n)));
    }
    // While the adapter works the field keeps what the user chose (the line is dimmed, F20).
    if (!pending.has(z.zeile)) sel.value = String(z.menge);
    sel.setAttribute('aria-label', fill(sel.getAttribute('data-cart-line-qty-label'), name));
  }
  const rm = li.querySelector('[data-cart-line-remove]');
  if (rm) rm.setAttribute('aria-label', fill(rm.getAttribute('data-cart-line-remove-label'), name));
  const stock = li.querySelector('[data-cart-line-stock]');
  if (stock) stock.textContent = String(z.bestand);
  const issue = z.ausverkauft ? 'ausverkauft' : z.zuViel ? 'bestand' : li.getAttribute('data-cart-line-error') ? 'fehler' : '';
  for (const m of li.querySelectorAll('[data-cart-line-msg]')) m.hidden = m.getAttribute('data-cart-line-msg') !== issue;
  const note = li.querySelector('[data-cart-line-note]');
  if (note) note.hidden = !issue;
  const busy = pending.has(z.zeile);
  li.setAttribute('data-cart-line-state', busy ? 'laedt' : issue || 'ok');
  motion.set(li, { opacity: busy ? TIMING.cart.pendingOpacity : 1 });
}

/** Bring the list in line with the cart: update, add (template clones) and remove lines in order. */
export function zeilenRendern(list, tpl, cart, opts) {
  const byId = new Map([...list.children].map((li) => [li.getAttribute('data-cart-line'), li]));
  const keep = new Set();
  let prev = null;
  for (const z of cart.zeilen) {
    let li = byId.get(z.zeile);
    if (!li) {
      li = tpl.content.firstElementChild.cloneNode(true);
      if (prev) prev.after(li);
      else list.prepend(li);
    }
    keep.add(li);
    zeileFuellen(li, z, opts);
    prev = li;
  }
  for (const li of [...list.children]) if (!keep.has(li)) li.remove();
}
