/**
 * Scene "figur" (front layer, transparent): the hero figure of answer 3a, a bean that becomes a puck.
 *
 * Transform chain of IM 13.3: seven nested groups, each effect moves only its own group, so they never
 * fight (PLAN 5 no. 29):
 *   auftritt   entrance: rises from enterDrop below, uprights from enterTilt around the view axis
 *   position   scroll scrub, half 1 (hero is covered): moves aside and up, scales to 0.9
 *   maus       pointer tilt (up to mouseMax rad, smoothed) plus the scroll-speed spring (nod and lag)
 *   drehung    scroll scrub turn: 351 deg in half 1, on to 540 deg in half 2 (mobile: 360 deg, no x shift)
 *   ziehen     reserved for dragging the figure (stage 3, gesture table motion/drag.js of S2)
 *   wechsel    force change: a full turn when 'slider:index' changes, not after a drag (IM 13.3, S2)
 *   basis      base pose of the reference (y -22.5 deg, x 12 deg)
 * Form (FRAGEN 3a): derived from 'slider:index' when a force slider exists (FORM_BY_FORCE: 01 bean, 02 half
 * way, 03 and later puck, 07 without a process of its own); without a slider the review value 'figur:form'
 * (0 bean, 1 puck) of the probe page. Drives the morph target and the colour, smoothed per frame.
 * Colours: role tokens of the scene element (--kr-4 bean, --kr-6 puck, light from --fl-erhoben, shade from
 * --tx-leise, rim from --ak-marke). Camera: FOV kept so the framing keeps its width on narrow screens.
 */
import { beanPuckGeometry } from '../bohne-puck.js';
import { readRoles, toColour } from '../tokens.js';
import { progress } from '../surface.js';
import { resolveEase } from '../../motion/ease.js';
import { TIMING } from '../../motion/curves.js';

const F = TIMING.figure;
const ROLES = ['--kr-4', '--kr-6', '--fl-erhoben', '--tx-leise', '--ak-marke'];
const DEG = Math.PI / 180;
// Scene scale: bean 0.18 units long, camera 0.7 units away (visible height 0.375 at FOV 30 deg).
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

