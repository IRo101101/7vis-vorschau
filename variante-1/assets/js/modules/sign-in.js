/**
 * sign-in: /anmelden, sign in or open an account in one flow (refmedia v1 section 6, F24: e-mail, then a
 * one-time code; sign-in and sign-up are the same flow; guests can still order).
 *
 * Markup: two forms, [data-sign-in-step="email"] and [data-sign-in-step="code"] (the second hidden), each
 * with fields as in shop/formular.js, [data-sign-in-mail] (the address in the code step),
 * [data-sign-in-new="true|false"] texts for a new or a known address, [data-sign-in-again] (send again),
 * [data-sign-in-back] (other address), [data-sign-in-done] (role=status) and [data-sign-in-fail].
 * Study: nothing is sent; any six digits pass (the sample adapter checks only the format). The decision E4
 * of the shop (password login with a 90-day session) and this flow differ; see ETAPPE-5 open points.
 * After signing in the browser goes on with the router to ?weiter= (kasse | konto, default konto).
 * ?email= fills the address (offer on the confirmation page).
 */
import { adapter } from '../shop/muster.js';
import { pruefen, feldPruefen, zusammenfassung, aufraeumen } from '../shop/formular.js';

const ZIELE = { kasse: 'kasse.html', konto: 'konto.html' };

export default {
  name: 'sign-in',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const step1 = el.querySelector('[data-sign-in-step="email"]');
    const step2 = el.querySelector('[data-sign-in-step="code"]');
    if (!step1 || !step2) return null;
    const mail = step1.querySelector('input[type="email"]');
    const code = step2.querySelector('input[name="code"]');
    const hiddenBefore = new Map([...el.querySelectorAll('*')].map((n) => [n, n.hidden]));
    const mailOut = [...el.querySelectorAll('[data-sign-in-mail]')];
    const mailOutBefore = mailOut.map((n) => n.textContent);
    const params = new URLSearchParams(location.search);
    const weiter = ZIELE[params.get('weiter')] || ZIELE.konto;
    let email = '';
    let alive = true;
    let busy = false;

    for (const f of [step1, step2]) f.noValidate = true;
    if (params.get('email') && mail && !mail.value) mail.value = params.get('email').slice(0, 200);
    for (const a of el.querySelectorAll('[data-sign-in-guest]')) a.hidden = params.get('weiter') !== 'kasse';

    const show = (n) => {
      step1.hidden = n !== 1;
      step2.hidden = n !== 2;
      el.setAttribute('data-sign-in-state', n === 1 ? 'email' : 'code');
    };
    const fail = (on) => {
      for (const f of el.querySelectorAll('[data-sign-in-fail]')) f.hidden = !on;
    };

    ctx.listen(step1, 'submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      fail(false);
      const wrong = pruefen(step1);
      zusammenfassung(step1.querySelector('[data-formular-summe]'), wrong);
      if (wrong.length) {
        wrong[0].focus();
        return;
      }
      busy = true;
      step1.setAttribute('aria-busy', 'true');
      try {
        const r = await adapter.anmelden_start(mail.value);
        if (!alive) return;
        email = r.email;
        for (const n of mailOut) n.textContent = email;
        for (const n of el.querySelectorAll('[data-sign-in-new]')) n.hidden = n.getAttribute('data-sign-in-new') !== String(r.neu);
        show(2);
        code.value = '';
        code.focus();
      } catch (err) {
        if (err && err.code === 'ungueltig') {
          mail.setAttribute('aria-invalid', 'true');
          feldPruefen(mail, () => false);
          mail.focus();
        } else fail(true);
      } finally {
        busy = false;
        step1.removeAttribute('aria-busy');
      }
    });

    ctx.listen(step2, 'submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      fail(false);
      const okFormat = /^\d{6}$/.test(code.value.trim());
      feldPruefen(code, () => okFormat);
      if (!okFormat) {
        code.focus();
        return;
      }
      busy = true;
      step2.setAttribute('aria-busy', 'true');
      try {
        const r = await adapter.anmelden_code(email, code.value.trim());
        if (!alive) return;
        for (const n of el.querySelectorAll('[data-sign-in-done]')) {
          n.hidden = false;
          for (const t of n.querySelectorAll('[data-sign-in-done-new]')) t.hidden = t.getAttribute('data-sign-in-done-new') !== String(r.neu);
        }
        step2.hidden = true;
        el.setAttribute('data-sign-in-state', 'fertig');
        store.emit('router:go', { href: weiter });
      } catch (err) {
        if (err && err.code === 'ungueltig') {
          feldPruefen(code, () => false);
          code.focus();
        } else fail(true);
      } finally {
        busy = false;
        step2.removeAttribute('aria-busy');
      }
    });

    ctx.listen(el, 'click', async (e) => {
      if (e.target.closest('[data-sign-in-back]')) {
        e.preventDefault();
        show(1);
        mail.focus();
        return;
      }
      if (e.target.closest('[data-sign-in-again]')) {
        e.preventDefault();
        await adapter.anmelden_start(email).catch(() => {});
        if (!alive) return;
        for (const n of el.querySelectorAll('[data-sign-in-sent]')) n.hidden = false;
        code.focus();
      }
    });
    ctx.listen(code, 'input', () => {
      // Digits only, at most six (paste of "123 456" works).
      const v = code.value.replace(/\D/g, '').slice(0, 6);
      if (v !== code.value) code.value = v;
      if (code.getAttribute('aria-invalid') === 'true' && v.length === 6) feldPruefen(code, () => true);
    });

    show(1);

    ctx.onDestroy(() => {
      alive = false;
      for (const f of [step1, step2]) {
        f.noValidate = false;
        f.removeAttribute('aria-busy');
        aufraeumen(f, f.querySelector('[data-formular-summe]'));
      }
      for (const [n, h] of hiddenBefore) n.hidden = h;
      mailOut.forEach((n, i) => {
        n.textContent = mailOutBefore[i];
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
