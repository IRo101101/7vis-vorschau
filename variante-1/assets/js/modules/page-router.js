/**
 * page-router: page changes without reload (IM 9, PLAN 7 "eigener kleiner Router", spike S3).
 *
 * Markup: <body data-mod="page-router" data-page-router-shell="<shell id>">. Every page stays a complete
 * document; the router only swaps the view (<main data-view>), the shell around it stays.
 *
 * Intercepted: same-origin links without target, download or data-page-router-ignore, not an anchor on
 * the same page, not a file with another extension, plain left click without modifier keys. Targets are
 * preloaded on hover and focus (bounded cache). A target is used only if it is HTML, has a [data-view]
 * and declares the same shell; anything else, and any error or time limit, falls back to normal
 * navigation (location.assign, or replace once the history entry exists).
 *
 * One change (IM 9, adapted):
 *   1 out      'webgl:freeze' true, smooth scrolling stops, page-out queue of the view (awaited, limit)
 *   2 load     target document (started on click, usually already preloaded), parse, check shell
 *   3 styles   stylesheets the target needs are added and awaited; extra ones are removed at the end
 *   4 freeze   the old view is cloned in its current state (module attributes, ids and form names
 *              removed, inert, aria-hidden, data-standbild) and fixed at the same place; sticky parts
 *              keep their stuck position
 *   5 swap     modules of the old view destroyed, new view inserted fixed and fully clipped, modules
 *              started, page-in queue run
 *   6 reveal   the new view starts 8 % lower and opens from the bottom up with clip-path, 0.9 s, curve
 *              "vorhang"; shell elements with [data-transition-clip] (the WebGL canvas of S1) are cut
 *              from the bottom with the same edge in the same frame; safety limit 0.3 s after the end
 *   7 settle   'transition:covered', clone removed, view back in flow, scroll position set (top, anchor,
 *              or the stored position for Back/Forward), clip lifted, 'webgl:freeze' false, focus on the
 *              new view, 'transition:settled'
 * Reduced motion: no frozen copy and no reveal, the views are swapped at once.
 * No interruption: a click or Back/Forward during a change is queued (the latest wins) and runs after it.
 */
import { core } from '../core/core.js';
import { wait } from '../core/dom.js';
import { TIMING } from '../motion/curves.js';

const T = TIMING.pageReveal;
const LIMITS = Object.freeze({ fetchMs: 5000, leaveMs: 1500, stylesMs: 3000, mountMs: 4000 });
const CACHE = Object.freeze({ size: 6, ttlMs: 30000 });
const STATE_KEY = 'v1Router';
const FILE = /\.(?!html?$)[a-z0-9]{2,5}$/i;

