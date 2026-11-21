/**
 * Module registry: name -> loader. Adding a module = one line here plus its file in this folder.
 * Dynamic imports keep each page to the modules it uses (PLAN 7: script split by page type, no build step).
 * Only modules of delivered pages are listed. The probe pages (site/proben/, not delivered) add their own
 * development modules with register() before the core boots (proben/js/boot.js, stage 7).
 */
const LOADERS = {
  headline: () => import('./headline.js'),
  'fold-card': () => import('./fold-card.js'),
  webgl: () => import('./webgl.js'),
  'scroll-guide': () => import('./scroll-guide.js'),
  'force-slider': () => import('./force-slider.js'),
  'page-router': () => import('./page-router.js'),
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
  // Corrections A (21.11.2026): scroll indicator of the shell, image parallax of the principles
  'scroll-gauge': () => import('./scroll-gauge.js'),
  'image-drift': () => import('./image-drift.js'),
};

export const MODULE_NAMES = Object.freeze(Object.keys(LOADERS));

/** Adds a module outside this folder (probe pages only); a delivered module is never replaced. */
export function register(name, loader) {
  if (!LOADERS[name] && typeof loader === 'function') LOADERS[name] = loader;
}

export async function load(name) {
  const loader = LOADERS[name];
  if (!loader) return null;
  const mod = await loader();
  return mod.default;
}
