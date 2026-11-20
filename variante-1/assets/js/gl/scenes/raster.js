/**
 * Scene "raster" (back layer, opaque): a measuring grid that paints its section's surface.
 *
 * Own replacement for the reference's paper scene (PLAN 5 no. 33: "starre Masstafeln mit Raster"), here as
 * the opaque background of S1. It paints the section's --fl-grund at once (the section is transparent only
 * while this scene draws), then fades its lines in (IM 8: background layer 0.5 s power2.out).
 * Lines: --li-linie, crossings: --li-rahmen, pointer glow: --ak-marke-still. All from the section's roles.
 * Movement: the grid lags the section a little while it scrolls (parallax) and leans towards the pointer.
 * Drawn directly into the layer (no render target): the world sets viewport and scissor, the shader works
 * in device pixels relative to the closing surface, so 1 px lines stay 1 px at every pixel ratio.
 */
import { readRoles, toColour, over } from '../tokens.js';
import { resolveEase } from '../../motion/ease.js';
import { TIMING } from '../../motion/curves.js';

const ROLES = ['--fl-grund', '--li-linie', '--li-rahmen', '--ak-marke-still'];
const MINOR = 24;
const MAJOR = 120;
const PARALLAX = 48;
const LEAN = 6;
const GLOW_RADIUS = 320;

const VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uBg;
uniform vec3 uLine;
uniform vec3 uMajor;
uniform vec3 uGlow;
uniform vec2 uOrigin;
uniform vec2 uSize;
uniform float uDpr;
uniform vec2 uOffset;
uniform vec2 uPointer;
uniform float uGlowOn;
uniform float uFade;

float lineMask(float coord, float spacing) {
  float d = abs(fract(coord / spacing + 0.5) - 0.5) * spacing * uDpr;
  return clamp(0.5 * uDpr + 0.5 - d, 0.0, 1.0);
}

void main() {
  vec2 dev = gl_FragCoord.xy - uOrigin;
  vec2 css = vec2(dev.x, uSize.y * uDpr - dev.y) / uDpr;
  vec2 g = css + uOffset;
  float minor = max(lineMask(g.x, ${MINOR.toFixed(1)}), lineMask(g.y, ${MINOR.toFixed(1)}));
  float major = max(lineMask(g.x, ${MAJOR.toFixed(1)}), lineMask(g.y, ${MAJOR.toFixed(1)}));
  vec2 m = abs(fract(g / ${MAJOR.toFixed(1)} + 0.5) - 0.5) * ${MAJOR.toFixed(1)};
  float cross = step(min(m.x, m.y), 0.5 + 0.5 / uDpr) * step(max(m.x, m.y), 6.0);
  float glow = uGlowOn * smoothstep(${GLOW_RADIUS.toFixed(1)}, 0.0, distance(css, uPointer));
  vec3 c = mix(uBg, uGlow, glow * 0.6 * uFade);
  c = mix(c, uLine, minor * 0.45 * uFade);
  c = mix(c, uLine, major * uFade);
  c = mix(c, uMajor, cross * uFade);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export default {
  name: 'raster',
  layer: 'hinten',
  kind: 'direct',

  create({ THREE, el, store }) {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uBg: { value: new THREE.Color() },
      uLine: { value: new THREE.Color() },
      uMajor: { value: new THREE.Color() },
      uGlow: { value: new THREE.Color() },
      uOrigin: { value: new THREE.Vector2() },
      uSize: { value: new THREE.Vector2(1, 1) },
      uDpr: { value: 1 },
      uOffset: { value: new THREE.Vector2() },
      uPointer: { value: new THREE.Vector2(-1e4, -1e4) },
      uGlowOn: { value: 0 },
      uFade: { value: 0 },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false });
    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    scene.add(quad);

    const fadeEase = resolveEase(TIMING.gl.backFadeEase);
    let start = null;
    const lean = { x: 0, y: 0 };
    let last = null;
    let version = 0;

    function retheme() {
      const r = readRoles(el, ROLES);
      toColour(THREE, uniforms.uBg.value, r['--fl-grund'], 0.95);
      toColour(THREE, uniforms.uLine.value, r['--li-linie'], 0.8);
      toColour(THREE, uniforms.uMajor.value, r['--li-rahmen'], 0.7);
      // --ak-marke-still may be translucent (inverse roles): paint it over the surface as CSS would.
      toColour(THREE, uniforms.uGlow.value, over(r['--ak-marke-still'], r['--fl-grund']), 0.9);
      version += 1;
      return r;
    }
    retheme();

    return {
      scene,
      camera,
      retheme,
      reset() {
        start = null;
        last = null;
      },
      /** Per frame. The surface is in device px with a top-left origin; f.bh is the buffer height. */
      update(f, rec) {
        const s = rec.surface;
        if (start === null && store.get('intro:done')) start = f.t;
        uniforms.uFade.value = start === null ? 0 : fadeEase(Math.min(1, (f.t - start) / TIMING.gl.backFade));
        uniforms.uDpr.value = f.dpr;
        uniforms.uOrigin.value.set(s.x, f.bh - (s.y + s.h));
        uniforms.uSize.value.set(s.w / f.dpr, s.h / f.dpr);
        // Parallax: while the element scrolls past, the grid moves a little slower than the HTML.
        const travel = rec.rect.height + f.vh;
        const p = travel > 0 ? (f.vh - rec.rect.top) / travel : 0;
        const k = 1 - Math.pow(1 - TIMING.gl.pointerApproach, f.dt * 60);
        const on = f.features.pointer && f.pointer.inside;
        lean.x += ((on ? f.pointer.x : 0) - lean.x) * k;
        lean.y += ((on ? f.pointer.y : 0) - lean.y) * k;
        uniforms.uOffset.value.set(lean.x * LEAN, p * PARALLAX + lean.y * LEAN);
        uniforms.uGlowOn.value = on ? 1 : 0;
        if (on) uniforms.uPointer.value.set(f.pointer.cssX - s.x / f.dpr, f.pointer.cssY - s.y / f.dpr);
        const sig = [uniforms.uFade.value, uniforms.uOffset.value.x, uniforms.uOffset.value.y, uniforms.uGlowOn.value, uniforms.uPointer.value.x, uniforms.uPointer.value.y, f.dpr, version];
        let moved = !last;
        if (last) for (let i = 0; i < sig.length; i += 1) if (Math.abs(sig[i] - last[i]) > 1e-4) moved = true;
        last = sig;
        return moved;
      },
      info() {
        return { fade: uniforms.uFade.value };
      },
      dispose() {
        geometry.dispose();
        material.dispose();
        scene.clear();
      },
    };
  },
};
