/**
 * Scene "figur" (front layer, transparent): the hero figure of answer 3a, a bean that becomes a puck.
 *
 * Transform chain of IM 13.3: seven nested groups, each effect moves only its own group, so they never
 * fight (PLAN 5 no. 29):
 *   auftritt   entrance: rises from enterDrop below, uprights from enterTilt around the view axis
 *   position   scroll scrub, half 1 (hero is covered): moves aside and up, shrinks (composition below)
 *   maus       pointer tilt (up to mouseMax rad, smoothed) plus the scroll-speed spring (nod and lag)
 *   drehung    scroll scrub turn: 351 deg in half 1, on to 540 deg in half 2 (phones: 360 deg)
 *   ziehen     dragging the figure ('figur:ziehen' from modules/figure-grip.js, table motion/drag.js)
 *   wechsel    force change: a full turn when 'slider:index' changes, not after a drag (IM 13.3, S2)
 *   basis      base pose of the reference (y -22.5 deg, x 12 deg)
 * The beans (group "bohnen", desktop only) hang below "position": they move aside with the figure but do
 * not turn with it, as the ingredients around the reference's can.
 *
 * Composition (data-figur-lage on the scene element):
 *   s1     the spike S1 probe page: centred figure, scroll values in scene units (unchanged since S1)
 *   start  the home page (stage 3), measured in the reference's WebGL recordings: centred in the lower half
 *          of the hero and cut by the bottom edge, then up and to the right into the slider at 0.9 of its
 *          length (phones: centred, 0.6); values as fractions of the viewport in TIMING.figure.start
 *
 * State per force (FRAGEN 3a, Drehbuch section 2): form FORM_BY_FORCE (01 bean, 02 half way, 03 to 07 puck,
 * 07 without a process of its own) and the colour of the force (role --kr-N drawn towards --kr-4 by
 * TIMING.figure.start.tint). Without a slider: the review value 'figur:form', colour --kr-4 to --kr-6 (S1).
 * A change shows the new state inside a circle in screen space that opens from (50 %, 66 %) to the farthest
 * corner between 0.5 s and 2.0 s, with a rough, noisy edge: the reference's label change (IM 13.3), here
 * two copies of the figure, the old one kept outside the circle, the new one inside.
 *
 * Store: reads 'intro:done', 'slider:index', 'figur:form', 'figur:ziehen'; writes 'figur:rahmen'
 * ({ x, y, r } in CSS px of the viewport: the circle the drag handle follows; null when not shown).
 * Colours: role tokens of the scene element (--kr-1 to --kr-7, light from --fl-erhoben, shade from
 * --tx-leise, rim from --ak-marke).
 */
import { beanPuckGeometry } from '../bohne-puck.js';
import { readRoles, toColour } from '../tokens.js';
import { progress } from '../surface.js';
import { resolveEase } from '../../motion/ease.js';
import { TIMING } from '../../motion/curves.js';
import { DRAG, dragAngle } from '../../motion/drag.js';

const F = TIMING.figure;
const P = F.start;
const B = P.beans;
const KR = ['--kr-1', '--kr-2', '--kr-3', '--kr-4', '--kr-5', '--kr-6', '--kr-7'];
const ROLES = [...KR, '--fl-erhoben', '--tx-leise', '--ak-marke'];
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
// Scene scale of the S1 probe page: bean 0.18 units long, camera 0.7 units away (visible height 0.375).
const SIZE = 0.09;
const DISTANCE = 0.7;
// Model orientation: the figure lies with its front face (cut of the bean, top of the puck) turned up
// towards the camera, so the puck reads as a puck and not as a coin.
const LIE = -38 * DEG;
const GROUPS = ['auftritt', 'position', 'maus', 'drehung', 'ziehen', 'wechsel', 'basis'];
// Form per force 01 to 07 (index 0 to 6): the bean is roasted (01), ground (02), compacted into the puck (03).
// From 03 on the puck stays; at 07 the figure shows no process (W 03: Wirkprinzip vertraulich).
export const FORM_BY_FORCE = Object.freeze([0, 0.5, 1, 1, 1, 1, 1]);

/** Target form from the store: the force slider wins, the review value is the fallback. */
export function formTarget(store) {
  const s = store.get('slider:index');
  if (s && Number.isInteger(s.index)) return FORM_BY_FORCE[Math.min(FORM_BY_FORCE.length - 1, Math.max(0, s.index))];
  return Math.min(1, Math.max(0, Number(store.get('figur:form')) || 0));
}

