/**
 * webgl: the WebGL layer of the shell (spike S1, PLAN 5 no. 28, IM 13.1). Lives on the element that holds
 * the two layer canvases, outside [data-view], so it survives page changes.
 *
 *   <div class="gl-ebenen" data-mod="webgl" aria-hidden="true" data-needs-core>
 *     <canvas class="gl-ebene gl-ebene--hinten" data-gl-layer="hinten"></canvas>
 *     <canvas class="gl-ebene gl-ebene--vorn" data-gl-layer="vorn"></canvas>
 *   </div>
 *
 * Decides the level (gl/level.js) and owns the world (gl/world.js, which imports three.js on demand):
 *   - no WebGL 2, reduced motion, or the guard gave up: level 'statisch', world disposed (three.js is not
 *     even loaded when this is clear at start), still images and CSS surfaces carry the page;
 *   - otherwise 'einfach' or 'voll'; loading starts after the first frame (PLAN 7: scenes load after the
 *     first view), scenes are precompiled before they draw.
 *   - only on a page with a scene (CONTRACT line 8, stage 7): while the live document has no [data-scene]
 *     (outside a frozen copy), three.js, the world and the scenes are not loaded at all ('ruht'); a page
 *     change to a page with a scene loads them then. A world that exists stays for the rest of the visit.
 * <html data-webgl="aus|statisch|ruht|laedt|live|verloren"> mirrors the state for CSS and tests.
 *
 * Store keys (CONTRACT 7): reads 'webgl:freeze', 'webgl:level-pin', 'webgl:probe', 'motion:reduced',
 * 'viewport', 'page:in'; writes 'webgl:level', 'webgl:progress', 'webgl:ready', 'webgl:lost'.
 * API (review tool, tests): stats(), world (or null), level, state.
 */
import { startLevel, minLevel, lower, LEVELS } from '../gl/level.js';
import { frame } from '../core/frame.js';
import { clock } from '../core/clock.js';

let webgl2Cache = null;

/** A scene marker in the live document (a frozen copy of the old view does not count). */
function hasScene() {
  for (const n of document.querySelectorAll('[data-scene]')) if (!n.closest('[data-standbild]')) return true;
  return false;
}

/** WebGL 2 present? Cheap probe on a throw-away canvas, its context released right away. */
export function hasWebGL2() {
  if (webgl2Cache !== null) return webgl2Cache;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    webgl2Cache = !!gl;
    const ext = gl && gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  } catch (err) {
    webgl2Cache = false;
  }
  return webgl2Cache;
}

export default {
  name: 'webgl',
  options: {},

  setup(ctx) {
    const { el, store, visibility } = ctx;
    const html = document.documentElement;
    const front = el.querySelector('[data-gl-layer="vorn"]');
    const back = el.querySelector('[data-gl-layer="hinten"]');
    if (!front || !back) {
      ctx.warn('two canvases [data-gl-layer="vorn|hinten"] are required');
      return null;
    }

    const webgl2 = hasWebGL2();
    let world = null;
    let loading = null;
    let cap = 'voll';
    let state = '';
    let level = 'statisch';
    let destroyed = false;
    let mounted = false;
    let touched = false;

    const setState = (next) => {
      if (state === next) return;
      state = next;
      html.setAttribute('data-webgl', next);
    };

    function target() {
      const pin = store.get('webgl:level-pin');
      const start = startLevel({ webgl2, reduced: ctx.reduced, viewport: store.get('viewport') });
      if (start === 'statisch') return 'statisch';
      if (LEVELS.includes(pin)) return pin;
      return minLevel(start, cap);
    }

    function teardown() {
      if (world) {
        world.dispose();
        world = null;
      }
      store.set('webgl:ready', false);
    }

    async function load() {
      if (loading) return loading;
      setState('laedt');
      store.set('webgl:progress', 0.1);
      loading = (async () => {
        const { World } = await import('../gl/world.js');
        store.set('webgl:progress', 0.5);
        return World;
      })();
      try {
        return await loading;
      } catch (err) {
        loading = null;
        throw err;
      }
    }

    async function ensureWorld() {
      if (world) return world;
      const World = await load();
      if (destroyed || world || level === 'statisch') return world;
      const w = new World({ front, back, store, frame, visibility, clock });
      try {
        w.init();
      } catch (err) {
        ctx.warn('WebGL could not start, still images stay', err);
        setState('statisch');
        store.set('webgl:level', 'statisch');
        return null;
      }
      world = w;
      w.onSlow = (medianMs) => {
        if (LEVELS.includes(store.get('webgl:level-pin'))) return;
        cap = lower(level);
        ctx.warn(`frames too slow (median ${Math.round(medianMs)} ms), level down to "${cap}"`);
        decide();
      };
      w.onState = (s) => {
        store.set('webgl:lost', s === 'verloren');
        setState(s === 'verloren' ? 'verloren' : 'live');
      };
      w.setLevel(level);
      if (touched) w.setTouch(true);
      store.set('webgl:progress', 0.8);
      await w.scan();
      if (world !== w) return world;
      store.set('webgl:progress', 1);
      setState('live');
      store.set('webgl:ready', true);
      if (store.get('webgl:freeze')) w.freeze(true);
      return w;
    }

    function decide() {
      if (destroyed || !mounted) return;
      const next = target();
      level = next;
      store.set('webgl:level', next);
      if (next === 'statisch') {
        teardown();
        setState(webgl2 ? 'statisch' : 'aus');
        return;
      }
      if (world) {
        world.setLevel(next);
        return;
      }
      if (!hasScene()) {
        // Nothing to draw: three.js stays unloaded until a page with a scene comes (page:in).
        if (!loading) setState('ruht');
        return;
      }
      ensureWorld().catch((err) => {
        ctx.warn('WebGL layer failed to load, still images stay', err);
        loading = null;
        teardown();
        setState('statisch');
      });
    }

    // Expected path known at once: announce loading before the first frame so the still does not flash.
    setState(target() === 'statisch' ? (webgl2 ? 'statisch' : 'aus') : hasScene() ? 'laedt' : 'ruht');
    store.set('webgl:lost', false);

    ctx.onMount(() => {
      // PLAN 7: text first, scenes after the first view.
      frame.next().then(() => {
        mounted = true;
        decide();
      });
    });
    // First touch: the page scrolls natively on the compositor, back-layer scenes step aside for good.
    ctx.listen(window, 'touchstart', () => {
      if (touched) return;
      touched = true;
      if (world) world.setTouch(true);
    }, { passive: true });
    ctx.on('motion:reduced', decide);
    ctx.on('webgl:level-pin', (pin) => {
      if (pin === null || pin === undefined) cap = 'voll';
      decide();
    });
    ctx.on('viewport', () => decide());
    ctx.on('webgl:freeze', (on) => {
      if (world) world.freeze(on);
    });
    ctx.on('page:in', () => {
      if (world && !world.frozen) world.scan();
      else if (!world && hasScene()) decide();
    });
    // Review aid: 'webgl:probe' events rehearse a context loss ('lose', 'restore').
    ctx.on('webgl:probe', (what) => {
      if (!world) return;
      if (what === 'lose') world.loseContext();
      if (what === 'restore') world.restoreContext();
    });
    ctx.onDestroy(() => {
      destroyed = true;
      teardown();
      html.removeAttribute('data-webgl');
    });

    return {
      get world() {
        return world;
      },
      get level() {
        return level;
      },
      get state() {
        return state;
      },
      stats() {
        return { state, level, cap, webgl2, world: world ? world.stats() : null };
      },
    };
  },
};
