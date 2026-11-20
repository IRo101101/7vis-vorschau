/**
 * Motion table: curves, durations and staggers of the reference behaviour (INVENTAR-mechanik IM 6, IM 8,
 * IM 9, IM 10, IM 11) under own names. This file is the single source for the engine; the CSS tokens of
 * level 4 (assets/css/tokens/ebene4-mechanik.css) carry the same curves, the test suite compares both.
 * All times in seconds.
 */

/** Cubic-bezier control points, IM 6. Key = own name, comment = use in the reference. */
export const CURVES = Object.freeze({
  titel: Object.freeze([0.616, 0.007, 0.132, 1.002]), // large titles, intro
  karte: Object.freeze([0.813, 0.007, 0.072, 0.993]), // card unfolding
  'karte-bild': Object.freeze([0.317, 0.311, 0.111, 0.924]), // image inside the card
  'karte-text': Object.freeze([0.681, 0.002, 0.219, 0.994]), // characters in cards and text blocks
  vorhang: Object.freeze([0.569, 0.006, 0.072, 0.993]), // page transition, intro curtain
  paneel: Object.freeze([0.569, 0.006, 0.072, 0.993]), // navigation preview, cart panel
  streifen: Object.freeze([0.84, 0.075, 0.161, 1.002]), // vertical text strips in cards
  schnapp: Object.freeze([0.65, 0.39, 0.19, 1]), // guided scroll hero to slider
});

/** Tweens without own values (IM 2, IM 6). */
export const DEFAULTS = Object.freeze({ ease: 'expo.out', duration: 1.2 });

