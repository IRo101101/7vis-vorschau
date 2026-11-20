/**
 * figure-grip: the drag handle of the WebGL figure (IM 13.3 "Ziehen", PLAN 5 no. 20, spike S2, stage 3).
 *
 * The reference tests an invisible cylinder around the can and shows a grab hand over it (refmedia v1 W6).
 * Here a transparent round element of the shell follows the screen circle that the figure publishes
 * ('figur:rahmen'), so pointer, touch and cursor work natively and the page around it keeps every click.
 *   <div class="figur-griff" data-mod="figure-grip" aria-hidden="true" data-needs-core></div>
 *
 * Store (CONTRACT 7), no other coupling:
 *   reads  'figur:rahmen'   { x, y, r } in CSS px of the viewport, or null: where the figure is
 *   reads  'slider:armed'   the grip takes the pointer only while the slider allows a drag (slider mode, no
 *                           lock, slider covers the view); otherwise it lets every event through
 *   writes 'figur:ziehen'   { phase: 'start'|'move'|'commit'|'cancel', dx, direction, seq }: the figure turns
 *                           with the drag (28 deg x tanh(dx / 300 px)), runs onto a full turn on commit and
 *                           springs back on cancel
 *   emits  'slider:drag'    { direction } when the gesture passes the thresholds of motion/drag.js; dragging
 *                           to the right is "next", to the left "previous" (as the reference, W6)
 * While dragging <html data-figur-zieht> shows the closed hand everywhere and stops text selection (IM 14).
 * Keyboard users switch with the tabs; the grip is aria-hidden and never focusable.
 */
import { dragGesture } from '../motion/drag.js';

export default {
  name: 'figure-grip',
  options: {},

  setup(ctx) {
    const { el, store } = ctx;
    const html = document.documentElement;
    let seq = 0;
    let rahmen = null;

    const armed = () => store.get('slider:armed') === true && !!rahmen;

    function place() {
      if (!rahmen) {
        el.removeAttribute('data-figure-grip');
        return;
      }
      const d = Math.max(0, Math.round(rahmen.r * 2));
      el.style.width = `${d}px`;
      el.style.height = `${d}px`;
      el.style.transform = `translate3d(${Math.round(rahmen.x - d / 2)}px, ${Math.round(rahmen.y - d / 2)}px, 0)`;
      el.setAttribute('data-figure-grip', armed() ? 'bereit' : 'ruht');
    }

    function send(phase, extra = {}) {
      seq += 1;
      store.set('figur:ziehen', Object.freeze({ phase, dx: 0, direction: 0, seq, ...extra }));
    }

    ctx.own(dragGesture(el, {
      armed,
      onStart: ({ dx }) => {
        html.setAttribute('data-figur-zieht', '');
        send('start', { dx });
      },
      onMove: ({ dx }) => send('move', { dx }),
      onCommit: ({ direction, dx }) => {
        html.removeAttribute('data-figur-zieht');
        store.emit('slider:drag', { direction });
        send('commit', { dx, direction });
      },
      onCancel: ({ dx }) => {
        html.removeAttribute('data-figur-zieht');
        send('cancel', { dx });
      },
    }));

    ctx.on('figur:rahmen', (value) => {
      rahmen = value || null;
      place();
    });
    ctx.on('slider:armed', place);
    rahmen = store.get('figur:rahmen') || null;
    place();

    ctx.onDestroy(() => {
      html.removeAttribute('data-figur-zieht');
      el.removeAttribute('data-figure-grip');
      el.style.removeProperty('width');
      el.style.removeProperty('height');
      el.style.removeProperty('transform');
    });

    return {
      get rahmen() {
        return rahmen;
      },
      get ready() {
        return armed();
      },
    };
  },
};
