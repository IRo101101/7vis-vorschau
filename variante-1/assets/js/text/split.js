/**
 * Text splitter (IM 10, PLAN 5 no. 7): lines, words and characters, one mask per character.
 *
 * Result inside the element:
 *   <span class="tx-sr">plain text</span>                 read by screen readers, visually hidden
 *   <span class="tx-vis" aria-hidden="true">               the visual copy
 *     <span class="tx-w">                                  word: inline-block, never breaks inside
 *       <span class="tx-m"><span class="tx-c">F</span></span>   mask (clips vertically) and character
 *
 * Lines are logical: after layout each word gets the index of the visual line it sits on (or of the
 * explicit line element it belongs to, e.g. [data-headline-line]). Nothing is wrapped per line, so the
 * split can never change where lines break; a new measurement only re-indexes words (re-split on
 * line-break change). Characters keep their nodes, so running animations survive a re-measure.
 *
 * Mask clearance: glyphs such as umlauts on capitals or descenders can reach outside a tight line box
 * (line-height 0.8). The splitter measures the ink of the element's own characters in its own font and
 * extends each mask by exactly that much (padding plus negative margin, layout unchanged). Level 3 tokens
 * --maske-luft-oben/-unten are minimums per CI. The start offset that hides a character completely is
 * derived from it: 100 % x (1 + (top + bottom) / line box); with zero clearance that is the reference's 100 %.
 *
 * Refuses (returns null) for elements with interactive descendants: they would end up inside aria-hidden.
 * Split the link itself instead (its accessible name then comes from its own .tx-sr).
 */

const SPACE = /([ \t\n\r\f]+)/;
const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable], details, summary, iframe, audio[controls], video[controls]';

let segmenter;
function graphemes(text) {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== 'undefined' && Intl.Segmenter ? new Intl.Segmenter('de', { granularity: 'grapheme' }) : null;
  }
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

let ctx2d = null;
function canvas() {
  if (!ctx2d) ctx2d = document.createElement('canvas').getContext('2d');
  return ctx2d;
}

/*
 * Kerning and box rounding: one box per character loses the pair kerning of the font, and the browser
 * rounds every character box up to its layout unit (1/64 px). Both make the split text a little wider than
 * the plain text. Each mask gets the difference back as an inline margin: pair kerning (canvas, same font
 * and size) plus the rounding of its own box. Measured values are cached per font string; the cache is
 * dropped whenever a font finishes loading, so a fallback font measured early is never kept.
 */
const metricCache = new Map();
let fontGeneration = 0;
if (typeof document !== 'undefined' && document.fonts) {
  document.fonts.addEventListener('loadingdone', () => {
    fontGeneration += 1;
    metricCache.clear();
  });
}
function textWidth(font, text) {
  let widths = metricCache.get(font);
  if (!widths) {
    widths = new Map();
    metricCache.set(font, widths);
  }
  let v = widths.get(text);
  if (v === undefined) {
    const ctx = canvas();
    ctx.font = font;
    if ('fontKerning' in ctx) ctx.fontKerning = 'normal';
    v = ctx.measureText(text).width;
    widths.set(text, v);
  }
  return v;
}
const LAYOUT_UNIT = 64;

function plainText(el, lineSelector) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
  if (lineSelector) clone.querySelectorAll(lineSelector).forEach((line) => line.append(' '));
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

function isBlockLevel(el) {
  const d = getComputedStyle(el).display;
  return !(d.startsWith('inline') || d === 'contents');
}

function transformed(text, tt) {
  if (tt === 'uppercase') return text.toLocaleUpperCase('de-CH');
  if (tt === 'lowercase') return text.toLocaleLowerCase('de-CH');
  if (tt === 'capitalize') return text + text.toLocaleUpperCase('de-CH');
  return text;
}

function cased(text, tt) {
  if (tt === 'uppercase') return text.toLocaleUpperCase('de-CH');
  if (tt === 'lowercase') return text.toLocaleLowerCase('de-CH');
  return text;
}

function lengthPx(value, fontSize) {
  const v = String(value || '').trim();
  if (!v) return 0;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return 0;
  if (v.endsWith('em') && !v.endsWith('rem')) return n * fontSize;
  if (v.endsWith('rem')) return n * parseFloat(getComputedStyle(document.documentElement).fontSize);
  return n;
}

export function canSplit(el) {
  return !!el && !el.querySelector(INTERACTIVE) && !el.querySelector('.tx-vis');
}

