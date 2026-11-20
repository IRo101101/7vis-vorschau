/**
 * WebGL world of spike S1 (PLAN 5 no. 28, PLAN 8 S1, IM 13.1). Loaded only when a page has a scene, WebGL 2
 * works and motion is welcome (modules/webgl.js decides). Imports three.js, so nothing else may import it.
 *
 * Architecture:
 *   - One renderer on one drawing surface (OffscreenCanvas when available, else a detached canvas). No
 *     antialiasing and no depth buffer on the surface; scenes that need them get their own render target.
 *   - Two visible canvases: "vorn" above the HTML (transparent scenes), "hinten" behind it (opaque
 *     scenes). Each frame the surface draws one layer and hands the image over (ImageBitmap to a
 *     bitmaprenderer context, or drawImage to a 2D context as the fallback). A layer without a scene on
 *     screen is cleared once and then left alone.
 *   - Scenes are bound to DOM elements by markup: data-scene="<name>" data-scene-layer="vorn|hinten".
 *     Each scene draws into its closing surface (gl/surface.js): the element's rectangle, one viewport at
 *     most, read in the render lane of the one frame loop, i.e. after Lenis moved the page in the same
 *     frame. Section and scene therefore move in the same frame.
 *   - Render windows: a scene works only while its element is within half a viewport of the screen. With no
 *     window open the world removes its frame callback: no draw call, no handover, no layout read.
 *   - While a back-layer scene draws, its element carries data-scene-live and turns transparent (CSS); the
 *     attribute is set and cleared in the same frame as the canvas changes, so there is never a gap.
 *   - Freeze (store 'webgl:freeze'): the last images stay, nothing renders. On thaw the markers are scanned
 *     again: scenes whose element left the document are disposed, new markers are bound and precompiled.
 *   - Context loss: rendering stops, stills come back, the canvases are cleared; on restore three.js
 *     rebuilds its state, the world precompiles again and resumes.
 *   - Level (gl/level.js) decides back layer and multisampling; the frame-time guard reports slow frames
 *     through onSlow, the module lowers the level.
 */
import * as THREE from '../../vendor/three-0.180.0/three.module.min.js';
import { closingSurface, toGL } from './surface.js';
import { features as levelFeatures, pixelRatio, FrameGuard } from './level.js';
import { TIMING } from '../motion/curves.js';
import figur from './scenes/figur.js';
import raster from './scenes/raster.js';

const SCENES = { figur, raster };
const LAYERS = ['hinten', 'vorn'];
let recordSeq = 0;

const COMPOSITE_VERTEX = /* glsl */ `
uniform vec2 uvScale;
varying vec2 vUv;
void main() {
  vUv = uv * uvScale;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float opacity;
varying vec2 vUv;
void main() {
  vec4 texel = texture2D(map, vUv);
  gl_FragColor = texel * opacity;
  #include <colorspace_fragment>
}
`;

const SURFACE_ATTRIBUTES = {
  alpha: true,
  antialias: false,
  depth: false,
  stencil: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
};

function makeSurface() {
  if (typeof OffscreenCanvas === 'function') {
    const off = new OffscreenCanvas(1, 1);
    const gl = off.getContext('webgl2', SURFACE_ATTRIBUTES);
    if (gl && typeof off.transferToImageBitmap === 'function') return { canvas: off, gl, offscreen: true };
  }
  const el = document.createElement('canvas');
  const gl = el.getContext('webgl2', SURFACE_ATTRIBUTES);
  return gl ? { canvas: el, gl, offscreen: false } : null;
}

function makeOutput(canvas, offscreen) {
  const bitmap = offscreen ? canvas.getContext('bitmaprenderer') : null;
  if (bitmap) return { canvas, kind: 'bitmaprenderer', ctx: bitmap };
  return { canvas, kind: '2d', ctx: canvas.getContext('2d') };
}

