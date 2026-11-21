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
  intro: () => import('./intro.js'),
  nav: () => import('./nav.js'),
  'card-overlay': () => import('./card-overlay.js'),
  'figure-grip': () => import('./figure-grip.js'),
  // Stage 4 (home page bottom)
  carousel: () => import('./carousel.js'),
  'image-swap': () => import('./image-swap.js'),
  'section-lift': () => import('./section-lift.js'),
  'principle-row': () => import('./principle-row.js'),
  accordion: () => import('./accordion.js'),
  // Stage 5 (shop route)
  'cart-panel': () => import('./cart-panel.js'),
  'qty-select': () => import('./qty-select.js'),
  'currency-switch': () => import('./currency-switch.js'),
  'buy-box': () => import('./buy-box.js'),
  'product-stack': () => import('./product-stack.js'),
  'info-slide': () => import('./info-slide.js'),
  gallery: () => import('./gallery.js'),
  catalogue: () => import('./catalogue.js'),
  enquiry: () => import('./enquiry.js'),
  checkout: () => import('./checkout.js'),
  'cart-page': () => import('./cart-page.js'),
  'order-view': () => import('./order-view.js'),
  'sign-in': () => import('./sign-in.js'),
  account: () => import('./account.js'),
};

export const MODULE_NAMES = Object.freeze(Object.keys(LOADERS));

export async function load(name) {
  const loader = LOADERS[name];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
