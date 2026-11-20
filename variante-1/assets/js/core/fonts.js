/**
 * Font readiness (IM 10: lines are formed after fonts are ready plus one frame).
 * Every finished font load emits 'layout:change' so split text re-measures (fonts of a CI that was just
 * switched on load late). fontsSettled() never waits longer than its limit (PLAN 7: time limit).
 */
import { store } from './store.js';

let started = false;

export function initFonts() {
  if (started || !document.fonts) return;
  started = true;
  document.fonts.addEventListener('loadingdone', () => store.emit('layout:change', { reason: 'fonts' }));
}

export async function fontsSettled(limitMs = 3000) {
  if (!document.fonts) return true;
  let timer = 0;
  const limit = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), limitMs);
  });
  const ok = await Promise.race([document.fonts.ready.then(() => true), limit]);
  clearTimeout(timer);
  store.set('fonts:ready', true);
  return ok;
}
