/**
 * sign-in: /anmelden after the shop decision E4 (12.09.2026, confirmed by the owner on 21.11.2026):
 * registration with e-mail and password, sign-in with password and "Eingeloggt bleiben" (a session of
 * 90 days), password reset; guests can still order; passkeys are a later option (phase 2).
 *
 * Markup: four forms [data-sign-in-step="anmelden|registrieren|vergessen|neu"] with fields as in
 * shop/formular.js (data-feld, CONTRACT 2 rule 9), an error summary each, messages [data-sign-in-msg=
 * "falsch|gesperrt|vorhanden|unbekannt"] ([data-sign-in-wait] seconds), password reasons
 * [data-passwort-grund="leer|kurz|lang|email|haeufig"] in the field's message, switches [data-sign-in-go=
 * "<step>"] (links to the forms' ids without script), [data-sign-in-show] (show the password),
 * [data-sign-in-sent] (reset requested), [data-sign-in-mail], [data-sign-in-info], [data-sign-in-done],
 * [data-sign-in-fail], [data-sign-in-guest].
 * Without script the first three forms stand one below the other and end on the sample page; with the module
 * one form shows at a time (?modus=registrieren|vergessen or the address's #fragment picks it).
 * Study: the sample adapter keeps accounts in this browser (a PBKDF2 check value, never the password), locks
 * an address for 30 s after five failed sign-ins (stands for the server's rate limit) and sends nothing.
 * After signing in or registering the browser goes on with the router to ?weiter= (kasse | konto).
 * ?email= fills the address (offer on the confirmation page).
 */
import { adapter } from '../shop/muster.js';
import { pruefen, feldPruefen, zusammenfassung, aufraeumen, feld } from '../shop/formular.js';
import { passwortGrund } from '../shop/muster-daten.js';

const ZIELE = { kasse: 'kasse.html', konto: 'konto.html' };
const STEPS = ['anmelden', 'registrieren', 'vergessen', 'neu'];
const BY_HASH = { '#anmelden': 'anmelden', '#konto-eroeffnen': 'registrieren', '#passwort-vergessen': 'vergessen' };

