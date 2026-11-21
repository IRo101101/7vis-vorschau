/**
 * theme-picker: review tool of the probe pages. Not part of delivered pages.
 * Forces reduced motion at runtime, replays all entrances and rehearses a page change (page-out queue,
 * pause, page-in queue). Switches the CI (data-ci on <html>) when the form offers a choice
 * (radio inputs name="ci"); with rohbau as the only CI the pages offer none. The choice returns with a CI
 * theme (CONTRACT 4.6). Initial CI: ?ci=<name> in the URL, else the last choice of this browser
 * (localStorage, optional); names outside core.CIS are ignored.
 */
import { core } from '../../../assets/js/core/core.js';

const KEY = 'v1.probe.ci';

function remember(value) {
  try {
    localStorage.setItem(KEY, value);
  } catch (err) {
    /* storage unavailable: the choice is simply not remembered */
  }
}

function recall() {
  try {
    return localStorage.getItem(KEY);
  } catch (err) {
    return null;
  }
}

export default {
  name: 'theme-picker',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const form = el.querySelector('form');
    if (!form) return null;

    const sync = () => {
      const ci = core.currentCI();
      for (const input of form.querySelectorAll('input[name="ci"]')) input.checked = input.value === ci;
    };

    const fromUrl = new URLSearchParams(location.search).get('ci');
    const initial = [fromUrl, recall()].find((v) => v && core.CIS.includes(v));
    if (initial) core.setCI(initial);
    sync();

    ctx.listen(form, 'change', (event) => {
      const input = event.target;
      if (input.name === 'ci') {
        core.setCI(input.value);
        remember(input.value);
      } else if (input.name === 'bewegung') {
        core.setMotionOverride(input.value === 'reduziert' ? 'reduced' : null);
      }
    });
    ctx.listen(form, 'submit', (event) => event.preventDefault());
    ctx.listen(form, 'click', (event) => {
      const button = event.target.closest('button[data-picker-action]');
      if (!button) return;
      const action = button.getAttribute('data-picker-action');
      if (action === 'replay') store.emit('motion:replay');
      if (action === 'seitenwechsel') {
        button.disabled = true;
        core.rehearsePageChange().finally(() => {
          button.disabled = false;
        });
      }
    });
    ctx.on('ci', sync);
    return { sync };
  },
};