export class World {
  /**
   * @param {{ front: HTMLCanvasElement, back: HTMLCanvasElement, store, frame, visibility, clock }} o
   */
  constructor({ front, back, store, frame, visibility, clock }) {
    this.store = store;
    this.frame = frame;
    this.visibility = visibility;
    this.clock = clock;
    this.canvases = { vorn: front, hinten: back };
    this.level = 'voll';
    this.viewport = store.get('viewport');
    this.touch = false;
    this.features = levelFeatures(this.level, this.viewport);
    this.records = new Map();
    this.frozen = false;
    this.lost = false;
    this.disposed = false;
    this.offTick = null;
    this.offs = [];
    this.fed = { vorn: false, hinten: false };
    this.size = { vw: 0, vh: 0, dpr: 1, bw: 0, bh: 0 };
    this.pointer = { x: 0, y: 0, cssX: -1e4, cssY: -1e4, inside: false };
    this.guard = new FrameGuard();
    this.onSlow = null;
    this.onState = null;
    this.counters = { frames: 0, draws: 0, handovers: 0, skips: 0, clears: 0, sleeps: 0, wakes: 0, lost: 0, restored: 0, compiles: 0 };
    this.drawnSet = { vorn: '', hinten: '' };
    this.force = { vorn: true, hinten: true };
    this.lastFrame = null;
    this.frameTimes = [];
  }

  /** Create renderer and outputs. Throws when WebGL 2 is not available. */
  init() {
    const s = makeSurface();
    if (!s) throw new Error('[v1:gl] WebGL 2 not available');
    this.surface = s;
    this.renderer = new THREE.WebGLRenderer({ canvas: s.canvas, context: s.gl, ...SURFACE_ATTRIBUTES });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0, 0);
    this.loseExt = s.gl.getExtension('WEBGL_lose_context');
    this.outputs = {
      vorn: makeOutput(this.canvases.vorn, s.offscreen),
      hinten: makeOutput(this.canvases.hinten, s.offscreen),
    };

