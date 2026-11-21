/**
 * Runtime core (IM 4, PLAN 7): boots the services, starts modules from markup, runs the page queues,
 * watches late markup, and offers the view lifecycle that the page transition (spike S3) builds on.
 *
 * Boot order:
 *   1. reduced motion, viewport, fonts, frame loop, motion engine, smooth scrolling
 *   2. shell page (outside [data-view]) and view page ([data-view]); start modules, run mount queues,
 *      release guards
 *   3. intro: if an element carries data-intro-owner, its module sets 'intro:done' (time limit
 *      INTRO_LIMIT_MS); otherwise the core sets it after fonts are ready plus one frame
 *   4. visibility observation opens, page-in queues run, MutationObserver starts, <html data-core="live">
 * Any boot failure: all guards released, native scrolling, <html data-core="failed">. Text never stays hidden.
 */
import { store } from './store.js';
import { frame } from './frame.js';
import { clock } from './clock.js';
import { initReduced, setMotionOverride } from './reduced.js';
import { initViewport } from './viewport.js';
import { initFonts, fontsSettled } from './fonts.js';
import { visibility } from './visibility.js';
import { guard } from './guard.js';
import { wait } from './dom.js';
import { Page } from './page.js';
import { modules } from './modules.js';
import { setCI, currentCI, CIS } from './theme.js';
import { motion } from '../motion/engine.js';
import { scroll } from '../motion/scroll.js';

// Backstop for an intro owner that never sets 'intro:done', counted from navigation start (stage 7): the
// intro's own limit (TIMING.intro.limit) has the curtain open by then.
const INTRO_LIMIT_MS = 5000;
const FONT_LIMIT_MS = 3000;

let state = 'idle';
let shell = null;
let view = null;
let observer = null;
const added = new Set();
const removed = new Set();
let flushPending = false;

function pageFor(el) {
  return view && view.root.contains(el) ? view : shell;
}

async function intro() {
  if (store.get('intro:done')) return;
  const owner = document.querySelector('[data-intro-owner]');
  // Only a running owner is waited for: an intro module that failed to load or set up cannot end itself.
  if (owner && modules.api(owner, (owner.getAttribute('data-mod') || '').split(/\s+/)[0])) {
    await Promise.race([store.when('intro:done'), wait(Math.max(0, INTRO_LIMIT_MS - performance.now()))]);
  } else {
    await frame.next();
    await fontsSettled(FONT_LIMIT_MS);
    await frame.next();
  }
  store.set('intro:done', true);
}

function flushMutations() {
  flushPending = false;
  for (const node of removed) {
    if (!node.isConnected) modules.stop(node);
  }
  removed.clear();
  const roots = [...added].filter((n) => n.isConnected);
  added.clear();
  for (const node of roots) {
    modules.start(node, pageFor).catch((err) => console.error('[v1] late module start failed', err));
  }
}

function observeMutations() {
  if (observer) return;
  observer = new MutationObserver((list) => {
    for (const rec of list) {
      for (const n of rec.addedNodes) if (n.nodeType === 1) added.add(n);
      for (const n of rec.removedNodes) if (n.nodeType === 1) removed.add(n);
    }
    if (!flushPending && (added.size || removed.size)) {
      flushPending = true;
      frame.once(flushMutations, 'input');
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

export const core = {
  store,
  motion,
  scroll,
  visibility,
  modules,
  clock,
  frame,
  CIS,
  setCI,
  currentCI,
  setMotionOverride,

  get state() {
    return state;
  },
  get view() {
    return view;
  },
  get shell() {
    return shell;
  },

  async boot() {
    if (state !== 'idle') return;
    state = 'booting';
    const html = document.documentElement;
    html.setAttribute('data-core', 'booting');
    try {
      initReduced();
      initViewport();
      initFonts();
      frame.start();
      motion.init();
      scroll.init();
      if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
      if (!location.hash) scrollTo(0, 0);
      store.set('ci', currentCI());

      const viewRoot = document.querySelector('[data-view]');
      shell = new Page(document.body, { name: 'shell', persistent: true });
      view = viewRoot ? new Page(viewRoot, { name: viewRoot.getAttribute('data-view') || 'view' }) : null;
      await modules.start(document.body, pageFor);
      guard.sweep(document);

      await intro();
      shell.enter();
      if (view) view.enter();
      observeMutations();
      state = 'live';
      html.setAttribute('data-core', 'live');
      store.set('core:live', true);
    } catch (err) {
      state = 'failed';
      console.error('[v1] boot failed', err);
      html.setAttribute('data-core', 'failed');
      guard.releaseAll(document);
      try {
        scroll.disable();
      } catch (e) {
        /* native scrolling stays */
      }
    }
  },

  /* View lifecycle for page transitions (spike S3 builds the router on these four steps). */

  /** Step 1: run the page-out queue of the current view (parallel, awaited). */
  async leaveView() {
    if (view) await view.leave();
  },

  /** Step 2: destroy all modules of the current view. */
  unmountView() {
    if (!view) return;
    modules.stopPage(view);
    view = null;
  },

  /** Step 3: start the modules of a new view root (already in the document). */
  async mountView(root) {
    view = new Page(root, { name: root.getAttribute('data-view') || 'view' });
    await modules.start(root, pageFor);
    return view;
  },

  /** Step 4: run the page-in queue of the new view. */
  enterView() {
    if (view) view.enter();
  },

  /** Review helper: page-out, short pause, page-in on the same view (no navigation). */
  async rehearsePageChange(pauseMs = 400) {
    await this.leaveView();
    await wait(pauseMs);
    this.enterView();
  },

  /** Counters for leak checks (soak test in spike S3). */
  stats() {
    return {
      modules: modules.count(),
      storeListeners: store.listenerCount(),
      frameCallbacks: frame.count(),
      visibility: visibility.count(),
      tweens: motion.count(),
      scrollSubscribers: scroll.count(),
    };
  },
};
