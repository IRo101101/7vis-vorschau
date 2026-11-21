/**
 * scene-stand-in: DOM placeholder for the front WebGL canvas of spike S1 on the S3 probe pages.
 * It sits in the shell, fixed over the view, and behaves towards a page change as the renderer should:
 *
 *   'webgl:freeze' true      keeps its last picture (the idle turn stops)
 *   [data-transition-clip]   the router cuts it from the bottom with the edge of the reveal
 *   'transition:covered'     clears its picture (the old scene is gone)
 *   'transition:settled'     shows the scene of the new view (label chosen by the view name of 'page:in')
 *
 * Markup: <div class="szene" data-mod="scene-stand-in" data-transition-clip aria-hidden="true" data-needs-core>
 *           <div class="szene__form" data-scene-stand-in-shape>
 *             <span data-scene-stand-in-label="spike-s3-a">Szene A</span> …</div></div>
 * Reduced motion: no idle turn.
 */
const TURN_PER_SECOND = 24; // degrees; idle turn of the placeholder, visible proof of the freeze

export default {
  name: 'scene-stand-in',
  options: {},

  setup(ctx) {
    const { el, motion, store } = ctx;
    const shape = el.querySelector('[data-scene-stand-in-shape]');
    const labels = [...el.querySelectorAll('[data-scene-stand-in-label]')];
    if (!shape) return null;
    const originalStyle = shape.getAttribute('style');
    const originalState = el.getAttribute('data-scene-stand-in-state');
    const originalLabels = labels.map((l) => l.getAttribute('data-state'));
    let frozen = store.get('webgl:freeze') === true;
    let cleared = false;
    let angle = 0;
    let page = null;

    const paint = () => {
      el.setAttribute('data-scene-stand-in-state', cleared ? 'leer' : frozen ? 'eingefroren' : 'laeuft');
      for (const l of labels) l.setAttribute('data-state', l.getAttribute('data-scene-stand-in-label') === page ? 'on' : 'off');
    };

    ctx.frame((t, dt) => {
      if (frozen || cleared || ctx.reduced) return;
      angle = (angle + dt * TURN_PER_SECOND) % 360;
      motion.set(shape, { '--szene-dreh': angle });
    }, 'render');

    ctx.on('webgl:freeze', (value) => {
      frozen = value === true;
      paint();
    });
    ctx.on('transition:covered', () => {
      cleared = true;
      paint();
    });
    ctx.on('transition:settled', () => {
      cleared = false;
      paint();
    });
    ctx.on('page:in', (data) => {
      if (!data || !labels.some((l) => l.getAttribute('data-scene-stand-in-label') === data.page)) return;
      page = data.page;
      if (!frozen) paint();
    });

    const view = document.querySelector('[data-view]');
    page = view ? view.getAttribute('data-view') : null;
    paint();

    ctx.onDestroy(() => {
      motion.set(shape, { '--szene-dreh': 0 });
      if (originalStyle === null) shape.removeAttribute('style');
      else shape.style.cssText = originalStyle;
      if (originalState === null) el.removeAttribute('data-scene-stand-in-state');
      else el.setAttribute('data-scene-stand-in-state', originalState);
      labels.forEach((l, i) => (originalLabels[i] === null ? l.removeAttribute('data-state') : l.setAttribute('data-state', originalLabels[i])));
    });

    return {
      get state() {
        return el.getAttribute('data-scene-stand-in-state');
      },
      get page() {
        return page;
      },
    };
  },
};