export default {
  name: 'figur',
  layer: 'vorn',
  kind: 'target',

  create({ THREE, el, store }) {
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

    const geometry = beanPuckGeometry(THREE);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.42, metalness: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'bohne-puck';
    mesh.scale.setScalar(SIZE);
    mesh.rotation.x = LIE;
    mesh.morphTargetInfluences = [0];
    g.basis.add(mesh);

    const hemi = new THREE.HemisphereLight(0, 0, 0.9);
    const key = new THREE.DirectionalLight(0, 3.4);
    key.position.set(-0.7, 1.0, 0.8);
    const rim = new THREE.DirectionalLight(0, 2.6);
    rim.position.set(0.9, 0.6, -0.7);
    scene.add(hemi, key, rim);

    const colours = { bean: new THREE.Color(), puck: new THREE.Color() };
    const centre = new THREE.Vector3();
    const world = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const enterEase = resolveEase(F.enterEase);
    const switchEase = resolveEase(F.switchEase);
    const fadeEase = resolveEase(F.fadeEase);

    let start = null;
    let form = formTarget(store);
    let lastSeq = null;
    let turnStart = null;
    let turnDir = 1;
    const pointer = { x: 0, y: 0 };
    const spring = { x: 0, v: 0 };
    let lastTop = null;
    let last = null;
    let version = 0;

    function retheme() {
      const r = readRoles(el, ROLES);
      toColour(THREE, colours.bean, r['--kr-4'], 0.45);
      toColour(THREE, colours.puck, r['--kr-6'], 0.2);
      toColour(THREE, hemi.color, r['--fl-erhoben'], 1);
      toColour(THREE, hemi.groundColor, r['--tx-leise'], 0.3);
      toColour(THREE, key.color, r['--fl-erhoben'], 1);
      toColour(THREE, rim.color, r['--ak-marke'], 0.6);
      version += 1;
      return r;
    }
    retheme();

    const inst = {
      scene,
      camera,
      groups: g,
      mesh,
      opacity: 0,

      retheme,

      /** Restart the entrance (after a level change or a page change). */
      reset() {
        start = null;
        last = null;
        turnStart = null;
        inst.opacity = 0;
      },

      /**
       * Per frame. f: { t, dt, vh, features, pointer }, rec: { rect, surface }.
       */
      update(f, rec) {
        const { t, dt, vh, features } = f;
        const rect = rec.rect;

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
        const mobile = features.mobile;
        const size = mobile ? F.mobile.size : 1;
        g.position.position.x = mobile ? 0 : F.half1.x * p1;
        g.position.position.y = F.half1.y * p1;
        g.position.scale.setScalar(size * (mobile ? 1 : 1 + (F.half1.scale - 1) * p1));
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
        const speed = lastTop === null || dt <= 0 ? 0 : (lastTop - rect.top) / dt / vh;
        lastTop = rect.top;
        const target = Math.max(-3, Math.min(3, speed)) * 0.05;
        const acc = F.springStiffness * (target - spring.x) - F.springDamping * spring.v;
        spring.v += acc * dt;
        spring.x += spring.v * dt;
        g.maus.rotation.y = pointer.x * F.mouseMax + spring.x * 0.6;
        g.maus.rotation.x = pointer.y * F.mouseMax + spring.x;

        // Force change (S2): a full turn in the slider's direction, unless the change came from a drag (the
        // drag turns the figure itself) or is the initial index.
        const si = store.get('slider:index');
        if (si && si.seq !== lastSeq) {
          if (lastSeq !== null && si.source !== 'drag' && si.source !== 'init') {
            turnStart = t;
            turnDir = si.direction < 0 ? -1 : 1;
          }
          lastSeq = si.seq;
        }
        let turn = 0;
        if (turnStart !== null) {
          const q = Math.min(1, Math.max(0, (t - turnStart) / F.switchDuration));
          turn = q >= 1 ? 0 : turnDir * 2 * Math.PI * switchEase(q);
          if (q >= 1) turnStart = null;
        }
        g.wechsel.rotation.y = turn;

        // Form: bean (0) to puck (1).
        const goal = formTarget(store);
        form += (goal - form) * approach(F.formApproach, dt);
        if (Math.abs(goal - form) < 1e-4) form = goal;
        mesh.morphTargetInfluences[0] = form;
        material.color.lerpColors(colours.bean, colours.puck, form);

        // Camera: keep the horizontal framing below the reference aspect (IM 13.3).
        const aspect = rec.surface.w / Math.max(1, rec.surface.h);
        const ref = mobile ? F.fovRefAspectMobile : F.fovRefAspect;
        const fov = aspect < ref ? 2 * Math.atan(Math.tan((F.fov * DEG) / 2) * (ref / aspect)) / DEG : F.fov;
        if (camera.aspect !== aspect || camera.fov !== fov) {
          camera.aspect = aspect;
          camera.fov = fov;
          camera.updateProjectionMatrix();
        }

        // Did the picture change? (The world skips the layer when no scene in it moved.)
        const sig = [inst.opacity, e, p1, p2, size, pointer.x, pointer.y, spring.x, form, aspect, fov, version, turn];
        let moved = !last;
        if (last) for (let i = 0; i < sig.length; i += 1) if (Math.abs(sig[i] - last[i]) > 1e-5) moved = true;
        last = sig;
        return moved;
      },

      /**
       * Screen box of the figure inside its surface (device px, top-left origin), or null when nothing is
       * to be seen. The world renders only this box: a multisampled target of the whole viewport would cost
       * four times the fill for a figure that covers a fifth of it.
       */
      bounds(surface) {
        if (inst.opacity <= 0) return null;
        camera.clearViewOffset();
        camera.updateMatrixWorld();
        scene.updateMatrixWorld();
        mesh.getWorldPosition(centre);
        mesh.getWorldScale(scale);
        const radius = geometry.boundingSphere.radius * Math.max(scale.x, scale.y, scale.z);
        centre.project(camera);
        const distance = Math.max(1e-3, DISTANCE - mesh.getWorldPosition(world).z);
        const ry = (radius / (distance * Math.tan((camera.fov * DEG) / 2))) * 1.12;
        const rx = ry / camera.aspect;
        const x0 = Math.floor(((centre.x - rx + 1) / 2) * surface.w) - 2;
        const x1 = Math.ceil(((centre.x + rx + 1) / 2) * surface.w) + 2;
        const y0 = Math.floor(((1 - (centre.y + ry)) / 2) * surface.h) - 2;
        const y1 = Math.ceil(((1 - (centre.y - ry)) / 2) * surface.h) + 2;
        const x = Math.max(0, x0);
        const y = Math.max(0, y0);
        const w = Math.min(surface.w, x1) - x;
        const h = Math.min(surface.h, y1) - y;
        return w > 0 && h > 0 ? { x, y, w, h } : null;
      },

      info() {
        return { form, opacity: inst.opacity, entered: start !== null, colour: material.color.getHexString(), turning: turnStart !== null };
      },

      dispose() {
        geometry.dispose();
        material.dispose();
        scene.clear();
      },
    };
    return inst;
  },
};