const approach = (k, dt) => 1 - Math.pow(1 - k, dt * 60);
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const mix = (a, b, k) => a + (b - a) * k;

/** Small deterministic random source (positions of the beans must not change between page loads). */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* Iris in screen space (fragment shader): keep the fragment inside (side +1) or outside (side -1) of a
   circle with a rough edge; side 0 keeps everything. Coordinates are device px of the closing surface with
   the origin top left; the figure renders only its screen box, so the box offset maps gl_FragCoord. */
const IRIS_PARS = /* glsl */ `
uniform vec4 uIrisBox;
uniform vec3 uIris;
uniform vec2 uIrisEdge;
uniform float uIrisSide;
float irisHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float irisNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(irisHash(i), irisHash(i + vec2(1.0, 0.0)), u.x), mix(irisHash(i + vec2(0.0, 1.0)), irisHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void irisClip() {
  if (uIrisSide == 0.0) return;
  vec2 p = vec2(uIrisBox.x + gl_FragCoord.x, uIrisBox.y + uIrisBox.w - gl_FragCoord.y);
  float n = irisNoise(p / 46.0) * 0.65 + irisNoise(p / 13.0) * 0.35;
  float d = length(p - uIris.xy) + (n - 0.5) * 2.0 * uIrisEdge.y;
  float inside = 1.0 - smoothstep(uIris.z - uIrisEdge.x, uIris.z + uIrisEdge.x, d);
  float keep = uIrisSide > 0.0 ? inside : 1.0 - inside;
  if (keep < irisHash(p * 1.37 + 17.0)) discard;
}
`;

