/**
 * Form helpers of the shop route (stage 5): checkout, sign-in, dealer enquiry and contact form.
 *
 * Markup per field (the message text is in the HTML, hidden until needed):
 *   <div class="feld">
 *     <label for="x" class="feld__etikett">E-Mail</label>
 *     <input id="x" name="email" type="email" required aria-describedby="x-fehler">
 *     <p id="x-fehler" class="feld__fehler" data-feld-fehler hidden>Bitte eine gültige E-Mail-Adresse eingeben.</p>
 *   </div>
 * Native constraint validation decides (required, type, pattern, maxlength); with the runtime the form gets
 * novalidate and these helpers show the own messages: aria-invalid on the field, its message, and a summary
 * with links to every wrong field (UWG duty "Eingabefehler vor der Bestellung korrigierbar", PLAN 6 [Anwalt]).
 * Without script the browser's own validation runs.
 */

export function fehlerElement(field) {
  const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const n = document.getElementById(id);
    if (n && n.hasAttribute('data-feld-fehler')) return n;
  }
  return null;
}

export function labelText(field) {
  const l = field.id ? field.ownerDocument.querySelector(`label[for="${CSS.escape(field.id)}"]`) : null;
  const t = (l ? l.textContent : field.getAttribute('aria-label') || field.name || '').replace(/\s+/g, ' ').trim();
  return t;
}

/** Mark one field; extra(field) may return false for a custom rule (e.g. the postcode of a country). */
export function feldPruefen(field, extra) {
  if (!field || field.disabled || field.closest('[hidden]')) return true;
  let ok = field.checkValidity();
  if (ok && extra) ok = extra(field) !== false;
  const msg = fehlerElement(field);
  if (ok) {
    field.removeAttribute('aria-invalid');
    if (msg) msg.hidden = true;
  } else {
    field.setAttribute('aria-invalid', 'true');
    if (msg) msg.hidden = false;
  }
  return ok;
}

/** Check all fields of a form (or of a part of it); returns the wrong ones in document order. */
export function pruefen(root, extra) {
  const fields = [...root.querySelectorAll('input, select, textarea')].filter((f) => f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button');
  const seenRadio = new Set();
  const wrong = [];
  for (const f of fields) {
    if (f.type === 'radio') {
      if (seenRadio.has(f.name)) continue;
      seenRadio.add(f.name);
    }
    if (!feldPruefen(f, extra)) wrong.push(f);
  }
  return wrong;
}

/** Fill the error summary with links to the wrong fields (labels from the HTML). */
export function zusammenfassung(box, wrong) {
  if (!box) return;
  const list = box.querySelector('[data-formular-liste]');
  if (list) {
    list.textContent = '';
    for (const f of wrong) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `#${f.id}`;
      a.textContent = labelText(f);
      a.addEventListener('click', (e) => {
        e.preventDefault();
        f.focus();
      });
      li.append(a);
      list.append(li);
    }
  }
  box.hidden = !wrong.length;
}

/** Remove everything these helpers added (module destroy). */
export function aufraeumen(root, box) {
  for (const f of root.querySelectorAll('[aria-invalid]')) f.removeAttribute('aria-invalid');
  for (const m of root.querySelectorAll('[data-feld-fehler]')) m.hidden = true;
  if (box) {
    const list = box.querySelector('[data-formular-liste]');
    if (list) list.textContent = '';
    box.hidden = true;
  }
}

/** Plain object of the form values (radio and checkbox aware). */
export function werte(form) {
  const out = {};
  for (const f of form.elements) {
    if (!f.name || f.disabled) continue;
    if (f.type === 'radio') {
      if (f.checked) out[f.name] = f.value;
    } else if (f.type === 'checkbox') {
      out[f.name] = f.checked;
    } else if (f.tagName !== 'BUTTON' && f.type !== 'submit') {
      out[f.name] = f.value.trim();
    }
  }
  return out;
}
