/**
 * gl-pruefung: review tool of the S1 probe page (spike S1). Not part of delivered pages.
 * Works next to theme-picker in the same <details> form and talks to the WebGL layer only through the
 * store, plus the webgl module's API for the read-out:
 *   name="stufe"           auto | statisch | einfach | voll   -> 'webgl:level-pin' (auto = null, guard on)
 *   name="einfrieren"      checkbox                          -> 'webgl:freeze'
 *   name="fuehrung"        checkbox                          -> 'scroll:guide'
 *   [data-gl-action="verlust"]       context loss, restore after a pause      -> 'webgl:probe'
 *   [data-gl-action="seitenwechsel"] freeze, leave, swap the view for a fresh copy, mount, enter, thaw:
 *                                    the sequence of spike S3 without the reveal, to watch disposal
 *   <output data-gl-anzeige>         level, frame time, active scenes (twice a second)
 */
import { core } from '../core/core.js';
import { wait } from '../core/dom.js';

const LOSS_PAUSE_MS = 1500;
const READOUT_MS = 500;

/** Freeze, leave, swap [data-view] for a clean copy, mount, enter, thaw. Resolves when done. */
export async function rehearseViewSwap(store) {
  store.set('webgl:freeze', true);
  await core.leaveView();
  const old = document.querySelector('[data-view]');
  core.unmountView();
  const fresh = old.cloneNode(true);
  // A fetched page would arrive without runtime state: drop what the old view still carries.
  for (const node of fresh.querySelectorAll('[data-guard="free"]')) node.setAttribute('data-guard', '');
  for (const node of fresh.querySelectorAll('[data-scene-live]')) node.removeAttribute('data-scene-live');
  old.replaceWith(fresh);
  await core.mountView(fresh);
  core.enterView();
  store.set('webgl:freeze', false);
}

export default {
  name: 'gl-pruefung',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const form = el.querySelector('form');
    if (!form) return null;
    const out = el.querySelector('[data-gl-anzeige]');
    let busy = false;

    const sync = () => {
      const pin = store.get('webgl:level-pin') || 'auto';
      for (const input of form.querySelectorAll('input[name="stufe"]')) input.checked = input.value === pin;
      const freeze = form.querySelector('input[name="einfrieren"]');
      if (freeze) freeze.checked = store.get('webgl:freeze') === true;
      const guide = form.querySelector('input[name="fuehrung"]');
      if (guide) guide.checked = store.get('scroll:guide') !== false;
    };
    sync();

    ctx.listen(form, 'change', (event) => {
      const input = event.target;
      if (input.name === 'stufe') store.set('webgl:level-pin', input.value === 'auto' ? null : input.value);
      if (input.name === 'einfrieren') store.set('webgl:freeze', input.checked);
      if (input.name === 'fuehrung') store.set('scroll:guide', input.checked);
    });
    ctx.listen(form, 'click', async (event) => {
      const button = event.target.closest('button[data-gl-action]');
      if (!button || busy) return;
      busy = true;
      button.disabled = true;
      try {
        const action = button.getAttribute('data-gl-action');
        if (action === 'verlust') {
          store.emit('webgl:probe', 'lose');
          await wait(LOSS_PAUSE_MS);
          store.emit('webgl:probe', 'restore');
        }
        if (action === 'seitenwechsel') await rehearseViewSwap(store);
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
    ctx.on('webgl:level-pin', sync);
    ctx.on('webgl:freeze', sync);
    ctx.on('scroll:guide', sync);

    if (out) {
      const shell = document.querySelector('[data-mod~="webgl"]');
      const render = () => {
        const api = shell ? core.modules.api(shell, 'webgl') : null;
        const s = api ? api.stats() : null;
        if (!s) {
          out.value = 'WebGL-Schicht fehlt';
          return;
        }
        const w = s.world;
        const parts = [`Stufe ${s.level}`, `Zustand ${s.state}`];
        if (w) {
          parts.push(w.ticking ? `${w.frameMs.median ?? '?'} ms je Bild` : 'Bildschleife ruht');
          parts.push(`${w.scenes.filter((x) => x.live).length} von ${w.scenes.length} Szenen im Bild`);
        }
        out.value = parts.join(' · ');
      };
      render();
      const timer = setInterval(render, READOUT_MS);
      ctx.own(() => clearInterval(timer));
    }
    return { sync };
  },
};
