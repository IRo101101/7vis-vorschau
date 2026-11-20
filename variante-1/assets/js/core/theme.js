/**
 * CI selection (PLAN 7, CONTRACT 4). The CI is an attribute on <html>: data-ci="rohbau".
 * Rohbau is the only CI (owner's decision of 20.11.2026); the mechanism stays so that the corporate identity
 * can be laid over later as one more theme file: add its name to CIS and link the file on the pages.
 * Sections carry their own data-theme="hell|invers"; that attribute never depends on the CI.
 * After a switch the layout changes (other fonts, sizes, spacing): 'layout:change' is emitted at once and
 * again when the new fonts have loaded, so split text and fitted titles re-measure.
 */
import { store } from './store.js';
import { frame } from './frame.js';
import { fontsSettled } from './fonts.js';

export const CIS = Object.freeze(['rohbau']);

export function currentCI() {
  return document.documentElement.getAttribute('data-ci') || 'rohbau';
}

export function setCI(name) {
  if (!CIS.includes(name)) return false;
  const html = document.documentElement;
  if (html.getAttribute('data-ci') === name) return true;
  html.setAttribute('data-ci', name);
  store.set('ci', name);
  store.emit('layout:change', { reason: 'ci' });
  frame
    .next()
    .then(() => fontsSettled(3000))
    .then(() => store.emit('layout:change', { reason: 'ci-fonts' }));
  return true;
}
