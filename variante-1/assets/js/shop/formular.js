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
 *
 * Sample forms of the study (stage 7, CONTRACT 2 rule 9): fields carry data-feld="<name>" instead of name, and
 * the form points to formular-muster.html with GET. A submit without script (or with a failed module) then
 * validates natively and ends on the marked sample page without sending a single value. The PHP templates
 * write name="<name>" and post to their endpoint; these helpers read either attribute.
 */

/** Name of a field: name (PHP shop, buy box, catalogue) or data-feld (sample forms of the study). */
export function feldName(field) {
  return (field && (field.getAttribute('name') || field.getAttribute('data-feld'))) || '';
}

/** First field of a form (or any root) with that name, in either attribute. */
export function feld(root, name) {
  if (!root) return null;
  const n = CSS.escape(name);
  return root.querySelector(`[name="${n}"], [data-feld="${n}"]`);
}

export function fehlerElement(field) {
  const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
  for (const id of ids) {
    const n = document.getElementById(id);
    if (n && n.hasAttribute('data-feld-fehler')) return n;
  }
  return null;
}

/**
 * Visible name of a field for the error summary: the group's legend for radio buttons, else the field's own
 * label (label[for] or a wrapping label, field.labels), then aria-labelledby, then aria-label. Never the
 * technical name (the terms box showed "agb", review stage 7). Optional marks "(freiwillig)" are dropped.
 */
export function labelText(field) {
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').replace(/\s*\(freiwillig\)\s*/g, ' ').trim();
  if (field.type === 'radio') {
    const legend = field.closest('fieldset') && field.closest('fieldset').querySelector('legend');
    if (legend && clean(legend.textContent)) return clean(legend.textContent);
  }
  const labels = field.labels && field.labels.length ? [...field.labels] : [];
  if (labels.length) return clean(labels.map((l) => l.textContent).join(' '));
  const by = (field.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean).map((id) => field.ownerDocument.getElementById(id)).filter(Boolean);
  if (by.length) return clean(by.map((n) => n.textContent).join(' '));
  return clean(field.getAttribute('aria-label') || field.getAttribute('title') || '');
}

/** Mark one field; extra(field) may return false for a custom rule (e.g. the postcode of a country). */
export function feldPruefen(field, extra) {
  if (!field || field.matches(':disabled') || field.closest('[hidden]')) return true;
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
      if (seenRadio.has(feldName(f))) continue;
      seenRadio.add(feldName(f));
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

/** Plain object of the form values (radio and checkbox aware; name or data-feld). */
export function werte(form) {
  const out = {};
  for (const f of form.elements) {
    const name = feldName(f);
    if (!name || f.matches(':disabled')) continue;
    if (f.type === 'radio') {
      if (f.checked) out[name] = f.value;
    } else if (f.type === 'checkbox') {
      out[name] = f.checked;
    } else if (f.tagName !== 'BUTTON' && f.tagName !== 'FIELDSET' && f.type !== 'submit') {
      out[name] = f.value.trim();
    }
  }
  return out;
}