export class Split {
  constructor(el, { lineSelector = null } = {}) {
    const doc = el.ownerDocument;
    this.el = el;
    this.lineSelector = lineSelector;
    this.original = Array.from(el.childNodes, (n) => n.cloneNode(true));
    this.text = plainText(el, lineSelector);

    const sr = doc.createElement('span');
    sr.className = 'tx-sr';
    sr.textContent = this.text;
    const vis = doc.createElement('span');
    vis.className = isBlockLevel(el) ? 'tx-vis tx-vis--block' : 'tx-vis';
    vis.setAttribute('aria-hidden', 'true');
    while (el.firstChild) vis.appendChild(el.firstChild);
    el.append(sr, vis);
    this.sr = sr;
    this.vis = vis;

    const walker = doc.createTreeWalker(vis, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    this.words = [];
    this.chars = [];
    for (const node of textNodes) {
      const frag = doc.createDocumentFragment();
      for (const part of node.data.split(SPACE)) {
        if (!part) continue;
        if (SPACE.test(part)) {
          frag.append(doc.createTextNode(' '));
          continue;
        }
        const w = doc.createElement('span');
        w.className = 'tx-w';
        const word = { el: w, chars: [], line: 0, group: -1 };
        for (const g of graphemes(part)) {
          const m = doc.createElement('span');
          m.className = 'tx-m';
          const c = doc.createElement('span');
          c.className = 'tx-c';
          c.textContent = g;
          m.append(c);
          w.append(m);
          const ch = { mask: m, inner: c, text: g, word, line: 0, index: this.chars.length };
          word.chars.push(ch);
          this.chars.push(ch);
        }
        this.words.push(word);
        frag.append(w);
      }
      node.replaceWith(frag);
    }

    this.lineEls = lineSelector ? Array.from(vis.querySelectorAll(lineSelector)) : [];
    if (this.lineEls.length) {
      for (const word of this.words) word.group = this.lineEls.findIndex((le) => le.contains(word.el));
    }
    this.rows = [];
    this.lines = [];
    this.signature = '';
    this.clearance = null;
    this.kernFont = '';
    this.brs = [];
    this.measure();
  }

  /** Give each mask its kerning and box rounding back (see textWidth()). Runs again when the font changes. */
  applyKerning() {
    const styleOf = new Map();
    let signature = `${fontGeneration};`;
    for (const word of this.words) {
      const parent = word.el.parentElement;
      let st = styleOf.get(parent);
      if (!st) {
        const cs = getComputedStyle(parent);
        st = { font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`, tt: cs.textTransform, ls: parseFloat(cs.letterSpacing) || 0 };
        styleOf.set(parent, st);
        signature += `${st.font}|${st.tt}|${st.ls};`;
      }
      word.style = st;
    }
    if (signature === this.kernFont) return false;
    this.kernFont = signature;
    this.words.forEach((word, k) => {
      const { font, tt, ls } = word.style;
      const chars = word.chars;
      // Kerning against a following space (both sides) goes onto the last mask of the word.
      const nextWord = this.words[k + 1];
      const gap = word.el.nextSibling;
      const spaced = nextWord && nextWord.style === word.style && gap && gap.nodeType === 3 && /^\s+$/.test(gap.data) && nextWord.chars.length;
      for (let i = 0; i < chars.length; i += 1) {
        const a = cased(chars[i].text, tt);
        const w = textWidth(font, a);
        let margin = w + ls - Math.ceil((w + ls) * LAYOUT_UNIT) / LAYOUT_UNIT;
        const next = chars[i + 1];
        if (next) {
          const b = cased(next.text, tt);
          margin += textWidth(font, a + b) - w - textWidth(font, b);
        } else if (spaced) {
          const sp = textWidth(font, ' ');
          const b = cased(nextWord.chars[0].text, tt);
          margin += textWidth(font, `${a} `) - w - sp + (textWidth(font, ` ${b}`) - sp - textWidth(font, b));
        }
        chars[i].mask.style.marginInlineEnd = Math.abs(margin) > 0.001 ? `${margin.toFixed(4)}px` : '';
      }
    });
    return true;
  }

  /**
   * Take the line breaks from the plain text and pin them (IM 10: lines first, then characters).
   * For one synchronous layout a clone of the original markup stands in for the visual copy; a Range per
   * word reads where the plain text breaks (true kerning, text-wrap balance or pretty, inline markup).
   * Words are found in the same order as the splitter created them. Each row start then gets a
   * <br class="tx-br"> and the visual copy is set to nowrap, so per-character boxes (rounded to layout
   * units) can never move a word to another row than in the plain text.
   */
  pinRows() {
    for (const br of this.brs) br.remove();
    this.brs = [];
    const doc = this.el.ownerDocument;
    const plain = doc.createElement('span');
    plain.className = this.vis.classList.contains('tx-vis--block') ? 'tx-plain tx-plain--block' : 'tx-plain';
    for (const node of this.original) plain.append(node.cloneNode(true));
    const lineEls = this.lineSelector ? Array.from(plain.querySelectorAll(this.lineSelector)) : [];
    this.vis.classList.add('tx-off');
    this.el.append(plain);
    const found = [];
    const range = doc.createRange();
    const walker = doc.createTreeWalker(plain, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const group = lineEls.length ? lineEls.findIndex((le) => le.contains(node)) : -1;
      for (const m of node.data.matchAll(/[^ \t\n\r\f]+/g)) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rect = range.getClientRects()[0];
        found.push(rect ? { top: rect.top, height: rect.height, group } : null);
      }
    }
    plain.remove();
    this.vis.classList.remove('tx-off');
    this.vis.classList.remove('tx-vis--rows');
    if (found.length !== this.words.length) return;
    const starts = [];
    let lastTop = null;
    let lastGroup = null;
    found.forEach((f, i) => {
      if (!f) return;
      const newGroup = f.group !== lastGroup;
      const below = lastTop !== null && f.top > lastTop + f.height * 0.5;
      if (!newGroup && below) starts.push(this.words[i]);
      if (lastTop === null || newGroup || below) lastTop = f.top;
      lastGroup = f.group;
    });
    for (const word of starts) {
      const br = this.el.ownerDocument.createElement('br');
      br.className = 'tx-br';
      word.el.before(br);
      this.brs.push(br);
    }
    this.vis.classList.add('tx-vis--rows');
  }

  /**
   * Assign words to lines from the current layout. Returns true when the line breaks changed.
   * rows: visual lines. lines: what animations use (explicit line elements if any, else rows).
   * Uses offsetTop and offsetWidth, which ignore transforms, so it is safe during an animation.
   */
  measure() {
    this.applyKerning();
    this.pinRows();
    const rows = [];
    let row = null;
    let lastTop = 0;
    let lastGroup = -2;
    let lastParent = null;
    for (const word of this.words) {
      const el = word.el;
      if (!el.offsetParent && el.offsetWidth === 0 && el.offsetHeight === 0) continue;
      const top = el.offsetTop;
      const tol = Math.max(2, el.offsetHeight * 0.5);
      const newRow = !row || word.group !== lastGroup || el.offsetParent !== lastParent || top > lastTop + tol || top < lastTop - tol;
      if (newRow) {
        row = [];
        rows.push(row);
        lastTop = top;
      }
      lastGroup = word.group;
      lastParent = el.offsetParent;
      row.push(word);
    }
    this.rows = rows;
    if (this.lineEls.length) {
      this.lines = this.lineEls.map((el, i) => {
        const words = this.words.filter((w) => w.group === i);
        return { el, words, chars: words.flatMap((w) => w.chars) };
      });
    } else {
      this.lines = rows.map((words) => ({ el: null, words, chars: words.flatMap((w) => w.chars) }));
    }
    this.lines.forEach((line, i) => {
      for (const w of line.words) {
        w.line = i;
        for (const c of w.chars) c.line = i;
      }
    });
    const sig = rows.map((r) => r.length).join(',');
    const changed = sig !== this.signature;
    this.signature = sig;
    return changed;
  }

  /**
   * Measure how far the ink of this element's characters reaches outside the character box and set the
   * mask clearance (--tx-luft-o, --tx-luft-u in em) on the element. Returns the clearance in px and the
   * start offset (percent of the character box) that hides a character completely.
   */
  measureClearance() {
    const first = this.chars[0];
    if (!first) return null;
    const el = this.el;
    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const probe = el.ownerDocument.createElement('span');
    probe.className = 'tx-probe';
    first.inner.append(probe);
    const box = first.inner.getBoundingClientRect();
    const base = probe.getBoundingClientRect().top;
    probe.remove();
    // Box edges relative to the baseline, corrected for the current transform scale of the line.
    const scale = box.height && first.inner.offsetHeight ? box.height / first.inner.offsetHeight : 1;
    const ascBox = (base - box.top) / scale;
    const descBox = (box.bottom - base) / scale;
    const lineBox = first.inner.offsetHeight || box.height / scale;

    const ctx = canvas();
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const unique = Array.from(new Set(graphemes(transformed(this.text, cs.textTransform)))).join('');
    const m = ctx.measureText(unique || 'H');
    const safety = Math.max(1, fontSize * 0.02);
    const minTop = lengthPx(cs.getPropertyValue('--maske-luft-oben'), fontSize);
    const minBottom = lengthPx(cs.getPropertyValue('--maske-luft-unten'), fontSize);
    const top = Math.max(minTop, m.actualBoundingBoxAscent - ascBox + safety, 0);
    const bottom = Math.max(minBottom, m.actualBoundingBoxDescent - descBox + safety, 0);
    el.style.setProperty('--tx-luft-o', `${(top / fontSize).toFixed(4)}em`);
    el.style.setProperty('--tx-luft-u', `${(bottom / fontSize).toFixed(4)}em`);
    const startPercent = 100 * (1 + (top + bottom) / (lineBox || 1));
    this.clearance = { top, bottom, lineBox, startPercent, fontSize };
    return this.clearance;
  }

  /** Put the original markup back (module destroy, page transition clone). */
  restore() {
    this.el.replaceChildren(...this.original.map((n) => n.cloneNode(true)));
    this.el.style.removeProperty('--tx-luft-o');
    this.el.style.removeProperty('--tx-luft-u');
    this.words = [];
    this.chars = [];
    this.lines = [];
    this.rows = [];
  }
}

/** Split an element, or return null when it must not be split (see canSplit). */
export function splitText(el, options) {
  if (!canSplit(el)) return null;
  return new Split(el, options);
}
