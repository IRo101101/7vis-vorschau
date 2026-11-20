/**
 * Procedural figure of answer 3a: a coffee bean that becomes a puck (FRAGEN 3a, "Figur aus Code").
 *
 * One surface grid, two shapes with the same vertex order, so the morph is a plain three.js morph target:
 *   base     the bean: an ellipsoid (long axis x, width y, thickness z) with a flatter front face (+z) and
 *            the S-shaped centre cut running along that face
 *   target 0 the puck: a disc with rounded edge (rounded-rectangle profile turned around z), sampled by arc
 *            length so faces, edge and side all get rings in proportion to their size
 * Grid: u runs around the z axis, v from the back pole (v = 0) to the front pole (v = 1).
 * Normals come from finite differences of each shape function (no seam, no pole artefacts).
 * Units: the bean is 2 units long; the scene scales the mesh.
 */

const TAU = Math.PI * 2;

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bean shape. Returns [x, y, z]. */
export function bean(u, v) {
  const phi = TAU * u;
  const theta = -Math.PI / 2 + Math.PI * v;
  const dx = Math.cos(theta) * Math.cos(phi);
  const dy = Math.cos(theta) * Math.sin(phi);
  const dz = Math.sin(theta);
  const a = 1.0;
  const b = 0.74;
  const c = 0.46;
  // Slightly egg-shaped outline: one end a little fuller than the other.
  const x = a * dx;
  const y = b * dy * (1 + 0.06 * dx);
  // Domed back (z < 0), flatter but still convex front face, blended so the rim stays smooth.
  let z = c * dz * (1 - 0.42 * smooth(0, 0.4, dz));
  // Centre cut: a narrow S-shaped crease along x on the front face, fading out just before the tips.
  const along = x / a;
  const centre = 0.09 * Math.sin(Math.PI * along * 0.95);
  const width = 0.1 * (1 - 0.4 * along * along);
  const depth = 0.17 * Math.pow(Math.max(0, 1 - along * along), 0.6) * smooth(0.1, 0.5, dz);
  z -= depth * Math.exp(-(((y - centre) / width) ** 2));
  return [x, y, z];
}

/** Puck profile in (r, z), parameterised by arc length s in [0, 1]. */
function puckProfile(s) {
  const R = 0.96;
  const H = 0.24;
  const e = 0.1;
  const face = R - e;
  const arc = (Math.PI / 2) * e;
  const side = 2 * (H - e);
  const L = face + arc + side + arc + face;
  let d = s * L;
  if (d <= face) return [d, -H];
  d -= face;
  if (d <= arc) {
    const a = -Math.PI / 2 + d / e;
    return [face + e * Math.cos(a), -H + e + e * Math.sin(a)];
  }
  d -= arc;
  if (d <= side) return [R, -H + e + d];
  d -= side;
  if (d <= arc) {
    const a = d / e;
    return [face + e * Math.cos(a), H - e + e * Math.sin(a)];
  }
  d -= arc;
  return [Math.max(0, face - d), H];
}

/** Puck shape. Returns [x, y, z]. */
export function puck(u, v) {
  const phi = TAU * u;
  const [r, z] = puckProfile(Math.min(1, Math.max(0, v)));
  return [r * Math.cos(phi), r * Math.sin(phi), z];
}

function fillShape(fn, U, V, pos, nor) {
  const h = 1e-4;
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
  const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const norm = (p) => {
    const l = Math.hypot(p[0], p[1], p[2]) || 1;
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  for (let j = 0; j <= V; j += 1) {
    const v = j / V;
    for (let i = 0; i <= U; i += 1) {
      const u = i / U;
      const k = (j * (U + 1) + i) * 3;
      const p = fn(u, v);
      pos[k] = p[0];
      pos[k + 1] = p[1];
      pos[k + 2] = p[2];
      if (j === 0 || j === V) continue;
      const du = sub(fn(u + h, v), fn(u - h, v));
      const dv = sub(fn(u, v + h), fn(u, v - h));
      let n = norm(cross(du, dv));
      if (n[0] * p[0] + n[1] * p[1] + n[2] * p[2] < 0) n = [-n[0], -n[1], -n[2]];
      nor[k] = n[0];
      nor[k + 1] = n[1];
      nor[k + 2] = n[2];
    }
  }
  // Poles: every vertex of the pole row is the same point; its normal is the mean of the next row.
  for (const [row, next] of [[0, 1], [V, V - 1]]) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < U; i += 1) {
      const k = (next * (U + 1) + i) * 3;
      sx += nor[k];
      sy += nor[k + 1];
      sz += nor[k + 2];
    }
    const n = norm([sx, sy, sz]);
    for (let i = 0; i <= U; i += 1) {
      const k = (row * (U + 1) + i) * 3;
      nor[k] = n[0];
      nor[k + 1] = n[1];
      nor[k + 2] = n[2];
    }
  }
}

/**
 * Build the morphing geometry.
 * @param THREE three.js namespace
 * @param {{ segmentsU?: number, segmentsV?: number }} o
 */
export function beanPuckGeometry(THREE, { segmentsU = 240, segmentsV = 120 } = {}) {
  const U = segmentsU;
  const V = segmentsV;
  const count = (U + 1) * (V + 1);
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const pos2 = new Float32Array(count * 3);
  const nor2 = new Float32Array(count * 3);
  fillShape(bean, U, V, pos, nor);
  fillShape(puck, U, V, pos2, nor2);

  const index = [];
  for (let j = 0; j < V; j += 1) {
    for (let i = 0; i < U; i += 1) {
      const a = j * (U + 1) + i;
      const b = a + 1;
      const c = a + (U + 1);
      const d = c + 1;
      if (j > 0) index.push(a, b, d);
      if (j < V - 1) index.push(a, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setIndex(index);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.morphAttributes.position = [new THREE.BufferAttribute(pos2, 3)];
  g.morphAttributes.normal = [new THREE.BufferAttribute(nor2, 3)];
  g.morphTargetsRelative = false;
  g.computeBoundingSphere();
  g.boundingSphere.radius = Math.max(g.boundingSphere.radius, 1.05);
  return g;
}
