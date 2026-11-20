/**
 * Reduced motion, stricter rule of the design system (W 05, PLAN 7): when active, only colour changes remain.
 * Follows the system setting at runtime (unlike the reference, IM 17) and an optional review override.
 *
 * Effective state: store 'motion:reduced' (boolean) and <html data-motion="reduced|full"> for CSS.
 * The engine finishes running tweens, Lenis is removed, modules jump to their end states.
 */
import { store } from './store.js';

let mq = null;
let override = null;

function update() {
  const reduced = Boolean((mq && mq.matches) || override === 'reduced');
  document.documentElement.setAttribute('data-motion', reduced ? 'reduced' : 'full');
  store.set('motion:reduced', reduced);
}

export function initReduced() {
  if (mq) return;
  mq = matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', update);
  update();
}

/** Review override: 'reduced' forces reduced motion, null follows the system again. */
export function setMotionOverride(value) {
  override = value === 'reduced' ? 'reduced' : null;
  update();
}

export function isReduced() {
  return store.get('motion:reduced') === true;
}
