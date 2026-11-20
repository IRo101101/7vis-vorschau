/**
 * Closing surface ("Schlussflaeche", IM 13.1): the screen rectangle that carries a scene's image.
 *
 * A scene is bound to a DOM element. Its surface is at most one viewport high:
 *   - element not taller than the viewport: the surface is the element's rectangle, 1:1;
 *   - taller element: the surface enters from below with the element's top edge, stands while the element
 *     covers the viewport, and leaves upwards with the element's bottom edge.
 * The scene camera always sees the whole surface; only the part inside the viewport is drawn.
 *
 * Everything is snapped to device pixels the way the browser snaps backgrounds, so the edge of a scene
 * and the edge of its section fall on the same pixel row. Pure functions: no DOM access here.
 */

/**
 * @param {{left:number, top:number, width:number, height:number}} rect  element rectangle, CSS px
 * @param {number} vw viewport width, CSS px
 * @param {number} vh viewport height, CSS px
 * @param {number} dpr effective pixel ratio
 * @returns surface in device px: { x, y, w, h } (top-left origin), clip { x, y, w, h } inside the drawing
 *          buffer, visible flag, and the CSS-px values for measurements ({ css: { y, h } }).
 */
export function closingSurface(rect, vw, vh, dpr = 1) {
  const height = rect.height;
  let top;
  if (height <= vh) top = rect.top;
  else if (rect.top > 0) top = rect.top;
  else if (rect.top + height < vh) top = rect.top + height - vh;
  else top = 0;
  const h = Math.min(height, vh);

  const bw = Math.round(vw * dpr);
  const bh = Math.round(vh * dpr);
  const x0 = Math.round(rect.left * dpr);
  const x1 = Math.round((rect.left + rect.width) * dpr);
  const y0 = Math.round(top * dpr);
  const y1 = Math.round((top + h) * dpr);
  const cx0 = Math.max(0, x0);
  const cx1 = Math.min(bw, x1);
  const cy0 = Math.max(0, y0);
  const cy1 = Math.min(bh, y1);
  return {
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    clip: { x: cx0, y: cy0, w: Math.max(0, cx1 - cx0), h: Math.max(0, cy1 - cy0) },
    visible: cx1 > cx0 && cy1 > cy0,
    css: { y: top, h },
  };
}

/** WebGL counts rows from the bottom: convert a top-left device rectangle for viewport and scissor. */
export function toGL(r, bufferHeight) {
  return { x: r.x, y: bufferHeight - (r.y + r.h), w: r.w, h: r.h };
}

/**
 * Scroll progress of a tall element: 0 while its top is at or below the viewport top, 1 when it has
 * moved up by `span` px. Used by scenes for scrubs (IM 13.3: scrub over the first two viewport heights).
 */
export function progress(rect, span) {
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, -rect.top / span));
}