function irisMaterial(THREE) {
  const uniforms = {
    uIrisBox: { value: new THREE.Vector4(0, 0, 1, 1) },
    uIris: { value: new THREE.Vector3(0, 0, 0) },
    uIrisEdge: { value: new THREE.Vector2(1, 0) },
    uIrisSide: { value: 0 },
  };
  // Double sided: the deep centre cut of the bean folds the surface over itself; back faces fill the fold
  // instead of leaving holes (the flicker of the cut noted in S1).
  const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${IRIS_PARS}`)
      .replace('void main() {', 'void main() {\n  irisClip();');
  };
  material.customProgramCacheKey = () => 'v1-iris';
  material.userData.iris = uniforms;
  return material;
}

export default {
  name: 'figur',
  layer: 'vorn',
  kind: 'target',

  create({ THREE, el, store }) {
    const lage = el.getAttribute('data-figur-lage') === 'start' ? 'start' : 's1';
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(F.fov, 1, 0.01, 10);
    camera.position.set(0, 0, DISTANCE);
    camera.lookAt(0, 0, 0);

    const g = {};
    let parent = scene;
    for (const name of GROUPS) {
      const group = new THREE.Group();
      group.name = name;
      parent.add(group);
      parent = group;
      g[name] = group;
    }
    g.basis.rotation.set(F.baseTiltX * DEG, F.baseTiltY * DEG, 0);

    // Two copies of the figure for the iris: "neu" shows the current state, "alt" the previous one.
    const geometry = beanPuckGeometry(THREE);
    const meshes = {};
    for (const name of ['neu', 'alt']) {
      const mesh = new THREE.Mesh(geometry, irisMaterial(THREE));
      mesh.name = `bohne-puck-${name}`;
      mesh.scale.setScalar(lage === 'start' ? 1 : SIZE);
      mesh.rotation.x = LIE;
      mesh.morphTargetInfluences = [0];
      g.basis.add(mesh);
      meshes[name] = mesh;
    }
    const mesh = meshes.neu;

    // Beans around the figure (home page, desktop): one instanced mesh, plain bean shape without morph.
    const beanGeometry = beanPuckGeometry(THREE, { segmentsU: 36, segmentsV: 18 });
    beanGeometry.morphAttributes = {};
    const beanMaterial = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 });
    const beanCount = lage === 'start' ? B.count : 0;
    const beans = new THREE.InstancedMesh(beanGeometry, beanMaterial, Math.max(1, beanCount));
    beans.name = 'bohnen';
    beans.frustumCulled = false;
    beans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const beanGroup = new THREE.Group();
    beanGroup.name = 'bohnen';
    beanGroup.add(beans);
    g.position.add(beanGroup);
    const rnd = seeded(7);
    const beanData = [];
    for (let i = 0; i < beanCount; i += 1) {
      // Home on a ring around the figure (figure units: the bean is 2 long), a little more to the outside
      // and above, as the beans around the reference's can; start far outside along the same direction.
      const a = (i / beanCount) * TAU + (rnd() - 0.5) * 0.5;
      const radius = 1.45 + rnd() * 0.95;
      const home = new THREE.Vector3(Math.cos(a) * radius * 1.15, Math.sin(a) * radius * 0.85, (rnd() - 0.55) * 1.2);
      const start = home.clone().multiplyScalar(2.8).add(new THREE.Vector3((rnd() - 0.5) * 0.8, 0.6 + rnd() * 0.8, 0.4 + rnd() * 0.6));
      const rot = new THREE.Euler(rnd() * TAU, rnd() * TAU, rnd() * TAU);
      beanData.push({
        home,
        start,
        rot,
        lag: rnd() * 0.12,
        phase: rnd() * TAU,
        bob: 0.6 + rnd() * 0.6,
        spinAxis: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(),
        off: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        spin: 0,
        spinV: 0,
        scale: 0,
        local: null,
        screenX: null,
        screenY: null,
      });
    }
    // Nothing of the beans before the first frame (the instances start at the identity matrix).
    {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0);
      for (let i = 0; i < beans.count; i += 1) beans.setMatrixAt(i, zero);
      if (!beanCount) beans.visible = false;
    }

    const hemi = new THREE.HemisphereLight(0, 0, 0.9);
    const key = new THREE.DirectionalLight(0, 3.4);
    key.position.set(-0.7, 1.0, 0.8);
    const rim = new THREE.DirectionalLight(0, 2.6);
    rim.position.set(0.9, 0.6, -0.7);
    scene.add(hemi, key, rim);

    const colours = { bean: new THREE.Color(), puck: new THREE.Color(), force: KR.map(() => new THREE.Color()) };
    const centre = new THREE.Vector3();
    const world = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const tmpM = new THREE.Matrix4();
    const tmpQ = new THREE.Quaternion();
    const tmpS = new THREE.Vector3();
    const tmpP = new THREE.Vector3();
    const tmpQ2 = new THREE.Quaternion();
    const enterEase = resolveEase(F.enterEase);
    const switchEase = resolveEase(F.switchEase);
    const fadeEase = resolveEase(F.fadeEase);
    const irisEase = resolveEase(P.iris.ease);
    const growEase = resolveEase('expo.out');
    const outEase = resolveEase(B.swapOut.ease);
    const inEase = resolveEase(B.swapIn.ease);
    const commitEase = resolveEase(DRAG.commitTurn.ease);
    const backEase = resolveEase(DRAG.springBack.ease);

    let start = null;
    let lastSeq = null;
    let turnStart = null;
    let turnDir = 1;
    const pointer = { x: 0, y: 0, cssX: null, cssY: null, vx: 0, vy: 0 };
    const spring = { x: 0, v: 0 };
    let lastTop = null;
    let last = null;
    let version = 0;
    // Shown states: current ("neu") and previous ("alt") while the iris runs.
    const cur = { index: null, form: formTarget(store) };
    const prev = { index: null, form: cur.form };
    let irisStart = null;
    let swapStart = null;
    const drag = { seq: null, mode: 'ruht', angle: 0, target: 0, from: 0, to: 0, t0: 0 };
    let rahmen = null;
    let lastSurface = null;
    let beansShown = 0;
    let p1Now = 0;

    function retheme() {
      const r = readRoles(el, ROLES);
      toColour(THREE, colours.bean, r['--kr-4'], 0.45);
      toColour(THREE, colours.puck, r['--kr-6'], 0.2);
      KR.forEach((name, i) => {
        toColour(THREE, colours.force[i], r[name], 0.45);
        colours.force[i].lerp(colours.bean, P.tint);
      });
      toColour(THREE, hemi.color, r['--fl-erhoben'], 1);
      toColour(THREE, hemi.groundColor, r['--tx-leise'], 0.3);
      toColour(THREE, key.color, r['--fl-erhoben'], 1);
      toColour(THREE, rim.color, r['--ak-marke'], 0.6);
      beanMaterial.color.copy(colours.bean);
      version += 1;
      return r;
    }
    retheme();

    /** Colour of a state: the force colour with a slider, else the S1 mix of bean and puck by form. */
    function paint(material, state) {
      if (Number.isInteger(state.index)) material.color.copy(colours.force[Math.min(6, Math.max(0, state.index))]);
      else material.color.lerpColors(colours.bean, colours.puck, state.form);
    }

    function setRahmen(next) {
      const same = (!next && !rahmen) || (next && rahmen && next.x === rahmen.x && next.y === rahmen.y && next.r === rahmen.r);
      if (same) return;
      rahmen = next;
      store.set('figur:rahmen', next ? Object.freeze(next) : null);
    }

    /* ---------- composition of the home page ---------- */

    // Anchor boxes of the page layout, relative to their section (the section stands at the top of the
    // viewport in the state it belongs to: the sticky hero at p1 = 0, the slider at p1 = 1). Measured lazily,
    // again after every layout change. `off` is the section's offset inside the scene element, so the slider
    // anchor can follow its section once that scrolls past the viewport top (phones: the slider is taller
    // than the viewport and moves up before the surface leaves).
    let anchors = null;
    const anchorOf = (name) => {
      const a = el.querySelector(`[data-figur-anker="${name}"]`);
      const sec = a && a.closest('section, .sx');
      if (!a || !sec) return null;
      const ar = a.getBoundingClientRect();
      const sr = sec.getBoundingClientRect();
      if (!(ar.width > 0)) return null;
      const off = sr.top - el.getBoundingClientRect().top;
      return { x: ar.left + ar.width / 2 - sr.left, y: ar.top + ar.height / 2 - sr.top, len: ar.width / P.stillRatio, off };
    };
    const offAnchors = [store.on('layout:change', () => (anchors = null)), store.on('viewport', () => (anchors = null))];

    function placeStart(f, rec, p1) {
      const lay = f.features.mobile ? P.mobile : P.desktop;
      const s = rec.surface;
      const dpr = s.h / Math.max(1, s.css.h);
      const vw = s.w / dpr;
      const vh = s.css.h;
      const aspect = s.w / Math.max(1, s.h);
      const H = DISTANCE * Math.tan((F.fov * DEG) / 2);
      const W = H * aspect;
      if (!anchors) {
        const held = anchorOf('held');
        const slider = anchorOf('slider');
        const unit = lay.sizeOf === 'w' ? vw : vh;
        const fb = (v) => ({ x: v.x * vw, y: v.y * vh, len: v.size * unit });
        anchors = { held: held || fb(lay.hero), slider: slider || fb(lay.slider), measured: !!(held && slider), vw, vh };
      }
      const a = anchors.held;
      const b = anchors.slider;
      const px = mix(a.x, b.x, p1);
      // Viewport y: mixed while the slider covers the hero, then with the slider's top above the viewport
      // top; to surface coordinates (the surface leaves upwards with the scene's bottom edge).
      // The fallback fractions (no anchors) stay fixed on the surface.
      const py = Number.isFinite(b.off) ? mix(a.y, b.y, p1) + Math.min(0, rec.rect.top + b.off) - s.css.y : mix(a.y, b.y, p1);
      g.position.position.set((px / vw - 0.5) * 2 * W, (0.5 - py / vh) * 2 * H, 0);
      // The bean is 2 units long: a length of len px needs the scale len / vh * H (visible height 2 H).
      g.position.scale.setScalar((mix(a.len, b.len, p1) / vh) * H);
    }

    /* ---------- beans ---------- */

    function updateBeans(f, t, dt, p1, rec) {
      const on = beanCount > 0 && !f.features.mobile;
      beans.visible = on;
      if (!on) {
        beansShown = 0;
        return false;
      }
      // Swap on a force change: out in 1 s (expo.in), in again in 1 s (expo.out).
      let swap = 0;
      if (swapStart !== null) {
        const q = t - swapStart;
        if (q < B.swapOut.duration) swap = outEase(clamp01(q / B.swapOut.duration));
        else if (q < B.swapOut.duration + B.swapIn.duration) swap = 1 - inEase(clamp01((q - B.swapOut.duration) / B.swapIn.duration));
        else swapStart = null;
      }
      const span = B.growTo - B.growFrom;
      // Pointer in figure units: viewport px to scene units at z = 0, divided by the group scale.
      const H = DISTANCE * Math.tan((F.fov * DEG) / 2);
      const pxToUnit = (2 * H) / Math.max(1, rec.surface.css.h) / Math.max(1e-6, g.position.scale.x);
      const pv = Math.hypot(pointer.vx, pointer.vy);
      beansShown = 0;
      let moving = false;
      beanData.forEach((d, i) => {
        const k = clamp01((p1 - B.growFrom - d.lag * span) / (span * (1 - d.lag)));
        const grow = growEase(k);
        d.scale = grow * B.size;
        if (d.scale > 1e-4) beansShown += 1;
        // Push by the pointer (IM 13.3: radius, strength), springs back (stiffness 40, damping 12).
        if (f.features.pointer && pv > 1 && pointer.cssX !== null && d.screenX !== null && d.scale > 1e-4) {
          const dx = d.screenX - pointer.cssX;
          const dy = d.screenY - pointer.cssY;
          const dist = Math.hypot(dx, dy);
          if (dist < B.pushRadius) {
            const fall = 1 - dist / B.pushRadius;
            d.vel.x += pointer.vx * pxToUnit * B.pushStrength * fall * dt;
            d.vel.y -= pointer.vy * pxToUnit * B.pushStrength * fall * dt;
            d.spinV += B.spin * fall * dt * Math.sign(pointer.vx || 1);
          }
        }
        const ax = -B.stiffness * d.off.x - B.damping * d.vel.x;
        const ay = -B.stiffness * d.off.y - B.damping * d.vel.y;
        const az = -B.stiffness * d.off.z - B.damping * d.vel.z;
        d.vel.x += ax * dt;
        d.vel.y += ay * dt;
        d.vel.z += az * dt;
        d.off.addScaledVector(d.vel, dt);
        d.spinV -= d.spinV * Math.min(1, B.spinDamping * dt);
        d.spin += d.spinV * dt;
        if (d.vel.lengthSq() > 1e-8 || Math.abs(d.spinV) > 1e-4) moving = true;
        const away = Math.max(1 - grow, swap);
        tmpP.lerpVectors(d.home, d.start, away);
        tmpP.y += Math.sin(t * d.bob + d.phase) * 0.06;
        tmpP.z += Math.cos(t * d.bob * 0.8 + d.phase) * 0.05;
        tmpP.add(d.off);
        tmpQ.setFromEuler(d.rot);
        tmpQ2.setFromAxisAngle(d.spinAxis, t * 0.35 * d.bob + d.spin);
        tmpQ.multiply(tmpQ2);
        tmpS.setScalar(d.scale);
        tmpM.compose(tmpP, tmpQ, tmpS);
        beans.setMatrixAt(i, tmpM);
        if (!d.local) d.local = new THREE.Vector3();
        d.local.copy(tmpP);
      });
      beans.instanceMatrix.needsUpdate = true;
      return beansShown > 0 || moving;
    }

    /* ---------- drag ---------- */

    function updateDrag(t) {
      const z = store.get('figur:ziehen');
      if (z && z.seq !== drag.seq) {
        drag.seq = z.seq;
        if (z.phase === 'start' || z.phase === 'move') {
          drag.mode = 'folgt';
          drag.target = dragAngle(z.dx) * DEG;
        } else if (z.phase === 'commit') {
          drag.mode = 'dreht';
          drag.from = drag.angle;
          drag.to = (z.direction > 0 ? 1 : -1) * TAU;
          drag.t0 = t;
        } else if (z.phase === 'cancel') {
          drag.mode = 'zurueck';
          drag.from = drag.angle;
          drag.to = 0;
          drag.t0 = t;
        }
      }
      if (drag.mode === 'folgt') {
        drag.angle += (drag.target - drag.angle) * 0.35;
      } else if (drag.mode === 'dreht' || drag.mode === 'zurueck') {
        const spec = drag.mode === 'dreht' ? DRAG.commitTurn : DRAG.springBack;
        const q = clamp01((t - drag.t0) / spec.duration);
        drag.angle = mix(drag.from, drag.to, (drag.mode === 'dreht' ? commitEase : backEase)(q));
        if (q >= 1) {
          drag.mode = 'ruht';
          drag.angle = 0;
        }
      }
      g.ziehen.rotation.y = drag.angle;
    }

    const inst = {
      scene,
      camera,
      groups: g,
      mesh,
      opacity: 0,
      lage,

      retheme,

      /** Restart the entrance (after a level change or a page change). */
      reset() {
        start = null;
        last = null;
        turnStart = null;
        irisStart = null;
        swapStart = null;
        inst.opacity = 0;
      },

      /**
       * Per frame. f: { t, dt, vh, features, pointer }, rec: { rect, surface }.
       */
      update(f, rec) {
        const { t, dt, vh, features } = f;
        const rect = rec.rect;
        lastSurface = rec.surface;

        // Entrance (IM 8: T plus 0.3, 1.75 s back.out(0.5)); starts once the intro is done.
        if (start === null && store.get('intro:done')) start = t + F.enterAt;
        const local = start === null ? -1 : t - start;
        const e = local < 0 ? 0 : enterEase(Math.min(1, local / F.enterDuration));
        inst.opacity = local < 0 ? 0 : fadeEase(Math.min(1, local / F.fadeDuration));
        g.auftritt.position.y = -F.enterDrop * (1 - e);
        g.auftritt.rotation.z = F.enterTilt * DEG * (1 - e);

        // Scroll scrub (IM 13.3): half 1 while the next section covers the hero, half 2 while all leaves.
        const span2Start = Math.max(vh, rect.height - vh);
        const p1 = progress(rect, vh);
        const p2 = Math.min(1, Math.max(0, (-rect.top - span2Start) / vh));
        p1Now = p1;
        const mobile = features.mobile;
        if (lage === 'start') {
          placeStart(f, rec, p1);
        } else {
          const size = mobile ? F.mobile.size : 1;
          g.position.position.set(mobile ? 0 : F.half1.x * p1, F.half1.y * p1, 0);
          g.position.scale.setScalar(size * (mobile ? 1 : 1 + (F.half1.scale - 1) * p1));
        }
        const turn1 = (mobile ? F.mobile.turn : F.half1.turn) * DEG;
        g.drehung.rotation.y = turn1 * p1 + (F.half2.turn * DEG - turn1) * p2;
        g.drehung.rotation.x = F.half1.rotX * p1;
        g.drehung.rotation.z = F.half1.rotZ * p1;

        // Pointer tilt (not on touch) and the scroll-speed spring (stiffness 10, damping 8).
        const k = approach(TIMING.gl.pointerApproach, dt);
        const px = features.pointer ? f.pointer.x : 0;
        const py = features.pointer ? f.pointer.y : 0;
        pointer.x += (px - pointer.x) * k;
        pointer.y += (py - pointer.y) * k;
        if (features.pointer && f.pointer.inside) {
          if (pointer.cssX !== null && dt > 0) {
            pointer.vx = (f.pointer.cssX - pointer.cssX) / dt;
            pointer.vy = (f.pointer.cssY - pointer.cssY) / dt;
          }
          pointer.cssX = f.pointer.cssX;
          pointer.cssY = f.pointer.cssY;
        } else {
          pointer.vx = 0;
          pointer.vy = 0;
        }
        const speed = lastTop === null || dt <= 0 ? 0 : (lastTop - rect.top) / dt / vh;
        lastTop = rect.top;
        const target = Math.max(-3, Math.min(3, speed)) * 0.05;
        const acc = F.springStiffness * (target - spring.x) - F.springDamping * spring.v;
        spring.v += acc * dt;
        spring.x += spring.v * dt;
        g.maus.rotation.y = pointer.x * F.mouseMax + spring.x * 0.6;
        g.maus.rotation.x = pointer.y * F.mouseMax + spring.x;

        // Force change (S2): a full turn in the slider's direction, unless the change came from a drag (the
        // drag turns the figure itself) or is the initial index; the new state opens through the iris.
        const si = store.get('slider:index');
        if (si && si.seq !== lastSeq) {
          const idx = Math.min(6, Math.max(0, si.index));
          const next = { index: idx, form: FORM_BY_FORCE[idx] };
          const quiet = lastSeq === null || si.source === 'init';
          if (!quiet && si.source !== 'drag') {
            turnStart = t;
            turnDir = si.direction < 0 ? -1 : 1;
          }
          if (quiet || cur.index === null) {
            Object.assign(cur, next);
            Object.assign(prev, next);
            irisStart = null;
          } else if (idx !== cur.index) {
            Object.assign(prev, cur);
            Object.assign(cur, next);
            irisStart = t;
            if (beanCount && si.source !== 'scroll') swapStart = t;
          }
          lastSeq = si.seq;
        } else if (!si) {
          // No slider: the review value of the probe page, smoothed (spike S1).
          if (lastSeq !== null) {
            lastSeq = null;
            cur.index = null;
            prev.index = null;
            irisStart = null;
          }
          const goal = formTarget(store);
          cur.form += (goal - cur.form) * approach(F.formApproach, dt);
          if (Math.abs(goal - cur.form) < 1e-4) cur.form = goal;
          Object.assign(prev, cur);
        }
        let turn = 0;
        if (turnStart !== null) {
          const q = Math.min(1, Math.max(0, (t - turnStart) / F.switchDuration));
          turn = q >= 1 ? 0 : turnDir * TAU * switchEase(q);
          if (q >= 1) turnStart = null;
        }
        g.wechsel.rotation.y = turn;
        updateDrag(t);

        // Iris: 0 before 0.5 s (old state everywhere), opens to the farthest corner until 2.0 s.
        let iris = 1;
        if (irisStart !== null) {
          const q = (t - irisStart - P.iris.start) / (P.iris.end - P.iris.start);
          iris = q <= 0 ? 0 : q >= 1 ? 1 : irisEase(q);
          if (q >= 1) irisStart = null;
        }
        const running = irisStart !== null;
        meshes.neu.morphTargetInfluences[0] = cur.form;
        meshes.alt.morphTargetInfluences[0] = prev.form;
        paint(meshes.neu.material, cur);
        paint(meshes.alt.material, prev);
        meshes.alt.visible = running;
        const s = rec.surface;
        const ox = s.w * P.iris.originX;
        const oy = s.h * P.iris.originY;
        const far = Math.max(Math.hypot(ox, oy), Math.hypot(s.w - ox, oy), Math.hypot(ox, s.h - oy), Math.hypot(s.w - ox, s.h - oy));
        const soft = P.iris.soft * 0.15 * s.h;
        const rough = P.iris.noise * 0.5 * s.h;
        const radius = iris * (far + soft + rough);
        for (const [name, side] of [['neu', running ? 1 : 0], ['alt', running ? -1 : 0]]) {
          const u = meshes[name].material.userData.iris;
          u.uIris.value.set(ox, oy, radius);
          u.uIrisEdge.value.set(Math.max(1, soft), rough);
          u.uIrisSide.value = side;
        }

        const beansMoving = lage === 'start' ? updateBeans(f, t, dt, p1, rec) : false;

        // Camera: the S1 page keeps the horizontal framing below the reference aspect (IM 13.3); the home
        // page places by viewport fractions and keeps the lens.
        const aspect = rec.surface.w / Math.max(1, rec.surface.h);
        const ref = mobile ? F.fovRefAspectMobile : F.fovRefAspect;
        const fov = lage === 's1' && aspect < ref ? 2 * Math.atan(Math.tan((F.fov * DEG) / 2) * (ref / aspect)) / DEG : F.fov;
        if (camera.aspect !== aspect || camera.fov !== fov) {
          camera.aspect = aspect;
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }

        // Where the figure is on screen: the drag handle follows this circle; beans need their screen place
        // for the pointer push.
        camera.clearViewOffset();
        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
        if (inst.opacity > 0.5 && s.visible) {
          mesh.getWorldPosition(centre);
          mesh.getWorldScale(scale);
          const dist = Math.max(1e-3, DISTANCE - centre.z);
          const half = Math.max(scale.x, scale.y) * 0.9;
          centre.project(camera);
          const dpr = s.h / Math.max(1, s.css.h);
          const r = (half / (dist * Math.tan((camera.fov * DEG) / 2))) * (s.h / 2) / dpr;
          setRahmen({
            x: Math.round((s.x + ((centre.x + 1) / 2) * s.w) / dpr),
            y: Math.round((s.y + ((1 - centre.y) / 2) * s.h) / dpr),
            r: Math.round(r),
          });
        } else {
          setRahmen(null);
        }
        if (beanCount && beans.visible) {
          const dpr = s.h / Math.max(1, s.css.h);
          for (const d of beanData) {
            if (!d.local) continue;
            world.copy(d.local).applyMatrix4(beanGroup.matrixWorld).project(camera);
            d.screenX = (s.x + ((world.x + 1) / 2) * s.w) / dpr;
            d.screenY = (s.y + ((1 - world.y) / 2) * s.h) / dpr;
          }
        }

        // Did the picture change? (The world skips the layer when no scene in it moved.)
        const sig = [inst.opacity, e, p1, p2, g.position.position.x, g.position.position.y, g.position.scale.x, pointer.x, pointer.y, spring.x, cur.form, prev.form, cur.index ?? -1, aspect, fov, version, turn, drag.angle, iris, running ? 1 : 0];
        let moved = !last || beansMoving;
        if (last) for (let i = 0; i < sig.length; i += 1) if (Math.abs(sig[i] - last[i]) > 1e-5) moved = true;
        last = sig;
        return moved;
      },

      /**
       * Screen box of the figure (and its beans) inside its surface (device px, top-left origin), or null
       * when nothing is to be seen. The world renders only this box: a multisampled target of the whole
       * viewport would cost four times the fill for a figure that covers a fifth of it.
       */
      bounds(surface) {
        if (inst.opacity <= 0) return null;
        camera.clearViewOffset();
        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
        const tanHalf = Math.tan((camera.fov * DEG) / 2);
        let x0 = Infinity;
        let x1 = -Infinity;
        let y0 = Infinity;
        let y1 = -Infinity;
        const add = (pos, radius) => {
          const distance = Math.max(1e-3, DISTANCE - pos.z);
          const p = pos.clone().project(camera);
          const ry = (radius / (distance * tanHalf)) * 1.12;
          const rx = ry / camera.aspect;
          x0 = Math.min(x0, ((p.x - rx + 1) / 2) * surface.w);
          x1 = Math.max(x1, ((p.x + rx + 1) / 2) * surface.w);
          y0 = Math.min(y0, ((1 - (p.y + ry)) / 2) * surface.h);
          y1 = Math.max(y1, ((1 - (p.y - ry)) / 2) * surface.h);
        };
        mesh.getWorldPosition(centre);
        mesh.getWorldScale(scale);
        add(centre, geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z));
        if (beanCount && beans.visible && beansShown) {
          beanGroup.getWorldScale(scale);
          for (const d of beanData) {
            if (d.scale <= 1e-4 || !d.local) continue;
            world.copy(d.local).applyMatrix4(beanGroup.matrixWorld);
            add(world, 1.1 * d.scale * scale.x);
          }
        }
        const bx0 = Math.floor(x0) - 2;
        const bx1 = Math.ceil(x1) + 2;
        const by0 = Math.floor(y0) - 2;
        const by1 = Math.ceil(y1) + 2;
        const x = Math.max(0, bx0);
        const y = Math.max(0, by0);
        const w = Math.min(surface.w, bx1) - x;
        const h = Math.min(surface.h, by1) - y;
        if (!(w > 0 && h > 0)) return null;
        // The iris works in surface px: tell both copies where this box lies.
        for (const m of [meshes.neu, meshes.alt]) m.material.userData.iris.uIrisBox.value.set(x, y, w, h);
        return { x, y, w, h };
      },

      info() {
        return {
          lage,
          form: cur.form,
          index: cur.index,
          opacity: inst.opacity,
          entered: start !== null,
          colour: meshes.neu.material.color.getHexString(),
          turning: turnStart !== null,
          iris: irisStart !== null,
          drag: drag.mode,
          beans: beansShown,
          p1: Math.round(p1Now * 1000) / 1000,
          position: { x: g.position.position.x, y: g.position.position.y, scale: g.position.scale.x },
          anchors: anchors ? { held: anchors.held, slider: anchors.slider, measured: anchors.measured } : null,
          turn: Math.round((g.drehung.rotation.y / DEG) * 10) / 10,
          switchTurn: Math.round((g.wechsel.rotation.y / DEG) * 10) / 10,
          dragTurn: Math.round((g.ziehen.rotation.y / DEG) * 10) / 10,
          mouse: { x: g.maus.rotation.x, y: g.maus.rotation.y },
          irisRadius: Math.round(meshes.neu.material.userData.iris.uIris.value.z),
          irisSide: meshes.neu.material.userData.iris.uIrisSide.value,
          shownIndex: prev.index,
          rahmen,
          surface: lastSurface ? { w: lastSurface.w, h: lastSurface.h } : null,
        };
      },

      dispose() {
        for (const off of offAnchors) off();
        setRahmen(null);
        geometry.dispose();
        beanGeometry.dispose();
        meshes.neu.material.dispose();
        meshes.alt.material.dispose();
        beanMaterial.dispose();
        beans.dispose();
        scene.clear();
      },
    };
    return inst;
  },
};
