/**
 * Anti-flash guard (PLAN 7: "Jeder Schutz gegen Aufblitzen hat ein Zeitlimit und einen Ausweg").
 *
 * Markup puts data-guard on elements that a module hides before it animates them. CSS hides them only
 * while script is enabled and motion is welcome, and shows them after --guard-limit in any case.
 * The runtime releases a guard (data-guard="free") right after the element's modules are set up,
 * on any module failure, on boot failure, and at the latest after LIMIT_MS for modules that hold it.
 */
const LIMIT_MS = 2000;

export const guard = {
  LIMIT_MS,

  release(el) {
    if (el && el.hasAttribute('data-guard') && el.getAttribute('data-guard') !== 'free') {
      el.setAttribute('data-guard', 'free');
    }
  },

  releaseAll(root = document) {
    root.querySelectorAll('[data-guard]:not([data-guard="free"])').forEach((el) => this.release(el));
  },

  /**
   * The CSS time limit already showed this element (the script came after --guard-limit): the reader has
   * seen it, so a module must not hide it again for an entrance (stage 7, slow connections). Only true while
   * the guard is still held by the CSS and the guard rule applies at all.
   */
  expired(el) {
    if (!el || !el.hasAttribute('data-guard') || el.getAttribute('data-guard') === 'free') return false;
    if (!globalThis.matchMedia || !matchMedia('(scripting: enabled) and (prefers-reduced-motion: no-preference)').matches) return false;
    return getComputedStyle(el).visibility === 'visible';
  },

  /** Called by the module loader after setup of all modules on an element. */
  afterSetup(el, held) {
    if (!el.hasAttribute('data-guard')) return;
    if (held) setTimeout(() => this.release(el), LIMIT_MS);
    else this.release(el);
  },

  /** Guards without any module are author errors: release and warn. */
  sweep(root = document) {
    root.querySelectorAll('[data-guard]:not([data-mod]):not([data-guard="free"])').forEach((el) => {
      console.warn('[v1:guard] data-guard without data-mod, released', el);
      this.release(el);
    });
  },
};
