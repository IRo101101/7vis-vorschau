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
  // IM 8 (stage 3, intro "Auftakt"). Reference values plus our own for the real progress (PLAN 5 no. 13):
  // the reference simulates 2.2 s of progress; here the displayed value follows the real one, never faster
  // than one full sweep in sweepMin, and the whole intro ends at the time limit whatever is still loading.
  intro: Object.freeze({
    textDuration: 1.1,
    charStagger: 0.02,
    lineStagger: 0.1,
    ease: 'titel',
    markAt: 0.07,
    markDuration: 1.8,
    markStagger: 0.08,
    markScaleFrom: 1.4,
    markYFrom: 30,
    countAt: 0.17,
    countStepDuration: 0.6,
    countStepEase: 'streifen',
    curtainDuration: 0.9,
    curtainEase: 'vorhang',
    curtainFrames: 2,
    heroTitleAt: 0.15,
    sweepMin: 1.2,
    hold: 0.15,
    limit: 5,
    weights: Object.freeze({ fonts: 0.25, load: 0.25, webgl: 0.5 }),
  }),
  // IM 11.11, IS 2 (stage 3, navigation): colour follows the section under a line 4 px below the bar, 0.35 s.
  nav: Object.freeze({
    lineOffset: 4,
    colourDuration: 0.35,
    open: Object.freeze({ duration: 0.5, ease: 'paneel', itemFrom: 35, itemStagger: 0.06 }),
    close: Object.freeze({ itemDuration: 0.25, itemStagger: 0.03, heightDuration: 0.5, fadeDuration: 0.3, fadeEase: 'power1.in', fadeLead: 0.325 }),
  }),
  // IM 9 (stage 2, spike S3)
  pageReveal: Object.freeze({ duration: 0.9, ease: 'vorhang', offsetPercent: 8, safetyExtra: 0.3, outDuration: 0.4, outEase: 'power3.in' }),
  // IM 11.6, reduced per FRAGEN 4b
  guidedScroll: Object.freeze({ duration: 1.5, ease: 'schnapp', startFraction: 0.01, endFraction: 0.9, backFraction: 0.1 }),
  // IM 10 row "Zitat", IM 11.10 (used for the principles, stage 4)
  // Stage 4 adds: old statement fades in 0.4 s power2.in, the new image rises in its frame with the row's
  // 0.9 s expo.out (IM 11.10, refmedia clip testimonials: words from 110 %, last word 0.23 s after the change).
  quote: Object.freeze({ duration: 0.8, wordStagger: 0.02, ease: 'expo.out', fromXPercent: 110, autoplay: 5, transition: 0.9, inactiveOpacity: 0.65, fadeOut: 0.4, fadeOutEase: 'power2.in', imageFrom: 100 }),
  // IM 11.8 (stage 4): 3 cards from 768 px, 1 below; a carousel from 4 showable cards, a row from 2 (PLAN 11).
  // clickSlop is our own value: any pointer travel beyond it is no click (refmedia v1 F11, a short vertical
  // drag on a card opened the product in the reference).
  carousel: Object.freeze({ duration: 1.2, ease: 'expo.out', dragThreshold: 12, gap: 8, peek: 24, visible: 3, visibleNarrow: 1, minCarousel: 4, minRow: 2, clickSlop: 6 }),
  // IM 11.9 "section-parallax" (stage 4, principles): starts 12 % of its height lower, reaches 0 while its top
  // edge travels from the bottom to the top of the viewport (smoothstep); off for coarse pointers and reduced motion.
  sectionLift: Object.freeze({ offset: 12 }),
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
    // Composition of the home page (stage 3), measured in the WebGL recordings of the reference (refmedia v1
    // gl/, W2, W4): in the hero the figure stands centred in the lower half and is cut by the bottom edge;
    // while the slider covers the hero it turns, moves up and to the right and shrinks to 0.9. Phones: no
    // sideways shift, 0.6 in the slider, centred between text and markers. The page layout places two
    // anchor boxes, the hero still and the slider stage ([data-figur-anker]); the figure is centred on them
    // and its bean is the box width divided by stillRatio long, so still image and live figure coincide.
    // Without anchors: fractions of the viewport (x, y = centre, size = length of the bean).
    start: Object.freeze({
      stillRatio: 1.2,
      desktop: Object.freeze({
        hero: Object.freeze({ x: 0.5, y: 0.8, size: 0.6 }),
        slider: Object.freeze({ x: 0.7, y: 0.56, size: 0.54 }),
        sizeOf: 'h',
      }),
      mobile: Object.freeze({
        hero: Object.freeze({ x: 0.5, y: 0.8, size: 0.86 }),
        slider: Object.freeze({ x: 0.5, y: 0.64, size: 0.52 }),
        sizeOf: 'w',
      }),
      // Beans fly in around the figure while the hero is covered (IM 13.3: particles grow between 33 % and
      // 66 % of half 1), desktop only (IM 16, W7). Springs and push of IM 13.3; swap on a force change:
      // out in 1 s expo.in, in again in 1 s expo.out (IM 13.3 "gebackene Animation").
      beans: Object.freeze({
        count: 16,
        growFrom: 0.33,
        growTo: 0.66,
        size: 0.13,
        stiffness: 40,
        damping: 12,
        pushRadius: 90,
        pushStrength: 3,
        spin: 40,
        spinDamping: 4,
        swapOut: Object.freeze({ duration: 1, ease: 'expo.in' }),
        swapIn: Object.freeze({ duration: 1, ease: 'expo.out' }),
      }),
      // Label change of the reference translated (IM 13.3): the new state of the figure (form and colour of
      // the force) opens inside a circle in screen space from (50 %, 66 %) to the farthest corner between
      // 0.5 s and 2.0 s of the change; soft edge 0.125, edge distorted by noise 0.075.
      iris: Object.freeze({ start: 0.5, end: 2, ease: 'expo.inOut', originX: 0.5, originY: 0.66, soft: 0.125, noise: 0.075 }),
      // Per-force colour: the force scale of the CI, drawn a third of the way towards the bean colour
      // (--kr-4) so the lightest and darkest steps stay visible on both surfaces.
      tint: 0.35,
    }),
  }),
  // ---- Stage 5 (shop route), appended. Values of IS 5, IS 6 and the refmedia v1 clips cart, stack, product.
  // IS 6 product-stack, IM 11, refmedia F8: sticky stage, next section revealed by clip from the bottom
  // (linear with scroll), image of the coming section 6 % parallax at scale 1.12, active index at 50 %,
  // snap from 80 % to the next section in 0.8 s (expo.out), otherwise back after 140 ms of rest; card image
  // and rolling lines 0.6 s "streifen" over 100 %.
  stack: Object.freeze({ activeAt: 0.5, snapAt: 0.8, snapDuration: 0.8, snapEase: 'expo.out', restMs: 140, parallax: 6, imageScale: 1.12, cardDuration: 0.6, cardEase: 'streifen', cardFrom: 100 }),
  // IS 6 pdp-info "Einschub": over the first viewport of the stage the column slides up (h 0 to 0.75) and the
  // info box fades in (h 0.25 to 1), curve "vorhang" (pdp-info-slide); from 768 px, never under reduced motion.
  infoSlide: Object.freeze({ slideEnd: 0.75, fadeStart: 0.25, ease: 'vorhang' }),
  // IM 11 "gallery": three image surfaces change places with the scroll during the hold of the last section.
  gallery: Object.freeze({ ease: 'sine.inOut', activeOpacity: 1, inactiveOpacity: 0.5 }),
  // IS 5, IM 11.12, refmedia clip cart (F19, F20): panel from the right, x 100 % to 0 and opacity in 0.5 s
  // ("paneel"), children from x -12 % with 0.06 s; closing like the preview, but horizontal. A line that is
  // being updated dims to 0.5. Sample adapter latency: adding about 1.1 s (button loading), changing a line
  // about 0.55 s, removing about 0.45 s (measured in the clip).
  cart: Object.freeze({
    open: Object.freeze({ duration: 0.5, ease: 'paneel', childFromX: -12, childStagger: 0.06 }),
    close: Object.freeze({ childDuration: 0.25, childStagger: 0.03, slideDuration: 0.5, fadeDuration: 0.3, fadeEase: 'power1.in', fadeLead: 0.325 }),
    pendingOpacity: 0.5,
    latency: Object.freeze({ add: 1.1, change: 0.55, remove: 0.45, slowFactor: 4 }),
  }),
  // Reveal of a part of a form that appears (shipping methods after the address, billing address): the
  // accordion values of IM 11.13 (height 0 to auto in 0.6 s, expo.out).
  reveal: Object.freeze({ duration: 0.6, ease: 'expo.out' }),
});
