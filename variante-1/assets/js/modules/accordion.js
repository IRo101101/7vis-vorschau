/**
 * accordion: questions with one open answer (IM 11.13, IS 3.6) and the info box of a product page
 * (IS 6 "pdp-info Akkordeon"). Shared by stage 4 (home page, section 6) and stage 5 (/fragen, product pages).
 *
 * Markup (every answer stands open without script):
 *   <ol data-mod="accordion" data-accordion-open="1" [data-accordion-multi="true"]>
 *     <li data-accordion-item>
 *       <h3><button type="button" id="f1" aria-expanded="true" aria-controls="a1" data-accordion-trigger>
 *         Frage <span aria-hidden="true"><span></span><span data-accordion-icon></span></span></button></h3>
 *       <div id="a1" role="region" aria-labelledby="f1" data-accordion-panel>Antwort</div>
 *     </li> …
 *   </ol>
 * data-accordion-open: number (from 1) of the item that is open at the start, 0 for none.
 * Opening: height 0 -> content height in 0.6 s (expo.out), the icon (the vertical stroke of the plus)
 * turns by 90 degrees in the same time. Only one item is open unless data-accordion-multi; a second click
 * closes. Closed panels are hidden (out of the focus order and the accessibility tree).
 * Keyboard: Enter and Space on the button; ArrowUp, ArrowDown, Home and End move between the buttons
 * (reference F14). The dimming of the other rows on hover is CSS (F14). A link to the id of a panel or
 * item opens it ("Datenblatt ansehen"). Reduced motion: no height animation, the icon jumps.
 *
 * Note (stage 5): this file replaced the stage 4 version by mistake on 20.11.2026 22:20 and was rewritten
 * for the same markup (data-accordion-open on the list, data-accordion-icon). If stage 4 restores its own
 * version, stage 5 uses only this markup and the API open(i), close(i), toggle(i), states.
 */
import { TIMING } from '../motion/curves.js';

const T = TIMING.faq;

export default {
  name: 'accordion',
  options: { open: 0, multi: false, duration: T.duration, ease: T.ease },

  setup(ctx) {
    const { el, opts, motion } = ctx;
    const rows = [...el.querySelectorAll('[data-accordion-item]')]
      .filter((item) => item.closest('[data-mod~="accordion"]') === el)
      .map((item) => ({
        item,
        button: item.querySelector('[data-accordion-trigger]'),
        panel: item.querySelector('[data-accordion-panel]'),
        icon: item.querySelector('[data-accordion-icon]'),
      }))
      .filter((r) => r.button && r.panel);
    if (!rows.length) return null;
    const g = motion.group();
    const tweens = new Map();
    const original = rows.map((r) => r.button.getAttribute('aria-expanded'));

    function setOpen(r, open, animate) {
      r.button.setAttribute('aria-expanded', open ? 'true' : 'false');
      r.item.setAttribute('data-accordion-state', open ? 'offen' : 'zu');
      for (const tw of tweens.get(r) || []) tw.kill();
      tweens.delete(r);
      const p = r.panel;
      if (!animate || ctx.reduced) {
        p.hidden = !open;
        for (const prop of ['height', 'overflow', '--akk-h']) p.style.removeProperty(prop);
        if (r.icon) motion.set(r.icon, { rotate: open ? 90 : 0 });
        return;
      }
      const from = p.hidden ? 0 : p.getBoundingClientRect().height;
      p.hidden = false;
      p.style.removeProperty('height');
      const to = open ? p.scrollHeight : 0;
      p.style.overflow = 'hidden';
      p.style.setProperty('--akk-h', String(from));
      p.style.height = 'calc(var(--akk-h) * 1px)';
      const list = [g.tween(p, { '--akk-h': to }, {
        duration: opts.duration,
        ease: opts.ease,
        onComplete: () => {
          for (const prop of ['height', 'overflow', '--akk-h']) p.style.removeProperty(prop);
          if (!open) p.hidden = true;
        },
      })];
      if (r.icon) list.push(g.tween(r.icon, { rotate: open ? 90 : 0 }, { duration: opts.duration, ease: opts.ease }));
      tweens.set(r, list);
    }

    function toggle(r, force) {
      const open = force !== undefined ? force : r.button.getAttribute('aria-expanded') !== 'true';
      if (open && !opts.multi) for (const o of rows) if (o !== r && o.button.getAttribute('aria-expanded') === 'true') setOpen(o, false, true);
      setOpen(r, open, true);
    }

    rows.forEach((r, i) => {
      if (r.panel.id) r.button.setAttribute('aria-controls', r.panel.id);
      setOpen(r, i + 1 === opts.open, false);
    });

    for (const r of rows) ctx.listen(r.button, 'click', () => toggle(r));
    ctx.listen(el, 'keydown', (e) => {
      const i = rows.findIndex((r) => r.button === document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === 'ArrowDown') j = (i + 1) % rows.length;
      else if (e.key === 'ArrowUp') j = (i - 1 + rows.length) % rows.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = rows.length - 1;
      if (j === null) return;
      e.preventDefault();
      rows[j].button.focus();
    });
    ctx.listen(document, 'click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = decodeURIComponent(a.getAttribute('href').slice(1));
      const r = rows.find((x) => x.panel.id === id || x.item.id === id);
      if (r && r.button.getAttribute('aria-expanded') !== 'true') toggle(r, true);
    });

    ctx.onDestroy(() => {
      g.kill();
      rows.forEach((r, i) => {
        r.panel.hidden = false;
        for (const prop of ['height', 'overflow', '--akk-h']) r.panel.style.removeProperty(prop);
        if (!r.panel.getAttribute('style')) r.panel.removeAttribute('style');
        if (r.icon) {
          r.icon.style.removeProperty('transform');
          if (!r.icon.getAttribute('style')) r.icon.removeAttribute('style');
        }
        if (original[i] === null) r.button.removeAttribute('aria-expanded');
        else r.button.setAttribute('aria-expanded', original[i]);
        r.item.removeAttribute('data-accordion-state');
      });
    });

    const at = (i) => rows[i];
    return {
      open: (i) => at(i) && toggle(at(i), true),
      close: (i) => at(i) && toggle(at(i), false),
      toggle: (i) => at(i) && toggle(at(i)),
      get states() {
        return rows.map((r) => r.button.getAttribute('aria-expanded') === 'true');
      },
      get state() {
        return rows.map((r) => (r.button.getAttribute('aria-expanded') === 'true' ? 'offen' : 'zu'));
      },
    };
  },
};
