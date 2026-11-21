/**
 * enquiry: dealer enquiry (/haendler, IS 3.5, PLAN 5 no. 47) and contact form (/kontakt, IS 3.6, IS 10).
 *
 * Markup: a real form (POST to its own page for the PHP shop) with fields as in shop/formular.js, an error
 * summary [data-formular-summe] with [data-formular-liste], a submit button with [data-enquiry-label=
 * "bereit|laedt"] and a result block [data-enquiry-done] (role=status, hidden). Option data-enquiry-art
 * names the kind for the adapter ('haendler' | 'kontakt').
 * With the runtime: own messages instead of the browser's, the adapter's anfrage(art, felder) is called and
 * the result block says, as a study, that nothing was sent (PLAN 5 no. 48: "in der Studie ohne Versand").
 * The contact form takes its subject from ?betreff= (the Pucker page links with "Pucker").
 */
import { adapter } from '../shop/muster.js';
import { pruefen, feldPruefen, zusammenfassung, aufraeumen, werte } from '../shop/formular.js';

export default {
  name: 'enquiry',
  options: { art: 'kontakt' },

  setup(ctx) {
    const { el, opts } = ctx;
    const form = el.tagName === 'FORM' ? el : el.querySelector('form');
    if (!form) return null;
    const summary = el.querySelector('[data-formular-summe]');
    const done = el.querySelector('[data-enquiry-done]');
    const labels = [...form.querySelectorAll('[data-enquiry-label]')];
    const submit = form.querySelector('[type="submit"]');
    const subject = form.querySelector('[name="betreff"]');
    const subjectBefore = subject ? subject.value : null;
    let busy = false;
    let alive = true;

    const p = new URLSearchParams(location.search).get('betreff');
    if (subject && p && !subject.value) subject.value = p.slice(0, 120);

    form.noValidate = true;
    const label = (state) => {
      for (const l of labels) l.hidden = l.getAttribute('data-enquiry-label') !== state;
      if (submit) {
        if (state === 'laedt') submit.setAttribute('aria-busy', 'true');
        else submit.removeAttribute('aria-busy');
      }
    };
    label('bereit');

    ctx.listen(form, 'focusout', (e) => {
      if (e.target.getAttribute('aria-invalid') === 'true') feldPruefen(e.target);
    });
    ctx.listen(form, 'submit', async (e) => {
      e.preventDefault();
      if (busy) return;
      const wrong = pruefen(form);
      zusammenfassung(summary, wrong);
      if (wrong.length) {
        (summary || wrong[0]).focus();
        return;
      }
      busy = true;
      label('laedt');
      try {
        await adapter.anfrage(opts.art, werte(form));
        if (!alive) return;
        if (done) {
          done.hidden = false;
          done.focus();
        }
        form.hidden = true;
      } catch (err) {
        if (summary) {
          zusammenfassung(summary, []);
        }
        const fail = el.querySelector('[data-enquiry-fail]');
        if (fail) fail.hidden = false;
      } finally {
        busy = false;
        if (alive) label('bereit');
      }
    });

    ctx.onDestroy(() => {
      alive = false;
      form.noValidate = false;
      form.hidden = false;
      aufraeumen(form, summary);
      if (done) done.hidden = true;
      const fail = el.querySelector('[data-enquiry-fail]');
      if (fail) fail.hidden = true;
      for (const l of labels) l.hidden = l.getAttribute('data-enquiry-label') !== 'bereit';
      if (submit) submit.removeAttribute('aria-busy');
      if (subject) subject.value = subjectBefore;
    });

    return {
      get busy() {
        return busy;
      },
    };
  },
};
