/**
 * figure-stand-in: DOM placeholder for the figure of spike S1 (PLAN 8 S2: "Kopplung nur über den
 * Zustandsspeicher"). It behaves towards the slider exactly as the WebGL figure is meant to:
 *
 *   reads  'slider:index'  full turn about the vertical axis (2 s, expo.inOut) in the direction of the change,
 *                          except after a drag (the drag already turned it); the label changes with a
 *                          circular wipe from (50 %, 66 %) between 0.5 s and 2.0 s (IM 13.3)
 *   reads  'slider:armed'  drag possible (grab cursor), otherwise the gesture is not even started
 *   emits  'slider:drag'   { direction } when a drag passes the thresholds of motion/drag.js (IM 13.3)
 *
 * It never touches the slider element. Markup:
 *   <div class="figur" data-mod="figure-stand-in" aria-hidden="true" data-needs-core>
 *     <div class="figur__koerper" data-figure-stand-in-body>
 *       <ol><li data-figure-stand-in-label>…01…</li> … seven labels</ol>
 *     </div>
 *   </div>
 * Reduced motion: no turning; labels switch at once; a drag still switches (direct manipulation).
 */
import { dragGesture, DRAG } from '../motion/drag.js';

export default {
  name: 'figure-stand-in',
  options: {},

  setup(ctx) {
    const { el, motion, store } = ctx;
    const body = el.querySelector('[data-figure-stand-in-body]');
    const labels = [...el.querySelectorAll('[data-figure-stand-in-label]')];
    if (!body || !labels.length) {
      ctx.warn('needs [data-figure-stand-in-body] and labels', el);
      return null;
    }
    const saved = new Map();
    const keep = (node, name) => {
      if (!saved.has(node)) saved.set(node, new Map());
      const m = saved.get(node);
      if (!m.has(name)) m.set(name, node.getAttribute(name));
    };
    const set = (node, name, value) => {
      keep(node, name);
      if (value === null) node.removeAttribute(name);
      else node.setAttribute(name, value);
    };
    for (const node of [body, ...labels]) keep(node, 'style');

    const spin = motion.group();
    const wipe = motion.group();
    let shown = -1;

    function showNow(i) {
      wipe.finish();
      shown = i;
      labels.forEach((l, k) => set(l, 'data-state', k === i ? 'on' : 'off'));
    }

    function showLabel(i) {
      wipe.finish();
      if (i === shown) return;
      if (shown < 0 || ctx.reduced) {
        showNow(i);
        return;
      }
      const old = shown;
      shown = i;
      const label = labels[i];
      set(label, 'data-state', 'in');
      motion.set(label, { '--figur-blende': 0 });
      wipe.tween(label, { '--figur-blende': 1 }, {
        delay: DRAG.label.start,
        duration: DRAG.label.end - DRAG.label.start,
        ease: DRAG.label.ease,
        onComplete: () => {
          if (labels[old] && old !== shown) set(labels[old], 'data-state', 'off');
          set(label, 'data-state', shown === i ? 'on' : 'off');
        },
      });
    }

    function turn(direction) {
      spin.kill();
      if (ctx.reduced) {
        motion.set(body, { '--figur-dreh': 0, '--figur-zieh': 0 });
        return;
      }
      const from = ((motion.get(body, '--figur-dreh') % 360) + 360) % 360;
      motion.set(body, { '--figur-dreh': from });
      // "next" turns the same way as a drag to the right (the body follows the pointer).
      spin.tween(body, { '--figur-dreh': from + 360 * direction }, {
        duration: DRAG.spin.duration,
        ease: DRAG.spin.ease,
        onComplete: () => motion.set(body, { '--figur-dreh': 0 }),
      });
    }

    function onIndex(value) {
      if (!value) {
        set(el, 'data-figure-stand-in-slider', 'none');
        return;
      }
      set(el, 'data-figure-stand-in-slider', 'present');
      const i = Math.min(labels.length - 1, Math.max(0, value.index));
      if (value.source === 'init' || value.source === 'scroll') {
        showNow(i);
        return;
      }
      if (value.source !== 'drag') turn(value.direction || 1);
      showLabel(i);
    }

    const armed = () => store.get('slider:armed') === true;
    ctx.own(dragGesture(body, {
      armed,
      onStart: () => {
        spin.kill();
        set(el, 'data-figure-stand-in-drag', 'true');
      },
      onMove: ({ angle }) => {
        if (!ctx.reduced) motion.set(body, { '--figur-zieh': angle });
      },
      onCommit: ({ direction }) => {
        set(el, 'data-figure-stand-in-drag', null);
        store.emit('slider:drag', { direction });
        if (ctx.reduced) {
          motion.set(body, { '--figur-zieh': 0 });
          return;
        }
        spin.tween(body, { '--figur-zieh': 360 * direction }, {
          duration: DRAG.commitTurn.duration,
          ease: DRAG.commitTurn.ease,
          onComplete: () => motion.set(body, { '--figur-zieh': 0 }),
        });
      },
      onCancel: () => {
        set(el, 'data-figure-stand-in-drag', null);
        spin.tween(body, { '--figur-zieh': 0 }, { duration: DRAG.springBack.duration, ease: DRAG.springBack.ease });
      },
    }));

    ctx.on('slider:index', onIndex);
    ctx.on('slider:armed', (value) => set(el, 'data-figure-stand-in-armed', value ? 'true' : 'false'));
    ctx.on('motion:reduced', (reduced) => {
      if (!reduced) return;
      spin.finish();
      wipe.finish();
      motion.set(body, { '--figur-dreh': 0, '--figur-zieh': 0 });
    });
    ctx.on('motion:settle', () => {
      spin.finish();
      wipe.finish();
    });

    set(el, 'data-figure-stand-in-armed', armed() ? 'true' : 'false');
    const initial = store.get('slider:index');
    if (initial) {
      set(el, 'data-figure-stand-in-slider', 'present');
      showNow(Math.min(labels.length - 1, Math.max(0, initial.index)));
    } else {
      set(el, 'data-figure-stand-in-slider', 'none');
      showNow(0);
    }

    ctx.onDestroy(() => {
      spin.kill();
      wipe.kill();
      motion.set(body, { '--figur-dreh': 0, '--figur-zieh': 0 });
      for (const label of labels) motion.set(label, { '--figur-blende': 0 });
      for (const [node, m] of saved) {
        for (const [name, value] of m) {
          if (value === null) node.removeAttribute(name);
          else if (name === 'style') node.style.cssText = value;
          else node.setAttribute(name, value);
        }
      }
      saved.clear();
    });

    return {
      get shown() {
        return shown;
      },
      get turning() {
        return spin.active;
      },
    };
  },
};