    // Composite pass: a quad drawn into the closing surface, textured with a scene's render target.
    this.quadGeometry = new THREE.PlaneGeometry(2, 2);
    this.quadMaterial = new THREE.ShaderMaterial({
      uniforms: { map: { value: null }, opacity: { value: 1 }, uvScale: { value: new THREE.Vector2(1, 1) } },
      vertexShader: COMPOSITE_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new THREE.Mesh(this.quadGeometry, this.quadMaterial);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const lost = (e) => this.handleLost(e);
    const restored = () => this.handleRestored();
    s.canvas.addEventListener('webglcontextlost', lost);
    s.canvas.addEventListener('webglcontextrestored', restored);
    this.offs.push(() => {
      s.canvas.removeEventListener('webglcontextlost', lost);
      s.canvas.removeEventListener('webglcontextrestored', restored);
    });

    const move = (e) => {
      const { vw, vh } = this.size;
      if (!vw || !vh) return;
      this.pointer.cssX = e.clientX;
      this.pointer.cssY = e.clientY;
      this.pointer.x = (e.clientX / vw) * 2 - 1;
      this.pointer.y = (e.clientY / vh) * 2 - 1;
      this.pointer.inside = true;
    };
    const leave = () => {
      this.pointer.inside = false;
    };
    addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    this.offs.push(() => {
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
    });

    this.offs.push(this.store.on('viewport', (v) => {
      this.viewport = v;
      this.refeature();
    }));
    this.offs.push(this.store.on('ci', () => this.retheme()));
    this.offs.push(this.store.on('layout:change', () => this.retheme()));
    // Page transition (spike S3): the new view covers the screen, both layers are emptied.
    this.offs.push(this.store.on('transition:covered', () => this.clearAll()));
    return this;
  }

  /** Touch input seen: back-layer scenes give way to their CSS surfaces (gl/level.js features). */
  setTouch(on) {
    if (this.touch === !!on) return;
    this.touch = !!on;
    this.refeature();
  }

  refeature() {
    this.features = levelFeatures(this.level, this.viewport, { touch: this.touch });
    this.guard.reset();
    this.redraw();
    this.wake();
  }

  /** Set the quality level ('einfach' or 'voll'; 'statisch' is handled by disposing the world). */
  setLevel(level) {
    if (level === this.level) return;
    this.level = level;
    this.features = levelFeatures(level, this.viewport, { touch: this.touch });
    for (const rec of this.records.values()) {
      if (rec.rt && rec.rt.samples !== this.features.samples) {
        rec.rt.dispose();
        rec.rt = null;
      }
    }
    this.guard.reset();
    this.redraw();
    this.wake();
  }

  /** Bind new scene markers, dispose scenes whose element left the document. Returns a promise for compile. */
  scan(root = document) {
    for (const [el, rec] of [...this.records]) {
      if (!el.isConnected) this.unbind(rec);
    }
    const jobs = [];
    for (const el of root.querySelectorAll('[data-scene]')) {
      if (this.records.has(el)) continue;
      const rec = this.bind(el);
      if (rec) jobs.push(rec.ready);
    }
    return Promise.all(jobs);
  }

  bind(el) {
    const name = el.getAttribute('data-scene');
    const def = SCENES[name];
    if (!def) {
      console.warn(`[v1:gl] unknown scene "${name}"`);
      return null;
    }
    const layer = el.getAttribute('data-scene-layer') === 'hinten' ? 'hinten' : el.getAttribute('data-scene-layer') === 'vorn' ? 'vorn' : def.layer;
    const inst = def.create({ THREE, el, store: this.store });
    // Markup may carry a stale flag (a copied view): the element is opaque until this scene draws.
    for (const node of [el, ...el.querySelectorAll(`[data-scene-still="${name}"]`)]) node.removeAttribute('data-scene-live');
    const rec = {
      id: ++recordSeq,
      el,
      name,
      layer,
      kind: def.kind,
      inst,
      rt: null,
      open: false,
      live: false,
      compiled: false,
      rect: null,
      surface: null,
      stills: [...el.querySelectorAll(`[data-scene-still="${name}"]`)],
      ready: null,
      offWatch: null,
    };
    this.records.set(el, rec);
    rec.offWatch = this.visibility.watch(el, ({ visible }) => {
      rec.open = visible;
      this.wake();
    }, { rootMargin: TIMING.gl.windowMargin });
    rec.ready = this.compile(rec);
    return rec;
  }

  unbind(rec) {
    this.setLive(rec, false);
    if (rec.offWatch) rec.offWatch();
    if (rec.rt) rec.rt.dispose();
    rec.rt = null;
    rec.inst.dispose();
    this.records.delete(rec.el);
  }

  /** Precompile a scene's programs for the target it renders into (IM 13.4: shaders compiled up front). */
  async compile(rec) {
    rec.compiled = false;
    const r = this.renderer;
    try {
      if (rec.kind === 'target') {
        this.ensureTarget(rec, 4, 4);
        r.setRenderTarget(rec.rt);
      } else {
        r.setRenderTarget(null);
      }
      const job = r.compileAsync(rec.inst.scene, rec.inst.camera);
      r.setRenderTarget(null);
      if (rec.kind === 'target') {
        r.compile(this.quadScene, this.quadCamera);
      }
      await job;
      this.counters.compiles += 1;
    } catch (err) {
      if (!this.lost) console.warn('[v1:gl] precompile failed, scene compiles on first draw', err);
    }
    if (this.disposed || !this.records.has(rec.el)) return;
    rec.compiled = true;
    this.wake();
  }

  /**
   * Render target of a scene, at least w x h. Sizes are rounded up to 64 px steps and only grow (or shrink
   * below half), so a moving figure does not reallocate its multisampled buffers every frame.
   */
  ensureTarget(rec, w, h) {
    const samples = this.features.samples;
    const step = (n) => Math.max(64, Math.ceil(n / 64) * 64);
    if (rec.rt && rec.rt.samples !== samples) {
      rec.rt.dispose();
      rec.rt = null;
    }
    if (!rec.rt) {
      rec.rt = new THREE.WebGLRenderTarget(step(w), step(h), {
        samples,
        depthBuffer: true,
        stencilBuffer: false,
        colorSpace: THREE.SRGBColorSpace,
        type: THREE.UnsignedByteType,
        generateMipmaps: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
      });
      return rec.rt;
    }
    let tw = rec.rt.width;
    let th = rec.rt.height;
    if (tw < w || tw > step(w) * 2) tw = step(w);
    if (th < h || th > step(h) * 2) th = step(h);
    if (tw !== rec.rt.width || th !== rec.rt.height) rec.rt.setSize(tw, th);
    return rec.rt;
  }

  retheme() {
    for (const rec of this.records.values()) rec.inst.retheme();
    this.redraw();
  }

  /** Draw both layers in the next frame even if no scene moved (colours, level or size changed). */
  redraw() {
    this.force.vorn = true;
    this.force.hinten = true;
  }

  freeze(on) {
    this.frozen = !!on;
    if (this.frozen) {
      this.sleep(false);
      return Promise.resolve();
    }
    const job = this.scan();
    this.wake();
    return job;
  }

  /** Should the frame callback run? */
  wanted() {
    if (this.disposed || this.frozen || this.lost) return false;
    for (const rec of this.records.values()) if (rec.open && rec.compiled && this.allowed(rec)) return true;
    return false;
  }

  allowed(rec) {
    return rec.layer === 'vorn' ? this.features.front : this.features.back;
  }

  wake() {
    if (this.wanted()) {
      if (!this.offTick) {
        this.offTick = this.frame.add((t, dt) => this.tick(t, dt), 'render');
        this.guard.reset();
        this.redraw();
        this.drewLast = false;
        this.counters.wakes += 1;
      }
    } else if (this.offTick) {
      this.sleep(!this.frozen);
    }
  }

  /** Remove the frame callback. clear: empty both layers and give the sections back their CSS surface. */
  sleep(clear) {
    if (this.offTick) {
      this.offTick();
      this.offTick = null;
      this.counters.sleeps += 1;
    }
    if (clear) this.clearAll();
  }

  clearAll() {
    for (const layer of LAYERS) this.clearLayer(layer);
    for (const rec of this.records.values()) this.setLive(rec, false);
  }

  clearLayer(layer) {
    if (!this.fed[layer] || !this.outputs) return;
    const out = this.outputs[layer];
    if (out.kind === 'bitmaprenderer') out.ctx.transferFromImageBitmap(null);
    else out.ctx.clearRect(0, 0, out.canvas.width, out.canvas.height);
    this.fed[layer] = false;
    this.counters.clears += 1;
  }

  setLive(rec, on) {
    if (rec.live === on) return;
    rec.live = on;
    for (const el of [rec.el, ...rec.stills]) {
      if (on) el.setAttribute('data-scene-live', '');
      else el.removeAttribute('data-scene-live');
    }
  }

  measure() {
    const root = document.documentElement;
    const vw = root.clientWidth;
    const vh = root.clientHeight;
    const dpr = pixelRatio(devicePixelRatio);
    const bw = Math.round(vw * dpr);
    const bh = Math.round(vh * dpr);
    const s = this.size;
    if (s.bw !== bw || s.bh !== bh) {
      this.renderer.setSize(bw, bh, false);
      for (const layer of LAYERS) {
        const c = this.outputs[layer].canvas;
        c.width = bw;
        c.height = bh;
        this.fed[layer] = false;
      }
      this.guard.reset();
      this.redraw();
    }
    s.vw = vw;
    s.vh = vh;
    s.dpr = dpr;
    s.bw = bw;
    s.bh = bh;
  }

  tick(t, dtRaw) {
    if (this.lost || this.disposed) return;
    // The guard judges frames that follow a drawn frame: idle frames say nothing about the GPU.
    if (this.drewLast) {
      const verdict = this.guard.push(dtRaw * 1000, this.clock.ms());
      this.frameTimes.push(dtRaw * 1000);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
      if (verdict === 'down' && this.onSlow) this.onSlow(this.guard.last);
      if (this.disposed || !this.offTick) return;
    }
    const handovers = this.counters.handovers;

    const dt = Math.min(Math.max(0, dtRaw), TIMING.gl.dtMax);
    this.measure();
    const { vw, vh, dpr, bw, bh } = this.size;
    const f = { t, dt, vw, vh, dpr, bw, bh, features: this.features, pointer: this.pointer };
    this.counters.frames += 1;

    // One layout read per frame: all rectangles first, after Lenis moved the page in the scroll lane.
    const active = [];
    for (const rec of this.records.values()) {
      if (!rec.open || !rec.compiled || !this.allowed(rec)) {
        this.setLive(rec, false);
        continue;
      }
      rec.rect = rec.el.getBoundingClientRect();
      rec.surface = closingSurface(rec.rect, vw, vh, dpr);
      active.push(rec);
    }
    const record = { frame: this.counters.frames, t, vw, vh, dpr, scenes: [] };
    for (const layer of LAYERS) this.drawLayer(layer, active.filter((r) => r.layer === layer), f, record);
    this.lastFrame = record;
    this.drewLast = this.counters.handovers !== handovers;
  }

  drawLayer(layer, list, f, record) {
    const r = this.renderer;
    const shown = list.filter((rec) => rec.surface.visible);
    // A layer is drawn only when its picture changes: a scene moved, its surface moved, the set of scenes
    // on screen changed, or the layer was emptied. An idle hero costs no draw call and no handover.
    let dirty = !this.fed[layer] || this.force[layer];
    for (const rec of list) {
      if (rec.inst.update(f, rec)) dirty = true;
      const s = rec.surface;
      const key = `${s.x},${s.y},${s.w},${s.h},${s.clip.x},${s.clip.y},${s.clip.w},${s.clip.h},${s.visible}`;
      if (key !== rec.drawnKey) dirty = true;
      rec.drawnKey = key;
    }
    const set = shown.map((rec) => rec.name).join('|');
    if (set !== this.drawnSet[layer]) dirty = true;
    this.drawnSet[layer] = set;
    if (!shown.length) {
      this.clearLayer(layer);
      for (const rec of list) this.setLive(rec, false);
      return;
    }
    if (!dirty) {
      this.counters.skips += 1;
      for (const rec of shown) this.pushRecord(record, rec, layer, f);
      return;
    }
    r.setRenderTarget(null);
    r.setScissorTest(false);
    r.setViewport(0, 0, f.bw, f.bh);
    r.setClearColor(0, 0);
    r.clear(true, false, false);
    for (const rec of shown) {
      const s = rec.surface;
      if (rec.kind === 'target') {
        // Render only the scene's screen box (bounds) into its target, then place that box in the surface.
        const box = rec.inst.bounds ? rec.inst.bounds(s) : { x: 0, y: 0, w: s.w, h: s.h };
        if (!box) continue;
        const rt = this.ensureTarget(rec, box.w, box.h);
        const cam = rec.inst.camera;
        cam.setViewOffset(s.w, s.h, box.x, box.y, box.w, box.h);
        rt.viewport.set(0, 0, box.w, box.h);
        r.setRenderTarget(rt);
        r.setClearColor(0, 0);
        r.clear(true, true, false);
        r.render(rec.inst.scene, cam);
        r.setRenderTarget(null);
        const placed = { x: s.x + box.x, y: s.y + box.y, w: box.w, h: box.h };
        const cx0 = Math.max(placed.x, s.clip.x);
        const cy0 = Math.max(placed.y, s.clip.y);
        const cx1 = Math.min(placed.x + placed.w, s.clip.x + s.clip.w);
        const cy1 = Math.min(placed.y + placed.h, s.clip.y + s.clip.h);
        if (cx1 <= cx0 || cy1 <= cy0) continue;
        const v = toGL(placed, f.bh);
        const c = toGL({ x: cx0, y: cy0, w: cx1 - cx0, h: cy1 - cy0 }, f.bh);
        r.setViewport(v.x, v.y, v.w, v.h);
        r.setScissor(c.x, c.y, c.w, c.h);
        r.setScissorTest(true);
        this.quadMaterial.uniforms.map.value = rt.texture;
        this.quadMaterial.uniforms.opacity.value = rec.inst.opacity;
        this.quadMaterial.uniforms.uvScale.value.set(box.w / rt.width, box.h / rt.height);
        r.render(this.quadScene, this.quadCamera);
        r.setScissorTest(false);
      } else {
        // Opaque back-layer scenes bleed one device pixel past their clip: the neighbours of the section
        // are painted above the back layer anyway, so sub-pixel rounding can never open a gap.
        const bleed = layer === 'hinten' ? 1 : 0;
        const x0 = Math.max(0, s.clip.x - bleed);
        const y0 = Math.max(0, s.clip.y - bleed);
        const x1 = Math.min(f.bw, s.clip.x + s.clip.w + bleed);
        const y1 = Math.min(f.bh, s.clip.y + s.clip.h + bleed);
        const c = toGL({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, f.bh);
        r.setViewport(c.x, c.y, c.w, c.h);
        r.setScissor(c.x, c.y, c.w, c.h);
        r.setScissorTest(true);
        r.render(rec.inst.scene, rec.inst.camera);
        r.setScissorTest(false);
      }
      this.counters.draws += 1;
      this.pushRecord(record, rec, layer, f);
    }
    this.handover(layer);
    this.force[layer] = false;
    for (const rec of list) this.setLive(rec, shown.includes(rec));
  }

  /** Measurement record of one scene in this frame (tests compare it with the DOM, CONTRACT 11). */
  pushRecord(record, rec, layer, f) {
    const s = rec.surface;
    record.scenes.push({
      id: rec.id,
      name: rec.name,
      layer,
      rectTop: rec.rect.top,
      rectBottom: rec.rect.bottom,
      surfaceTop: s.css.y,
      surfaceHeight: s.css.h,
      clipTop: s.clip.y / f.dpr,
      clipBottom: (s.clip.y + s.clip.h) / f.dpr,
    });
  }

  /** Give the finished image of one layer to its visible canvas. */
  handover(layer) {
    const out = this.outputs[layer];
    const surface = this.surface.canvas;
    if (out.kind === 'bitmaprenderer') {
      out.ctx.transferFromImageBitmap(surface.transferToImageBitmap());
    } else {
      out.ctx.globalCompositeOperation = 'copy';
      out.ctx.drawImage(surface, 0, 0);
    }
    this.fed[layer] = true;
    this.counters.handovers += 1;
  }

  handleLost(e) {
    if (e && e.preventDefault) e.preventDefault();
    this.lost = true;
    this.counters.lost += 1;
    this.sleep(false);
    this.clearAll();
    for (const rec of this.records.values()) rec.compiled = false;
    if (this.onState) this.onState('verloren');
  }

  handleRestored() {
    this.lost = false;
    this.counters.restored += 1;
    for (const rec of this.records.values()) {
      if (rec.rt) {
        rec.rt.dispose();
        rec.rt = null;
      }
    }
    if (this.onState) this.onState('live');
    return Promise.all([...this.records.values()].map((rec) => this.compile(rec)));
  }

  /** Review and test aid: simulate a context loss (and its restore) through WEBGL_lose_context. */
  loseContext() {
    if (this.loseExt && !this.lost) this.loseExt.loseContext();
  }

  restoreContext() {
    if (this.loseExt && this.lost) this.loseExt.restoreContext();
  }

  reset() {
    for (const rec of this.records.values()) rec.inst.reset();
  }

  stats() {
    const info = this.renderer ? this.renderer.info : null;
    const times = [...this.frameTimes].sort((a, b) => a - b);
    const q = (p) => (times.length ? Math.round(times[Math.min(times.length - 1, Math.floor(p * times.length))] * 10) / 10 : null);
    return {
      level: this.level,
      features: this.features,
      frozen: this.frozen,
      lost: this.lost,
      ticking: !!this.offTick,
      offscreen: this.surface ? this.surface.offscreen : null,
      output: this.outputs ? this.outputs.vorn.kind : null,
      size: { ...this.size },
      fed: { ...this.fed },
      counters: { ...this.counters },
      frameMs: { median: q(0.5), p95: q(0.95), samples: times.length },
      guardMedian: this.guard.last,
      memory: info ? { ...info.memory } : null,
      programs: info && info.programs ? info.programs.length : null,
      scenes: [...this.records.values()].map((rec) => ({
        id: rec.id,
        name: rec.name,
        layer: rec.layer,
        open: rec.open,
        live: rec.live,
        compiled: rec.compiled,
        samples: rec.rt ? rec.rt.samples : null,
        ...rec.inst.info(),
      })),
      lastFrame: this.lastFrame,
    };
  }

  dispose() {
    if (this.disposed) return;
    this.sleep(true);
    this.disposed = true;
    for (const rec of [...this.records.values()]) this.unbind(rec);
    for (const off of this.offs.splice(0)) off();
    this.quadGeometry.dispose();
    this.quadMaterial.dispose();
    this.renderer.dispose();
    // Free the GPU memory now; the world is gone, so the loss is final (listeners are already removed).
    if (this.loseExt) this.loseExt.loseContext();
    this.renderer = null;
    this.outputs = null;
  }
}