export default {
  name: 'sign-in',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const forms = Object.fromEntries(STEPS.map((s) => [s, el.querySelector(`[data-sign-in-step="${s}"]`)]));
    if (!forms.anmelden || !forms.registrieren) return null;
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    const mailOut = [...el.querySelectorAll('[data-sign-in-mail]')];
    const mailOutBefore = mailOut.map((n) => n.textContent);
    const waitOut = [...el.querySelectorAll('[data-sign-in-wait]')];
    const waitBefore = waitOut.map((n) => n.textContent);
    const shows = [...el.querySelectorAll('[data-sign-in-show]')];
    const params = new URLSearchParams(location.search);
    const weiter = ZIELE[params.get('weiter')] || ZIELE.konto;
    let resetMail = '';
    let alive = true;
    let busy = false;

    for (const f of Object.values(forms)) if (f) f.noValidate = true;
    if (params.get('email')) {
      for (const f of [forms.anmelden, forms.registrieren, forms.vergessen]) {
        const m = f && feld(f, 'email');
        if (m && !m.value) m.value = params.get('email').slice(0, 200);
      }
    }
    for (const a of el.querySelectorAll('[data-sign-in-guest]')) a.hidden = params.get('weiter') !== 'kasse';

    const msg = (form, key) => {
      for (const m of el.querySelectorAll('[data-sign-in-msg]')) m.hidden = true;
      const n = key && form && form.querySelector(`[data-sign-in-msg="${key}"]`);
      if (n) {
        n.hidden = false;
        n.focus();
      }
    };
    const fail = (on) => {
      for (const f of el.querySelectorAll('[data-sign-in-fail]')) f.hidden = !on;
    };

    function show(step, focus = true) {
      for (const [s, f] of Object.entries(forms)) if (f) f.hidden = s !== step;
      el.setAttribute('data-sign-in-state', step);
      msg(null, null);
      fail(false);
      if (focus) {
        const first = forms[step] && forms[step].querySelector('input:not([type="checkbox"])');
        if (first) first.focus();
      }
    }

    /** Password rule of the shop (muster-daten.js); the message names the reason. */
    function passwortOk(field) {
      if (field.getAttribute('data-feld') !== 'passwort' || field.closest('[data-sign-in-step="anmelden"]')) return true;
      const form = field.form;
      const mail = form === forms.neu ? resetMail : (feld(form, 'email') || {}).value || '';
      const grund = passwortGrund(field.value, mail);
      const box = document.getElementById(`${field.id}-fehler`);
      if (box) for (const s of box.querySelectorAll('[data-passwort-grund]')) s.hidden = s.getAttribute('data-passwort-grund') !== (grund || 'leer');
      return !grund;
    }

    function check(form) {
      // The reason of a refused password is set even when the native check (minlength) already fails.
      for (const pw of form.querySelectorAll('[data-feld="passwort"]')) passwortOk(pw);
      const wrong = pruefen(form, passwortOk);
      zusammenfassung(form.querySelector('[data-formular-summe]'), wrong);
      if (wrong.length) {
        const sum = form.querySelector('[data-formular-summe]');
        (sum || wrong[0]).focus();
        return false;
      }
      return true;
    }

    async function run(form, job) {
      if (busy) return;
      busy = true;
      form.setAttribute('aria-busy', 'true');
      msg(null, null);
      fail(false);
      try {
        await job();
      } catch (err) {
        if (!alive) return;
        const code = err && err.code;
        if (code === 'ungueltig' && err.feld) {
          const f = feld(form, err.feld);
          if (f) {
            feldPruefen(f, () => false);
            if (err.grund) passwortOk(f);
            f.focus();
          }
        } else if (code === 'gesperrt') {
          for (const n of waitOut) n.textContent = String(err.warten || 30);
          msg(form, 'gesperrt');
        } else if (['falsch', 'vorhanden', 'unbekannt'].includes(code)) {
          msg(form, code);
        } else fail(true);
      } finally {
        busy = false;
        form.removeAttribute('aria-busy');
      }
    }

    function signedIn(r) {
      for (const n of el.querySelectorAll('[data-sign-in-done]')) {
        n.hidden = false;
        for (const t of n.querySelectorAll('[data-sign-in-done-new]')) t.hidden = t.getAttribute('data-sign-in-done-new') !== String(!!r.neu);
      }
      for (const f of Object.values(forms)) if (f) f.hidden = true;
      el.setAttribute('data-sign-in-state', 'fertig');
      store.emit('router:go', { href: weiter });
    }

    const value = (form, name) => (feld(form, name) || {}).value || '';
    const checked = (form, name) => !!(feld(form, name) || {}).checked;

    ctx.listen(forms.anmelden, 'submit', (e) => {
      e.preventDefault();
      const f = forms.anmelden;
      if (!check(f)) return;
      run(f, async () => {
        const r = await adapter.anmelden(value(f, 'email'), value(f, 'passwort'), { bleiben: checked(f, 'bleiben') });
        if (alive) signedIn(r);
      });
    });
    ctx.listen(forms.registrieren, 'submit', (e) => {
      e.preventDefault();
      const f = forms.registrieren;
      if (!check(f)) return;
      run(f, async () => {
        const r = await adapter.registrieren(value(f, 'email'), value(f, 'passwort'), { bleiben: checked(f, 'bleiben') });
        if (alive) signedIn(r);
      });
    });
    if (forms.vergessen) {
      ctx.listen(forms.vergessen, 'submit', (e) => {
        e.preventDefault();
        const f = forms.vergessen;
        if (!check(f)) return;
        run(f, async () => {
          const r = await adapter.passwort_vergessen(value(f, 'email'));
          if (!alive) return;
          resetMail = r.email;
          for (const n of mailOut) n.textContent = r.email;
          const sent = f.querySelector('[data-sign-in-sent]');
          if (sent) {
            sent.hidden = false;
            sent.focus();
          }
        });
      });
    }
    if (forms.neu) {
      ctx.listen(forms.neu, 'submit', (e) => {
        e.preventDefault();
        const f = forms.neu;
        if (!check(f)) return;
        run(f, async () => {
          await adapter.passwort_setzen(resetMail, value(f, 'passwort'));
          if (!alive) return;
          const m = feld(forms.anmelden, 'email');
          if (m) m.value = resetMail;
          show('anmelden', false);
          for (const n of el.querySelectorAll('[data-sign-in-info]')) n.hidden = false;
          const pw = feld(forms.anmelden, 'passwort');
          if (pw) pw.focus();
        });
      });
    }

    // Switches between the forms (links to the forms' ids without script).
    ctx.listen(el, 'click', (e) => {
      const go = e.target.closest('[data-sign-in-go]');
      if (!go) return;
      const step = go.getAttribute('data-sign-in-go');
      if (!forms[step] || (step === 'neu' && !resetMail)) return;
      e.preventDefault();
      // The address typed so far goes along.
      const from = go.closest('form');
      const mail = from && feld(from, 'email') ? feld(from, 'email').value : '';
      const to = feld(forms[step], 'email');
      if (mail && to && !to.value) to.value = mail;
      for (const n of el.querySelectorAll('[data-sign-in-info]')) n.hidden = true;
      show(step);
    });
    for (const box of shows) {
      ctx.listen(box, 'change', () => {
        const pw = box.closest('form') && feld(box.closest('form'), 'passwort');
        if (pw) pw.type = box.checked ? 'text' : 'password';
      });
    }
    ctx.listen(el, 'focusout', (e) => {
      if (!e.target.getAttribute || e.target.getAttribute('aria-invalid') !== 'true') return;
      passwortOk(e.target);
      feldPruefen(e.target, passwortOk);
    });

    const modus = params.get('modus');
    show(STEPS.includes(modus) && modus !== 'neu' ? modus : BY_HASH[location.hash] || 'anmelden', false);

    ctx.onDestroy(() => {
      alive = false;
      for (const f of Object.values(forms)) {
        if (!f) continue;
        f.noValidate = false;
        f.removeAttribute('aria-busy');
        aufraeumen(f, f.querySelector('[data-formular-summe]'));
        const pw = feld(f, 'passwort');
        if (pw) pw.type = 'password';
      }
      for (const box of shows) box.checked = false;
      for (const [n, h] of hiddenBefore) n.hidden = h;
      mailOut.forEach((n, i) => {
        n.textContent = mailOutBefore[i];
      });
      waitOut.forEach((n, i) => {
        n.textContent = waitBefore[i];
      });
      el.removeAttribute('data-sign-in-state');
    });

    return {
      get state() {
        return el.getAttribute('data-sign-in-state');
      },
    };
  },
};
