/**
 * Viewport and breakpoints (IM 16). Store key 'viewport' = { w, h, bp, hover, coarse }.
 *   bp: 'd' from 992 px, 't' 768 to 991, 'ml' 480 to 767, 'm' up to 479 (same queries as the CSS).
 * Resize is debounced to 100 ms and reported only on a real change (IM 4). A width change also emits
 * 'layout:change' so split text can re-measure its lines; height-only changes (mobile URL bar) do not.
 */
import { store } from './store.js';

const Q = {
  m: '(max-width: 479px)',
  ml: '(max-width: 767px)',
  t: '(max-width: 991px)',
  hover: '(hover: hover)',
  coarse: '(pointer: coarse)',
};

function bp() {
  if (matchMedia(Q.m).matches) return 'm';
  if (matchMedia(Q.ml).matches) return 'ml';
  if (matchMedia(Q.t).matches) return 't';
  return 'd';
}

function read() {
  return {
    w: innerWidth,
    h: innerHeight,
    bp: bp(),
    hover: matchMedia(Q.hover).matches,
    coarse: matchMedia(Q.coarse).matches,
  };
}

let started = false;

export function initViewport() {
  if (started) return;
  started = true;
  let current = read();
  store.set('viewport', current);
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const next = read();
      if (next.w === current.w && next.h === current.h && next.bp === current.bp) return;
      const widthChanged = next.w !== current.w;
      current = next;
      store.set('viewport', next);
      if (widthChanged) store.emit('layout:change', { reason: 'width' });
    }, 100);
  });
}
