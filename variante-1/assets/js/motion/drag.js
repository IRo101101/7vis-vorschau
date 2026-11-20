/**
 * Drag gesture on the figure (IM 13.3 "Ziehen", PLAN 5 no. 20, spike S2).
 *
 * DRAG is the value table of the gesture and of the figure's answer to a slider change. It is used by the
 * DOM stand-in of the figure (modules/figure-stand-in.js) and is meant for the WebGL figure of spike S1,
 * so both switch the slider with the same thresholds. All times in seconds, distances in CSS px.
 *
 *   const off = dragGesture(el, { armed, hit, onStart, onMove, onCommit, onCancel })
 *
 * - armed(): checked at pointer down and again at release (the slider publishes 'slider:armed').
 * - hit(event): optional hit test (the WebGL figure tests an invisible cylinder, IM 13.3); default: always.
 * - The gesture counts from DRAG.startPx horizontal travel; vertical travel first cancels it, so the page
 *   keeps scrolling (the element carries touch-action: pan-y).
 * - Release commits when the travel exceeds DRAG.commitPx, or on a flick (speed above DRAG.flickSpeed px/ms
 *   with at least DRAG.flickPx travel). onCommit gets { direction: +1 | -1, dx, speed }; dragging to the
 *   left (dx < 0) means "next" (+1).
 * - After more than DRAG.swallowClickPx travel the following click on the element is swallowed.
 * Returns a function that removes every listener.
 */
export const DRAG = Object.freeze({
  startPx: 10,
  commitPx: 120,
  flickSpeed: 0.5,
  flickPx: 30,
  swallowClickPx: 5,
  // Rotation while dragging: turnDeg x tanh(dx / turnPx).
  turnDeg: 28,
  turnPx: 300,
  // Speed window for the flick (ms of the latest pointer samples).
  speedWindowMs: 100,
  // Answer of the figure to a slider change: full turn about the vertical axis (IM 13.3 "Produktwechsel").
  spin: Object.freeze({ duration: 2, ease: 'expo.inOut' }),
  // Label and colours change between 0.5 s and 2.0 s with a circular wipe from (50 %, 66 %) (IM 13.3).
  label: Object.freeze({ start: 0.5, end: 2, ease: 'expo.inOut', originX: 50, originY: 66 }),
  // After a committed drag the figure runs damped onto a full turn; otherwise it springs back. The
  // inventory names no values for either; own values, default tween of IM 6 (expo.out).
  commitTurn: Object.freeze({ duration: 1.2, ease: 'expo.out' }),
  springBack: Object.freeze({ duration: 0.6, ease: 'expo.out' }),
});

/** Rotation in degrees for a horizontal travel of dx px while dragging. */
export function dragAngle(dx) {
  return DRAG.turnDeg * Math.tanh(dx / DRAG.turnPx);
}

export function dragGesture(el, { armed = () => true, hit = () => true, onStart, onMove, onCommit, onCancel } = {}) {
  let g = null;
  let swallow = false;

  const reset = () => {
    if (g && g.captured && el.hasPointerCapture && el.hasPointerCapture(g.id)) {
      try {
        el.releasePointerCapture(g.id);
      } catch (err) {
        /* capture already gone */
      }
    }
    g = null;
  };

  function speedOf(now, x) {
    const samples = g.samples;
    let ref = samples[0];
    for (let i = samples.length - 1; i >= 0; i -= 1) {
      if (now - samples[i].t >= DRAG.speedWindowMs) {
        ref = samples[i];
        break;
      }
      ref = samples[i];
    }
    const dt = Math.max(1, now - ref.t);
    return Math.abs(x - ref.x) / dt;
  }

  function down(event) {
    if (g) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!event.isPrimary) return;
    swallow = false;
    if (!armed() || !hit(event)) return;
    g = { id: event.pointerId, x0: event.clientX, y0: event.clientY, dx: 0, started: false, captured: false, travel: 0, samples: [{ x: event.clientX, t: event.timeStamp }] };
  }

  function move(event) {
    if (!g || event.pointerId !== g.id) return;
    const dx = event.clientX - g.x0;
    const dy = event.clientY - g.y0;
    g.travel = Math.max(g.travel, Math.hypot(dx, dy));
    g.samples.push({ x: event.clientX, t: event.timeStamp });
    if (g.samples.length > 24) g.samples.shift();
    if (!g.started) {
      if (Math.abs(dy) >= DRAG.startPx && Math.abs(dy) > Math.abs(dx)) {
        reset();
        return;
      }
      if (Math.abs(dx) < DRAG.startPx) return;
      g.started = true;
      try {
        el.setPointerCapture(g.id);
        g.captured = true;
      } catch (err) {
        /* synthetic events without an active pointer: the element still receives them */
      }
      if (onStart) onStart({ dx });
    }
    g.dx = dx;
    if (event.cancelable) event.preventDefault();
    if (onMove) onMove({ dx, angle: dragAngle(dx) });
  }

  function up(event) {
    if (!g || event.pointerId !== g.id) return;
    const { started, dx, travel } = g;
    const speed = speedOf(event.timeStamp, event.clientX);
    if (travel > DRAG.swallowClickPx) swallow = true;
    reset();
    if (!started) return;
    const passed = Math.abs(dx) > DRAG.commitPx || (speed > DRAG.flickSpeed && Math.abs(dx) > DRAG.flickPx);
    if (passed && armed()) {
      if (onCommit) onCommit({ direction: dx < 0 ? 1 : -1, dx, speed });
    } else if (onCancel) {
      onCancel({ dx, speed });
    }
  }

  function cancel(event) {
    if (!g || (event && event.pointerId !== g.id)) return;
    const started = g.started;
    const dx = g.dx;
    reset();
    if (started && onCancel) onCancel({ dx, speed: 0 });
  }

  function click(event) {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopPropagation();
  }

  const noDrag = (event) => event.preventDefault();

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('lostpointercapture', cancel);
  el.addEventListener('click', click, true);
  el.addEventListener('dragstart', noDrag);

  return () => {
    reset();
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
    el.removeEventListener('lostpointercapture', cancel);
    el.removeEventListener('click', click, true);
    el.removeEventListener('dragstart', noDrag);
  };
}
