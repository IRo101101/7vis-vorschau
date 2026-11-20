/**
 * Module registry: name -> loader. Adding a module = one line here plus its file in this folder.
 * Dynamic imports keep each page to the modules it uses (PLAN 7: script split by page type, no build step).
 */
const LOADERS = {
  headline: () => import('./headline.js'),
  textrise: () => import('./textrise.js'),
  textsplit: () => import('./textsplit.js'),
  'fold-card': () => import('./fold-card.js'),
  'theme-picker': () => import('./theme-picker.js'),
  webgl: () => import('./webgl.js'),
  'form-regler': () => import('./form-regler.js'),
  'scroll-guide': () => import('./scroll-guide.js'),
  'gl-pruefung': () => import('./gl-pruefung.js'),
  'force-slider': () => import('./force-slider.js'),
  'figure-stand-in': () => import('./figure-stand-in.js'),
  'page-router': () => import('./page-router.js'),
  'scene-stand-in': () => import('./scene-stand-in.js'),
};

export const MODULE_NAMES = Object.freeze(Object.keys(LOADERS));

export async function load(name) {
  const loader = LOADERS[name];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