/** Values per use. Stage 1a uses headline, textrise and foldCard; the rest is the contract for later stages. */
export const TIMING = Object.freeze({
  // IM 10 row "unmask", IM 11.1
  headline: Object.freeze({
    duration: 1.2,
    charStagger: 0.02,
    lineStagger: 0.12,
    delay: 0.15,
    ease: 'titel',
    scaleFrom: 0.9,
    scaleDuration: 1.8,
    lineGapEm: 0.12,
    exit: Object.freeze({ duration: 0.6, charStagger: 0.01, lineStagger: 0.06, ease: 'power3.in' }),
  }),
  // IM 10 row "text-reveal", IM 11.2
  textrise: Object.freeze({ duration: 1.0, charStagger: 0.02, delay: 0, ease: 'karte-text' }),
  // IM 10 row "Zeilen der Mini-Karte", IM 11.4
  foldCard: Object.freeze({
    duration: 1.0,
    ease: 'karte',
    widthFrom: 33,
    yFrom: 64,
    opacityDuration: 0.75,
    opacityEase: 'power1.out',
    imageDuration: 1.0,
    imageEase: 'karte-bild',
    imageOpacityDuration: 0.6,
    imageDelay: 0.35,
    textDelay: 0.35,
    lineStagger: 0.1,
    textDuration: 1.0,
    textEase: 'karte-text',
    charStagger: 0.01,
    fade: Object.freeze({ delay: 0.5, duration: 1.2, ease: 'expo.out', riseFrom: 200, textDelay: 0.3, lineStagger: 0.04 }),
    exit: Object.freeze({ duration: 0.4, ease: 'power3.in' }),
    close: Object.freeze({ duration: 0.6, ease: 'expo.out' }),
  }),
  // IM 10 rows "Titel im Produkt-Slider", IM 11.7 (stage 2, spike S2)
  slider: Object.freeze({
    in: Object.freeze({ duration: 1.2, charStagger: 0.02, lineStagger: 0.12, ease: 'titel' }),
    out: Object.freeze({ duration: 0.6, charStagger: 0.01, lineStagger: 0.06, ease: 'power3.in' }),
    swapDelay: 0.06,
    lock: 2,
    imageDuration: 0.9,
    imageEase: 'expo.out',
    stripDuration: 0.6,
    stripEase: 'streifen',
    bgDuration: 2,
    bgEase: 'expo.inOut',
    navTransition: 0.6,
    inactiveOpacity: 0.5,
    inactiveScale: 0.93,
    inactiveTransition: 0.35,
  }),
  // IM 8 (stage 3, intro)
  intro: Object.freeze({
    textDuration: 1.1,
    charStagger: 0.02,
    lineStagger: 0.1,
    ease: 'titel',
    markDuration: 1.8,
    markStagger: 0.08,
    curtainDuration: 0.9,
    curtainEase: 'vorhang',
    heroTitleAt: 0.15,
  }),
  // IM 9 (stage 2, spike S3)
  pageReveal: Object.freeze({ duration: 0.9, ease: 'vorhang', offsetPercent: 8, safetyExtra: 0.3, outDuration: 0.4, outEase: 'power3.in' }),
  // IM 11.6, reduced per FRAGEN 4b
  guidedScroll: Object.freeze({ duration: 1.5, ease: 'schnapp', startFraction: 0.01, endFraction: 0.9, backFraction: 0.1 }),
  // IM 10 row "Zitat", IM 11.10 (used for the principles, stage 4)
  quote: Object.freeze({ duration: 0.8, wordStagger: 0.02, ease: 'expo.out', fromXPercent: 110, autoplay: 5, transition: 0.9, inactiveOpacity: 0.65 }),
  // IM 11.8 (stage 4)
  carousel: Object.freeze({ duration: 1.2, ease: 'expo.out', dragThreshold: 12, gap: 8, peek: 24 }),
  // IM 11.11, IM 11.12 (shell)
  panel: Object.freeze({ duration: 0.5, ease: 'paneel', itemFrom: 35, itemStagger: 0.06, closeItems: 0.25, closeItemStagger: 0.03 }),
  // IM 11.13
  faq: Object.freeze({ duration: 0.6, ease: 'expo.out', dimOpacity: 0.55, dimDuration: 0.3 }),
  // IM 11.14
  scrollGauge: Object.freeze({ fade: 0.5, idleMs: 500, minShare: 0.1, maxShare: 0.25 }),
  // IM 11.15 is left out (PLAN 5 no. 27)
  imgHover: Object.freeze({ opacityDuration: 0.35, opacityEase: 'power2.out', scaleFrom: 1.03, scaleDuration: 1.0, scaleEase: 'expo.out' }),
  // IM 13.1, IM 18 (spike S1): WebGL frame. dtMax 1/30 s, pixel ratio cap 1.5, render window half a viewport
  // before and after the element. Guard and samples are own values (the reference has no levels, IM 20).
  gl: Object.freeze({
    dtMax: 1 / 30,
    pixelRatioMax: 1.5,
    windowMargin: '50% 0px',
    samples: 4,
    backFade: 0.5,
    backFadeEase: 'power2.out',
    pointerApproach: 0.08,
    guard: Object.freeze({ budgetMs: 25, windowMs: 1500, minFrames: 20, warmupMs: 500, stallMs: 250, cooldownMs: 2000 }),
  }),
  // IM 8 (T plus 0.3) and IM 13.3: hero figure. Scroll values in the reference's scene units, our scene is
  // scaled so they give the same composition (figure about half the viewport height, camera FOV 30 deg).
  figure: Object.freeze({
    enterAt: 0.3,
    enterDuration: 1.75,
    enterEase: 'back.out(0.5)',
    enterDrop: 0.1,
    enterTilt: 45,
    fadeDuration: 0.5,
    fadeEase: 'power2.out',
    baseTiltY: -22.5,
    baseTiltX: 12,
    half1: Object.freeze({ x: -0.095, y: 0.105, scale: 0.9, turn: 351, rotX: -0.181, rotZ: 0.233 }),
    half2: Object.freeze({ turn: 540 }),
    mobile: Object.freeze({ size: 0.6, turn: 360 }),
    mouseMax: 0.1,
    springStiffness: 10,
    springDamping: 8,
    fov: 30,
    fovRefAspect: 1.6,
    fovRefAspectMobile: 0.578,
    formApproach: 0.06,
    // IM 13.3 "Produktwechsel": full turn around y in 2 s, expo.inOut, not when the change came from a drag.
    switchDuration: 2,
    switchEase: 'expo.inOut',
  }),
});