const docUrl = (href) => {
  const u = new URL(href, location.href);
  u.hash = '';
  return u.href;
};
const asObject = (v) => (v && typeof v === 'object' ? v : {});
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export default {
  name: 'page-router',
  options: { shell: '' },

  setup(ctx) {
    const { opts, store, motion, scroll } = ctx;
    if (typeof fetch !== 'function' || typeof DOMParser !== 'function' || !history.pushState) return null;

    const cache = new Map();
    let busy = false;
    let pending = null;
    let current = docUrl(location.href);
    let done = 0;
    let lastError = null;

    /* ---------- links ---------- */

    function targetOf(a) {
      if (!(a instanceof HTMLAnchorElement) || !a.hasAttribute('href') || a.hasAttribute('download')) return null;
      const target = a.getAttribute('target');
      if (target && target.toLowerCase() !== '_self') return null;
      if (a.closest('[data-page-router-ignore], [data-standbild]')) return null;
      let url;
      try {
        url = new URL(a.href, location.href);
      } catch (err) {
        return null;
      }
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return null;
      if (FILE.test(url.pathname)) return null;
      if (url.hash && docUrl(url.href) === current) return null;
      return url;
    }

    const linkOf = (event) => (event.target && event.target.closest ? event.target.closest('a[href]') : null);

    /* ---------- loading with cache and time limit ---------- */

    async function fetchDoc(key) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), LIMITS.fetchMs);
      try {
        const res = await fetch(key, { signal: ctrl.signal, credentials: 'same-origin', headers: { 'X-V1-Router': '1' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!/text\/html/i.test(res.headers.get('content-type') || '')) throw new Error('not an HTML document');
        const text = await res.text();
        return { text, url: res.url || key };
      } finally {
        clearTimeout(timer);
      }
    }

    function load(href) {
      const key = docUrl(href);
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE.ttlMs) {
        cache.delete(key);
        cache.set(key, hit);
        return hit.promise;
      }
      const entry = { at: Date.now(), promise: fetchDoc(key) };
      cache.set(key, entry);
      entry.promise.catch(() => {
        if (cache.get(key) === entry) cache.delete(key);
      });
      while (cache.size > CACHE.size) cache.delete(cache.keys().next().value);
      return entry.promise;
    }

    function preload(event) {
      const url = targetOf(linkOf(event));
      if (!url || docUrl(url.href) === current) return;
      load(url.href).catch(() => {});
    }

    /* ---------- document checks and stylesheets ---------- */

    function compatible(doc) {
      const body = doc.body;
      if (!body) return false;
      if (!(body.getAttribute('data-mod') || '').split(/\s+/).includes('page-router')) return false;
      return (body.getAttribute('data-page-router-shell') || '') === opts.shell;
    }

    async function syncStyles(doc, base) {
      const want = [...doc.querySelectorAll('link[rel~="stylesheet"][href]')].map((l) => new URL(l.getAttribute('href'), base).href);
      const have = [...document.querySelectorAll('link[rel~="stylesheet"][href]')];
      const haveHrefs = new Set(have.map((l) => l.href));
      const added = [];
      let anchor = have[have.length - 1] || null;
      for (const href of want) {
        if (haveHrefs.has(href)) continue;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        if (anchor) anchor.after(link);
        else document.head.append(link);
        anchor = link;
        added.push(link);
      }
      if (added.length) {
        const loads = added.map((link) => new Promise((resolve, reject) => {
          link.addEventListener('load', resolve, { once: true });
          link.addEventListener('error', () => reject(new Error(`stylesheet failed: ${link.href}`)), { once: true });
        }));
        const ok = await Promise.race([Promise.all(loads).then(() => true), wait(LIMITS.stylesMs).then(() => false)]);
        if (!ok) throw new Error('stylesheets too slow');
      }
      const wanted = new Set(want);
      return { added, stale: have.filter((l) => !wanted.has(l.href)) };
    }

    /* ---------- frozen copy of the old view ---------- */

    const SKIP = ':not(.tx-w):not(.tx-m):not(.tx-c):not(.tx-sr):not(br)';

    function freeze(root) {
      const rect = root.getBoundingClientRect();
      const nodes = root.querySelectorAll(`*${SKIP}`);
      const stuck = [];
      nodes.forEach((node, i) => {
        if (getComputedStyle(node).position === 'sticky') stuck.push({ i, top: node.getBoundingClientRect().top });
      });
      const clone = root.cloneNode(true);
      for (const node of [clone, ...clone.querySelectorAll('[data-mod], [id], [name], [autofocus]')]) {
        node.removeAttribute('data-mod');
        node.removeAttribute('id');
        node.removeAttribute('name');
        node.removeAttribute('autofocus');
      }
      clone.removeAttribute('tabindex');
      clone.setAttribute('data-standbild', '');
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      const s = clone.style;
      s.position = 'fixed';
      s.top = `${rect.top}px`;
      s.left = `${rect.left}px`;
      s.width = `${rect.width}px`;
      s.margin = '0';
      s.zIndex = '998';
      s.pointerEvents = 'none';
      document.body.append(clone);
      if (stuck.length) {
        const copies = clone.querySelectorAll(`*${SKIP}`);
        for (const { i, top } of stuck) {
          const c = copies[i];
          if (!c) continue;
          c.style.position = 'relative';
          c.style.top = '0px';
          c.style.top = `${top - c.getBoundingClientRect().top}px`;
        }
      }
      return clone;
    }

    /* ---------- reveal ---------- */

    const PLACED = ['position', 'top', 'left', 'width', 'height', 'overflow', 'z-index', 'margin'];

    function place(view, geo) {
      const s = view.style;
      s.position = 'fixed';
      s.top = `${geo.boxTop}px`;
      s.left = `${geo.left}px`;
      s.width = `${geo.width}px`;
      s.height = `${geo.boxH}px`;
      s.overflow = 'hidden';
      s.zIndex = '999';
      s.margin = '0';
      motion.set(view, { yPercent: T.offsetPercent, clipTop: 100 });
    }

    function unplace(view) {
      motion.set(view, { yPercent: 0, clipTop: 0 });
      for (const prop of PLACED) view.style.removeProperty(prop);
      if (!view.getAttribute('style')) view.removeAttribute('style');
    }

    function clipTargets(view) {
      return [...document.querySelectorAll('[data-transition-clip]')].filter((c) => !view.contains(c) && !c.closest('[data-standbild]'));
    }

    async function reveal(view, geo) {
      const clips = clipTargets(view);
      const rects = clips.map((c) => c.getBoundingClientRect());
      const edge = () => {
        const y = geo.boxTop + ((motion.get(view, 'yPercent') + motion.get(view, 'clipTop')) / 100) * geo.boxH;
        clips.forEach((c, i) => {
          const r = rects[i];
          motion.set(c, { clipBottom: r.height ? clamp(((r.bottom - y) / r.height) * 100, 0, 100) : 100 });
        });
      };
      const tw = motion.tween(view, { yPercent: 0, clipTop: 0 }, { duration: T.duration, ease: T.ease, onUpdate: edge });
      await Promise.race([tw.done, wait((T.duration + T.safetyExtra) * 1000)]);
      tw.finish();
      edge();
      return clips;
    }

    /* ---------- one page change ---------- */

    // Document coordinates use the native scroll position: the smooth-scroll value can lag behind it.
    function remember() {
      history.replaceState({ ...asObject(history.state), [STATE_KEY]: { y: Math.round(scrollY) } }, '');
    }

    /** Document position at which an anchor lands, honouring scroll-padding and scroll-margin like the browser. */
    function anchorY(anchor) {
      const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
      const margin = parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0;
      return Math.max(0, anchor.getBoundingClientRect().top + scrollY - pad - margin);
    }

    const storedY = () => {
      const st = asObject(history.state)[STATE_KEY];
      return st && Number.isFinite(st.y) ? st.y : 0;
    };

    function markShellLinks(view) {
      for (const a of document.querySelectorAll('a[href]')) {
        if (view.contains(a) || a.closest('[data-standbild]')) continue;
        let same = false;
        try {
          same = docUrl(a.href) === current;
        } catch (err) {
          same = false;
        }
        if (same) a.setAttribute('aria-current', 'page');
        else if (a.getAttribute('aria-current') === 'page') a.removeAttribute('aria-current');
      }
    }

    async function transition(job) {
      const from = core.view;
      if (!from) throw new Error('no current view');
      const reduced = ctx.reduced;
      const startUrl = docUrl(location.href);
      const docP = load(job.href);
      docP.catch(() => {});
      const info = { from: from.name, to: null, url: null };

      // 1 out
      job.stage = 'out';
      if (job.push) remember();
      store.set('webgl:freeze', true);
      scroll.stop();
      await Promise.race([core.leaveView(), wait(LIMITS.leaveMs)]);

      // 2 load
      job.stage = 'load';
      const { text, url } = await docP;
      const doc = new DOMParser().parseFromString(text, 'text/html');
      const nextRoot = doc.querySelector('[data-view]');
      if (!nextRoot || !compatible(doc)) throw new Error('target is not a page of this shell');
      const finalUrl = new URL(url, location.href);
      finalUrl.hash = new URL(job.href, location.href).hash;
      job.target = finalUrl.href;
      info.to = nextRoot.getAttribute('data-view');
      info.url = finalUrl.href;

      // 3 styles
      job.stage = 'styles';
      const styles = await syncStyles(doc, url);

      // history and head
      if (job.push && docUrl(location.href) === startUrl) {
        history.pushState({ [STATE_KEY]: { y: 0 } }, '', finalUrl.href);
        job.pushed = true;
      }
      if (doc.title) document.title = doc.title;
      const desc = doc.querySelector('meta[name="description"]');
      const ownDesc = document.querySelector('meta[name="description"]');
      if (desc && ownDesc) ownDesc.setAttribute('content', desc.getAttribute('content') || '');
      if (doc.documentElement.lang) document.documentElement.lang = doc.documentElement.lang;

      // 4 freeze
      job.stage = 'freeze';
      const oldRoot = from.root;
      const rect = oldRoot.getBoundingClientRect();
      const top0 = rect.top + scrollY;
      const clone = reduced ? null : freeze(oldRoot);
      if (clone) document.body.style.minHeight = `${document.documentElement.scrollHeight}px`;

      // 5 swap
      job.stage = 'swap';
      core.unmountView();
      const fresh = document.adoptNode(nextRoot);
      oldRoot.replaceWith(fresh);
      let ty = job.push ? 0 : job.y;
      if (finalUrl.hash) {
        const anchor = document.getElementById(decodeURIComponent(finalUrl.hash.slice(1)));
        if (anchor && fresh.contains(anchor)) ty = anchorY(anchor);
      }
      let geo = null;
      if (clone) {
        const vTop = top0 - ty;
        geo = { left: rect.left, width: rect.width, boxTop: Math.max(0, vTop), boxH: innerHeight - Math.max(0, vTop) };
        place(fresh, geo);
        fresh.scrollTop = Math.max(0, -vTop);
      }
      job.stage = 'mount';
      await Promise.race([core.mountView(fresh), wait(LIMITS.mountMs)]);
      core.enterView();

      // 6 reveal
      job.stage = 'reveal';
      const clips = clone ? await reveal(fresh, geo) : [];

      // 7 settle
      job.stage = 'settle';
      store.emit('transition:covered', { ...info });
      if (clone) clone.remove();
      for (const link of styles.stale) link.remove();
      if (clone) unplace(fresh);
      document.body.style.removeProperty('min-height');
      if (!document.body.getAttribute('style')) document.body.removeAttribute('style');
      if (finalUrl.hash) {
        const anchor = document.getElementById(decodeURIComponent(finalUrl.hash.slice(1)));
        if (anchor && fresh.contains(anchor)) ty = anchorY(anchor);
      }
      scroll.resize();
      await scroll.to(ty, { immediate: true });
      scroll.start();
      for (const c of clips) motion.set(c, { clipBottom: 0 });
      current = docUrl(finalUrl.href);
      markShellLinks(fresh);
      fresh.focus({ preventScroll: true });
      store.set('webgl:freeze', false);
      store.emit('transition:settled', { ...info });
    }

    function hard(job) {
      const href = job.target || new URL(job.href, location.href).href;
      if (job.pushed || !job.push) location.replace(href);
      else location.assign(href);
    }

    async function run(href, { push = true, y = 0 } = {}) {
      busy = true;
      const job = { href, push, y, pushed: false, stage: 'start', target: null };
      try {
        await transition(job);
        done += 1;
      } catch (err) {
        lastError = { message: String(err && err.message), stage: job.stage };
        ctx.warn(`page change failed in stage "${job.stage}", normal navigation`, err && err.message);
        hard(job);
        return; // the document is being replaced; nothing else starts
      }
      busy = false;
      drain();
    }

    function navigate(href, o) {
      if (busy) {
        pending = { href, kind: o.kind || 'link' };
        return;
      }
      run(href, o);
    }

    function drain() {
      const p = pending;
      pending = null;
      if (p && p.kind === 'link') {
        navigate(p.href, { push: docUrl(p.href) !== docUrl(location.href), kind: 'link' });
        return;
      }
      if (docUrl(location.href) !== current) navigate(location.href, { push: false, y: storedY(), kind: 'pop' });
    }

    /* ---------- listeners ---------- */

    ctx.listen(document, 'click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const url = targetOf(linkOf(event));
      if (!url || core.state !== 'live') return;
      event.preventDefault();
      navigate(url.href, { push: docUrl(url.href) !== docUrl(location.href), kind: 'link' });
    });
    ctx.listen(document, 'pointerover', preload, { passive: true });
    ctx.listen(document, 'focusin', preload);
    ctx.listen(window, 'popstate', () => {
      if (busy) {
        pending = { kind: 'pop' };
        return;
      }
      if (docUrl(location.href) === current) return; // anchor change inside the page
      navigate(location.href, { push: false, y: storedY(), kind: 'pop' });
    });
    // Stage 5: modules ask for a page change through the store ({ href, extern }), e.g. the sign-in and the
    // checkout hand-off (CONTRACT 7 'router:go'). A target outside the shell falls back to normal navigation.
    ctx.on('router:go', (data) => {
      if (!data || !data.href) return;
      const href = new URL(data.href, location.href).href;
      // extern: a page outside the site (the payment service's hosted page): a normal page load.
      if (data.extern || core.state !== 'live') {
        location.assign(href);
        return;
      }
      navigate(href, { push: docUrl(href) !== docUrl(location.href), kind: 'link' });
    });

    return {
      navigate: (href) => navigate(new URL(href, location.href).href, { push: docUrl(href) !== docUrl(location.href), kind: 'link' }),
      get busy() {
        return busy;
      },
      get done() {
        return done;
      },
      get current() {
        return current;
      },
      get lastError() {
        return lastError;
      },
      get cached() {
        return [...cache.keys()];
      },
    };
  },
};
