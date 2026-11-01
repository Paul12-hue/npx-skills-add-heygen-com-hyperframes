import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural props in the style of 90s pre-rendered fantasy CGI. Each prop is a
 * set of primitive parts; every part names a material ("stone", "shingle",
 * "glowWarm" …) and a tint. Parts are grouped per material so a whole village
 * renders in a handful of draw calls.
 */

export type MatKey =
  | 'stone' | 'wood' | 'darkwood' | 'shingle' | 'plaster' | 'organic' | 'foliage' | 'metal'
  | 'mushCap' | 'mushStem' | 'lily'
  | 'glowWarm' | 'glowViolet' | 'glowGreen' | 'glowCyan' | 'glowMagenta' | 'void';

export type Prop = Partial<Record<MatKey, THREE.BufferGeometry>>;

interface Part {
  geo: THREE.BufferGeometry;
  mat: MatKey;
  color: string;
}

function tint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color('#' + hex);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  return geo.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz),
    ),
  );
}

const p = (geo: THREE.BufferGeometry, mat: MatKey, color: string): Part => ({ geo, mat, color });

export function build(parts: Part[], shear = 0): Prop {
  const groups = new Map<MatKey, THREE.BufferGeometry[]>();
  for (const part of parts) {
    const g = tint(part.geo, part.color);
    if (shear) g.applyMatrix4(new THREE.Matrix4().makeShear(0, 0, shear, 0, 0, 0));
    const list = groups.get(part.mat) ?? [];
    list.push(g);
    groups.set(part.mat, list);
  }
  const out: Prop = {};
  for (const [k, list] of groups) {
    const m = mergeGeometries(list, false);
    if (!m) throw new Error('merge failed for ' + k);
    out[k] = m;
  }
  return out;
}

/** Transform a prop into world space (returns new geometries). */
export function place(prop: Prop, x: number, y: number, z: number, ry = 0, scale = 1): Prop {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
    new THREE.Vector3(scale, scale, scale),
  );
  const out: Prop = {};
  for (const k of Object.keys(prop) as MatKey[]) out[k] = prop[k]!.clone().applyMatrix4(m);
  return out;
}

/** Collects many placed props, then merges them per material. */
export class PropBatch {
  private lists = new Map<MatKey, THREE.BufferGeometry[]>();
  add(prop: Prop): void {
    for (const k of Object.keys(prop) as MatKey[]) {
      const l = this.lists.get(k) ?? [];
      l.push(prop[k]!);
      this.lists.set(k, l);
    }
  }
  merged(): [MatKey, THREE.BufferGeometry][] {
    const out: [MatKey, THREE.BufferGeometry][] = [];
    for (const [k, l] of this.lists) {
      const m = mergeGeometries(l, false);
      if (m) out.push([k, m]);
    }
    return out;
  }
}

/** World-space box-projected UVs so every texture has the same density everywhere. */
export function applyBoxUV(geo: THREE.BufferGeometry, scale: number): void {
  geo.computeVertexNormals();
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) {
      u = pos.getX(i);
      v = pos.getZ(i);
    } else if (ax >= az) {
      u = pos.getZ(i);
      v = pos.getY(i);
    } else {
      u = pos.getX(i);
      v = pos.getY(i);
    }
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

// ================================================================== nature
export function pineGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(0.16, 0.3, 2.2, 6), 0, 1.1, 0), 'organic', '4a3020'),
    p(at(new THREE.ConeGeometry(2.0, 3.0, 7), 0, 2.7, 0), 'foliage', '1e6a52'),
    p(at(new THREE.ConeGeometry(1.55, 2.6, 7), 0, 4.0, 0, 0.45), 'foliage', '2a8a5e'),
    p(at(new THREE.ConeGeometry(1.0, 2.2, 7), 0, 5.3, 0), 'foliage', '3aa070'),
  ]);
}

export function deadTreeGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(0.15, 0.32, 3.8, 6), 0, 1.9, 0), 'organic', '3a2f3f'),
    p(at(new THREE.CylinderGeometry(0.05, 0.12, 1.8, 5), 0.55, 3.2, 0, 0, 0, -0.8), 'organic', '3a2f3f'),
    p(at(new THREE.CylinderGeometry(0.04, 0.1, 1.5, 5), -0.5, 2.7, 0.1, 0, 0.3, 0.95), 'organic', '3a2f3f'),
    p(at(new THREE.CylinderGeometry(0.03, 0.07, 1.0, 4), 0.2, 3.9, 0.3, 0, 0.7, 0.2), 'organic', '3a2f3f'),
  ]);
}

export function rockGeometry(): Prop {
  return build([p(at(new THREE.DodecahedronGeometry(1, 1), 0, 0.3, 0, 0, 0, 0, 1, 0.7, 1), 'stone', '8a7a98')]);
}

/** Giant toadstool with a glowing green underside (from the swamp reference). */
export function mushroomGeometry(): Prop {
  const cap = new THREE.SphereGeometry(2.2, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
  const parts: Part[] = [
    p(at(new THREE.CylinderGeometry(0.35, 0.6, 3.2, 10), 0, 1.6, 0, 0, 0, 0.06), 'mushStem', 'b8f070'),
    p(at(cap, 0.1, 3.0, 0, 0, 0, 0, 1, 0.55, 1), 'mushCap', '7a3ad0'),
    p(at(new THREE.ConeGeometry(2.15, 0.5, 18, 1, true), 0.1, 2.85, 0, 0, Math.PI), 'glowGreen', '40ff20'),
  ];
  const spots = [[0.9, 3.75, 0.6], [-0.7, 3.8, 0.9], [-1.2, 3.5, -0.6], [0.4, 3.9, -1.1], [1.5, 3.35, -0.5], [0.0, 4.1, 0.1]];
  for (const [x, y, z] of spots) parts.push(p(at(new THREE.SphereGeometry(0.28, 8, 6), x + 0.1, y, z, 0, 0, 0, 1, 0.45, 1), 'glowCyan', '3a5aff'));
  return build(parts);
}

export function lilyPadGeometry(): Prop {
  return build([p(at(new THREE.CircleGeometry(0.7, 9, 0.3, Math.PI * 1.85), 0, 0.03, 0, 0, -Math.PI / 2), 'lily', '3aa83a')]);
}

// ================================================================== village
/**
 * A gable roof (prism) that sits exactly on a box of size w × d: two sloped
 * planes meeting at a ridge along x, closed triangular gables at both ends.
 * Origin at the eaves line, centre of the box.
 */
export function gableRoofGeometry(w: number, d: number, h: number, overhang = 0.35): THREE.BufferGeometry {
  // ridge along x at height h above the wall tops (y = 0); the slopes pass exactly
  // through the top edge of the long walls (z = ±d/2) and run on to the eaves
  const x = w / 2 + overhang;
  const z = d / 2 + overhang;
  const ye = -h * (overhang / (d / 2)); // eaves height
  const t = 0.14;
  const pos: number[] = [];
  const quad = (a: number[], b: number[], c: number[], e: number[]) => pos.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad([-x, ye, -z], [-x, h, 0], [x, h, 0], [x, ye, -z]); // front slope
  quad([x, ye, z], [x, h, 0], [-x, h, 0], [-x, ye, z]); // back slope
  quad([-x, ye - t, -z], [x, ye - t, -z], [x, ye, -z], [-x, ye, -z]); // eaves edges
  quad([x, ye - t, z], [-x, ye - t, z], [-x, ye, z], [x, ye, z]);
  // closed gables between the wall tops and the ridge
  const gx = w / 2;
  pos.push(-gx, 0, -d / 2, -gx, 0, d / 2, -gx, h, 0);
  pos.push(gx, 0, d / 2, gx, 0, -d / 2, gx, h, 0);
  // undersides of the overhang
  quad([-x, ye - t, -z], [-x, h - t, 0], [x, h - t, 0], [x, ye - t, -z].slice());
  quad([x, ye - t, z], [x, h - t, 0], [-x, h - t, 0], [-x, ye - t, z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2));
  return g;
}

/**
 * A sturdy timber-framed house: stone plinth that reaches into the ground (so it
 * never floats on a slope), plaster walls, timber frame, an upper floor and a
 * gable roof that fits the walls exactly. Doors face +z.
 */
export function houseGeometry(variant: number): Prop {
  const W = 5.6;
  const D = 4.6;
  const h1 = 3.0;
  const two = variant % 3 !== 1;
  const h2 = two ? 2.6 : 0;
  const roofH = 2.6 + (variant % 2) * 0.6;
  const top = 0.6 + h1 + h2;
  const plaster = variant % 2 ? 'e0c8a0' : 'd8bc90';
  const parts: Part[] = [
    p(at(new THREE.BoxGeometry(W + 0.3, 2.2, D + 0.3), 0, -0.5, 0), 'stone', '8a7a90'),
    p(at(new THREE.BoxGeometry(W, h1, D), 0, 0.6 + h1 / 2, 0), 'plaster', plaster),
    p(at(new THREE.BoxGeometry(W + 0.12, 0.25, D + 0.12), 0, 0.6 + h1, 0), 'darkwood', '3a2418'),
  ];
  if (two) parts.push(p(at(new THREE.BoxGeometry(W, h2, D), 0, 0.6 + h1 + h2 / 2, 0), 'plaster', plaster));
  // timber frame on the front and the back
  for (const zs of [1, -1]) {
    for (const x of [-W / 2 + 0.1, -W / 6, W / 6, W / 2 - 0.1]) parts.push(p(at(new THREE.BoxGeometry(0.2, h1 + h2, 0.12), x, 0.6 + (h1 + h2) / 2, zs * (D / 2 + 0.03)), 'darkwood', '3a2418'));
    if (two) parts.push(p(at(new THREE.BoxGeometry(W, 0.18, 0.12), 0, 0.6 + h1 + h2 - 0.1, zs * (D / 2 + 0.03)), 'darkwood', '3a2418'));
  }
  for (const xs of [1, -1]) parts.push(p(at(new THREE.BoxGeometry(0.12, h1 + h2, 0.2), xs * (W / 2 + 0.03), 0.6 + (h1 + h2) / 2, D / 2 - 0.1), 'darkwood', '3a2418'));
  // roof (ridge along x) and a chimney that goes through it
  parts.push(p(at(gableRoofGeometry(W, D, roofH), 0, top, 0), 'shingle', variant % 2 ? '4a3a5a' : '5a3a32'));
  parts.push(p(at(new THREE.BoxGeometry(0.8, roofH + 1.2, 0.8), W / 2 - 1.1, top + (roofH + 1.2) / 2 - 0.3, -0.9), 'stone', '7a6a80'));
  // door, step, windows with frames
  parts.push(p(at(new THREE.BoxGeometry(1.1, 2.1, 0.14), -1.3, 0.6 + 1.05, D / 2 + 0.05), 'darkwood', '2a1a12'));
  parts.push(p(at(new THREE.BoxGeometry(1.5, 0.25, 0.7), -1.3, 0.62, D / 2 + 0.4), 'stone', '8a7a90'));
  const win = (x: number, y: number, z: number, ry = 0) => {
    parts.push(p(at(new THREE.BoxGeometry(0.9, 0.9, 0.06), x, y, z, ry), 'glowWarm', 'ff9a1a'));
    parts.push(p(at(new THREE.BoxGeometry(1.05, 0.12, 0.14), x, y - 0.5, z, ry), 'darkwood', '3a2418'));
  };
  win(1.2, 0.6 + 1.6, D / 2 + 0.04);
  win(W / 2 + 0.04, 0.6 + 1.6, 0, Math.PI / 2);
  win(-W / 2 - 0.04, 0.6 + 1.6, -0.6, Math.PI / 2);
  if (two) {
    win(-1.2, 0.6 + h1 + 1.2, D / 2 + 0.04);
    win(1.2, 0.6 + h1 + 1.2, D / 2 + 0.04);
  }
  return build(parts);
}

/** Collision footprint of houseGeometry (half extents). */
export const HOUSE_HALF = { hx: 2.95, hz: 2.45 };

export function chapelGeometry(): Prop {
  const parts: Part[] = [
    p(at(new THREE.BoxGeometry(10.4, 2, 6), 0, -0.6, 0), 'stone', '7a6a88'),
    p(at(new THREE.BoxGeometry(10, 5.5, 5.6), 0, 2.75, 0), 'stone', '8a7a98'),
    p(at(gableRoofGeometry(10, 5.6, 3.6, 0.4), 0, 5.5, 0), 'shingle', '2e2848'),
    p(at(new THREE.BoxGeometry(3, 11, 3), -5.2, 5.5, 0), 'stone', '8a7a98'),
    // pyramid roof that matches the square tower (radius = half side × √2)
    p(at(new THREE.ConeGeometry(1.5 * Math.SQRT2 + 0.25, 6, 4), -5.2, 14, 0, Math.PI / 4), 'shingle', '2e2848'),
    p(at(new THREE.BoxGeometry(1.6, 3, 0.25), 5.05, 1.5, 0, Math.PI / 2), 'darkwood', '2a1a12'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), -2, 3.2, 2.85), 'glowCyan', '6a9aff'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), 0.5, 3.2, 2.85), 'glowWarm', 'ffb030'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), 3, 3.2, 2.85), 'glowCyan', '6a9aff'),
    p(at(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 14), -5.2, 8.5, 1.52, 0, Math.PI / 2), 'glowWarm', 'ffc060'),
  ];
  return build(parts);
}

export function bellTowerGeometry(): Prop {
  return build([
    ...[-1.1, 1.1].flatMap((x) => [-1.1, 1.1].map((z) => p(at(new THREE.BoxGeometry(0.4, 7, 0.4), x, 3.5, z), 'darkwood', '3a2418'))),
    p(at(new THREE.ConeGeometry(1.3 * Math.SQRT2 + 0.2, 2.8, 4), 0, 8.4, 0, Math.PI / 4), 'shingle', '3a3050'),
    p(at(new THREE.BoxGeometry(2.7, 0.2, 2.7), 0, 7.0, 0), 'darkwood', '3a2418'),
    p(at(new THREE.CylinderGeometry(0.35, 0.85, 1.2, 12), 0, 6.2, 0), 'metal', 'c08040'),
  ]);
}

export function wellGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(1.2, 1.3, 1, 12), 0, 0.5, 0), 'stone', '9a8aa8'),
    p(at(new THREE.CylinderGeometry(0.95, 0.95, 0.05, 12), 0, 0.85, 0), 'glowCyan', '1a6a8a'),
    p(at(new THREE.BoxGeometry(0.2, 2.4, 0.2), -1, 1.6, 0), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(0.2, 2.4, 0.2), 1, 1.6, 0), 'darkwood', '3a2418'),
    p(at(new THREE.ConeGeometry(1.7, 1.1, 4), 0, 3.2, 0, Math.PI / 4), 'shingle', '3a3050'),
  ]);
}

/** Shrine of name-candles; the ninth candle is never lit. */
export function candleShrineGeometry(): Prop {
  const parts: Part[] = [
    p(at(new THREE.BoxGeometry(2.6, 1, 1.3), 0, 0.5, 0), 'stone', '9a8aa8'),
    p(at(new THREE.BoxGeometry(2.2, 1.8, 0.3), 0, 1.9, -0.5), 'stone', '9a8aa8'),
    p(at(gableRoofGeometry(2.2, 0.8, 0.6, 0.15), 0, 2.8, -0.45), 'shingle', '3a3050'),
  ];
  for (let i = 0; i < 9; i++) {
    const x = -1.0 + (i % 5) * 0.5;
    const z = i < 5 ? 0.3 : -0.1;
    const h = 0.3 + (i % 3) * 0.12;
    parts.push(p(at(new THREE.CylinderGeometry(0.08, 0.08, h, 7), x, 1.0 + h / 2, z), 'plaster', 'f2e6c8'));
    if (i !== 8) parts.push(p(at(new THREE.SphereGeometry(0.08, 6, 5), x, 1.0 + h + 0.12, z, 0, 0, 0, 1, 1.6, 1), 'glowWarm', 'ffd070'));
  }
  return build(parts);
}

export function signpostGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(0.22, 2.8, 0.22), 0, 1.4, 0, 0, 0, 0.05), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(1.6, 0.35, 0.08), 0.6, 2.3, 0, 0.3), 'wood', '7a5a3a'),
    p(at(new THREE.BoxGeometry(1.4, 0.35, 0.08), -0.5, 1.9, 0, -0.6), 'wood', '7a5a3a'),
    p(at(new THREE.BoxGeometry(1.2, 0.35, 0.08), 0.3, 1.5, 0, 1.6), 'wood', '7a5a3a'),
  ]);
}

/** Wrought-iron lantern post with a violet flame (like the skull-mountain road). */
export function violetLanternGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(0.08, 0.12, 3, 6), 0, 1.5, 0), 'metal', '2a2230'),
    p(at(new THREE.BoxGeometry(0.7, 0.08, 0.08), 0.3, 3.0, 0), 'metal', '2a2230'),
    p(at(new THREE.ConeGeometry(0.32, 0.3, 4), 0.62, 2.95, 0, Math.PI / 4), 'metal', '2a2230'),
    p(at(new THREE.BoxGeometry(0.34, 0.5, 0.34), 0.62, 2.55, 0), 'glowViolet', 'ffb030'),
    p(at(new THREE.BoxGeometry(0.4, 0.06, 0.4), 0.62, 2.28, 0), 'metal', '2a2230'),
  ]);
}

// ================================================================== cemetery
export function graveGeometry(variant: number): Prop {
  if (variant % 3 === 0) {
    return build([
      p(at(new THREE.BoxGeometry(0.18, 1.5, 0.18), 0, 0.75, 0, 0, 0, (variant % 4) * 0.05 - 0.07), 'stone', 'a898b8'),
      p(at(new THREE.BoxGeometry(0.85, 0.18, 0.18), 0, 1.1, 0, 0, 0, (variant % 4) * 0.05 - 0.07), 'stone', 'a898b8'),
    ]);
  }
  const h = 1.0 + (variant % 2) * 0.3;
  const lean = (variant % 5) * 0.05 - 0.1;
  return build([
    p(at(new THREE.BoxGeometry(0.85, h, 0.2), 0, h / 2, 0, 0, lean * 0.5, lean), 'stone', 'a898b8'),
    p(at(new THREE.CylinderGeometry(0.425, 0.425, 0.2, 12, 1, false, 0, Math.PI), 0, h, 0, 0, Math.PI / 2, lean), 'stone', 'a898b8'),
    p(at(new THREE.BoxGeometry(0.95, 0.15, 1.9), 0, 0.07, 1), 'organic', '2c4a2e'),
  ]);
}

export function openGraveGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(1.3, 0.05, 2.3), 0, 0.03, 0), 'void', '000000'),
    p(at(new THREE.BoxGeometry(0.45, 0.5, 2.6), 0.95, 0.2, 0), 'organic', '3a2a20'),
    p(at(new THREE.BoxGeometry(0.45, 0.5, 2.6), -0.95, 0.2, 0), 'organic', '3a2a20'),
    p(at(new THREE.DodecahedronGeometry(0.9, 1), 1.9, 0.2, 0.6, 0, 0, 0, 1, 0.6, 1), 'organic', '3a2a20'),
    p(at(new THREE.BoxGeometry(0.9, 1.3, 0.22), 0, 0.65, -1.45, 0, 0, 0.14), 'stone', '8a8098'),
    p(at(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 5), 2.1, 0.7, -0.4, 0, 0, 0.5), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(0.35, 0.45, 0.05), 2.45, 0.05, -0.4, 0, 0, 0.5), 'metal', '6a6078'),
  ]);
}

export function mineEntranceGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(0.5, 4.2, 0.5), -2, 2.1, 0, 0, 0, 0.04), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(0.5, 4.2, 0.5), 2, 2.1, 0, 0, 0, -0.05), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(5.2, 0.6, 0.6), 0, 4.2, 0, 0, 0, 0.03), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(3.6, 3.9, 0.2), 0, 1.95, -0.6), 'glowGreen', '0e3a10'),
    p(at(new THREE.DodecahedronGeometry(3, 1), -3.8, 1.5, -1.5), 'stone', '8a7a98'),
    p(at(new THREE.DodecahedronGeometry(3.2, 1), 4.0, 1.6, -1.6), 'stone', '8a7a98'),
    p(at(new THREE.DodecahedronGeometry(3.6, 1), 0, 5.6, -2.4), 'stone', '8a7a98'),
  ]);
}

// ================================================================== new landscape props
/** Broadleaf tree: a trunk and a clustered round crown. */
export function oakGeometry(variant: number): Prop {
  const parts: Part[] = [
    p(at(new THREE.CylinderGeometry(0.28, 0.45, 3.2, 7), 0, 1.6, 0), 'organic', '4a3424'),
    p(at(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5), 0.6, 3.2, 0.1, 0, 0, -0.6), 'organic', '4a3424'),
  ];
  const blobs: [number, number, number, number][] = [[0, 4.4, 0, 2.1], [1.2, 4.0, 0.6, 1.5], [-1.1, 4.1, -0.5, 1.6], [0.3, 5.3, -0.4, 1.4], [-0.4, 3.8, 1.1, 1.3]];
  const greens = ['2a5a34', '30683a', '3a7440'];
  blobs.forEach(([x, y, z, r], i) => parts.push(p(at(new THREE.IcosahedronGeometry(r, 1), x, y, z), 'foliage', greens[(i + variant) % 3])));
  return build(parts);
}

export function bushGeometry(): Prop {
  return build([
    p(at(new THREE.IcosahedronGeometry(0.8, 1), 0, 0.5, 0, 0, 0, 0, 1.2, 0.8, 1), 'foliage', '2a5a34'),
    p(at(new THREE.IcosahedronGeometry(0.6, 1), 0.6, 0.45, 0.3), 'foliage', '30683a'),
  ]);
}

export function barrelGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), 0, 0.5, 0), 'wood', '7a5432'),
    p(at(new THREE.CylinderGeometry(0.47, 0.47, 0.08, 12), 0, 0.5, 0), 'metal', '4a4048'),
    p(at(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), 0, 0.15, 0), 'metal', '4a4048'),
    p(at(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 12), 0, 0.85, 0), 'metal', '4a4048'),
  ]);
}

export function crateGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(1, 1, 1), 0, 0.5, 0), 'wood', '8a6a40'),
    p(at(new THREE.BoxGeometry(1.04, 0.12, 1.04), 0, 0.94, 0), 'darkwood', '4a3020'),
    p(at(new THREE.BoxGeometry(1.04, 0.12, 1.04), 0, 0.06, 0), 'darkwood', '4a3020'),
  ]);
}

export function hayBaleGeometry(): Prop {
  return build([p(at(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14), 0, 0.75, 0, 0, 0, Math.PI / 2), 'organic', 'c8a050')]);
}

export function cartGeometry(): Prop {
  const parts: Part[] = [
    p(at(new THREE.BoxGeometry(1.6, 0.5, 2.6), 0, 1.0, 0), 'wood', '7a5432'),
    p(at(new THREE.BoxGeometry(0.12, 0.12, 2.4), 0.35, 0.9, -2.3), 'darkwood', '4a3020'),
    p(at(new THREE.BoxGeometry(0.12, 0.12, 2.4), -0.35, 0.9, -2.3), 'darkwood', '4a3020'),
  ];
  for (const x of [-0.95, 0.95]) parts.push(p(at(new THREE.CylinderGeometry(0.62, 0.62, 0.12, 14), x, 0.62, 0.2, 0, 0, Math.PI / 2), 'darkwood', '3a2418'));
  return build(parts);
}

/** One fence section, 3 m long along x. */
export function fenceGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(0.16, 1.2, 0.16), -1.5, 0.6, 0), 'darkwood', '4a3020'),
    p(at(new THREE.BoxGeometry(0.16, 1.2, 0.16), 1.5, 0.6, 0), 'darkwood', '4a3020'),
    p(at(new THREE.BoxGeometry(3.1, 0.12, 0.08), 0, 0.95, 0), 'wood', '7a5a3a'),
    p(at(new THREE.BoxGeometry(3.1, 0.12, 0.08), 0, 0.5, 0), 'wood', '7a5a3a'),
  ]);
}

/** Wooden bridge, length along z, deck top at y = deckY. */
export function bridgeGeometry(length: number, width: number, deckY: number): Prop {
  const parts: Part[] = [p(at(new THREE.BoxGeometry(width, 0.3, length), 0, deckY - 0.15, 0), 'wood', '8a6a44')];
  for (let z = -length / 2 + 0.6; z <= length / 2 - 0.5; z += 0.9) parts.push(p(at(new THREE.BoxGeometry(width + 0.1, 0.06, 0.18), 0, deckY + 0.01, z), 'darkwood', '5a4028'));
  for (const xs of [-1, 1]) {
    parts.push(p(at(new THREE.BoxGeometry(0.14, 0.14, length), xs * (width / 2 - 0.05), deckY + 1.0, 0), 'darkwood', '4a3020'));
    for (let z = -length / 2 + 0.2; z <= length / 2; z += 2) parts.push(p(at(new THREE.BoxGeometry(0.18, 1.1, 0.18), xs * (width / 2 - 0.05), deckY + 0.5, z), 'darkwood', '4a3020'));
    for (const zs of [-1, 1]) parts.push(p(at(new THREE.BoxGeometry(0.4, deckY + 2.5, 0.4), xs * (width / 2 - 0.2), (deckY - 2.5) / 2, zs * (length / 2 - 1.5)), 'darkwood', '3a2418'));
  }
  return build(parts);
}

export function windmillGeometry(): Prop {
  return build([
    p(at(new THREE.CylinderGeometry(2.0, 2.8, 2, 8), 0, -0.2, 0), 'stone', '8a7a90'),
    p(at(new THREE.CylinderGeometry(1.8, 2.6, 9, 8), 0, 4.5, 0), 'plaster', 'e0d0b0'),
    p(at(new THREE.ConeGeometry(2.3, 3.2, 8), 0, 10.6, 0), 'shingle', '5a3a32'),
    p(at(new THREE.BoxGeometry(1.2, 2.2, 0.15), 0, 1.1, -2.55), 'darkwood', '2a1a12'),
    p(at(new THREE.BoxGeometry(0.8, 0.9, 0.08), 0, 5.5, -2.15), 'glowWarm', 'ff9a1a'),
    p(at(new THREE.CylinderGeometry(0.25, 0.25, 1.4, 8), 0, 8.4, -2.1, 0, Math.PI / 2), 'darkwood', '3a2418'),
  ]);
}

/** The four sails, built around the hub (rotate the mesh around z to turn them). */
export function windmillSailsGeometry(): Prop {
  const parts: Part[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const arm = new THREE.BoxGeometry(0.22, 7, 0.15);
    arm.translate(0, 3.6, 0);
    arm.rotateZ(a);
    parts.push(p(arm, 'darkwood', '4a3020'));
    const sail = new THREE.BoxGeometry(1.4, 5.4, 0.05);
    sail.translate(0.85, 4.2, 0.08);
    sail.rotateZ(a);
    parts.push(p(sail, 'plaster', 'd8ccb0'));
  }
  return build(parts);
}

export function standingStoneGeometry(h: number): Prop {
  return build([p(at(new THREE.BoxGeometry(1.1, h, 0.7, 1, 3, 1), 0, h / 2 - 0.3, 0, 0, 0.04, 0.03), 'stone', '8a8098')]);
}

export function ruinTowerGeometry(): Prop {
  const parts: Part[] = [];
  // a broken round tower: wall segments of different heights around a ring
  for (let i = 0; i < 14; i++) {
    if (i === 3 || i === 4) continue; // the doorway
    const a = (i / 14) * Math.PI * 2;
    const h = 3 + ((i * 7) % 5) * 1.6;
    parts.push(p(at(new THREE.BoxGeometry(1.9, h, 0.9), Math.cos(a) * 4, h / 2 - 0.4, Math.sin(a) * 4, -a + Math.PI / 2), 'stone', i % 2 ? '7a7088' : '8a8098'));
  }
  parts.push(p(at(new THREE.DodecahedronGeometry(1.2, 0), 5.5, 0.3, 2.5), 'stone', '7a7088'));
  parts.push(p(at(new THREE.DodecahedronGeometry(0.9, 0), -5.2, 0.2, -3), 'stone', '7a7088'));
  return build(parts);
}

export function tentGeometry(): Prop {
  return build([
    p(at(gableRoofGeometry(2.6, 2.4, 1.8, 0), 0, 0, 0), 'plaster', 'a88a60'),
    p(at(new THREE.BoxGeometry(0.1, 2.2, 0.1), 0, 1.1, -1.2), 'darkwood', '3a2418'),
    p(at(new THREE.BoxGeometry(0.1, 2.2, 0.1), 0, 1.1, 1.2), 'darkwood', '3a2418'),
  ]);
}

export function campfireGeometry(): Prop {
  const parts: Part[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(p(at(new THREE.DodecahedronGeometry(0.28, 0), Math.cos(a) * 0.9, 0.12, Math.sin(a) * 0.9), 'stone', '6a6070'));
  }
  for (let i = 0; i < 4; i++) parts.push(p(at(new THREE.CylinderGeometry(0.1, 0.12, 1.1, 6), 0, 0.3, 0, (i * Math.PI) / 4, 0, 1.25), 'organic', '3a2418'));
  parts.push(p(at(new THREE.ConeGeometry(0.35, 0.9, 7), 0, 0.65, 0), 'glowWarm', 'ff8a10'));
  // log benches
  parts.push(p(at(new THREE.CylinderGeometry(0.25, 0.25, 2, 8), 0, 0.25, 2.2, 0, 0, Math.PI / 2), 'organic', '5a3a24'));
  parts.push(p(at(new THREE.CylinderGeometry(0.25, 0.25, 2, 8), -2.1, 0.25, -0.6, 1.2, 0, Math.PI / 2), 'organic', '5a3a24'));
  return build(parts);
}

export function cropRowGeometry(length: number, color: string): Prop {
  const parts: Part[] = [p(at(new THREE.BoxGeometry(0.9, 0.25, length), 0, 0.05, 0), 'organic', '4a3424')];
  for (let z = -length / 2 + 0.4; z < length / 2; z += 0.6) parts.push(p(at(new THREE.ConeGeometry(0.28, 0.7 + ((z * 7) % 3) * 0.1, 5), 0, 0.5, z), 'foliage', color));
  return build(parts);
}

/** A tall, forgotten bell tower of grey stone; its lamp lights up once the bell is rung. */
export function forgottenBellTowerGeometry(): Prop {
  return build([
    p(at(new THREE.BoxGeometry(3.4, 2, 3.4), 0, -0.6, 0), 'stone', '6a6478'),
    p(at(new THREE.BoxGeometry(2.8, 9, 2.8), 0, 4.5, 0), 'stone', '7a7488'),
    p(at(new THREE.BoxGeometry(3.1, 0.4, 3.1), 0, 9.2, 0), 'stone', '6a6478'),
    ...[-1.2, 1.2].flatMap((x) => [-1.2, 1.2].map((z) => p(at(new THREE.BoxGeometry(0.4, 3, 0.4), x, 10.9, z), 'stone', '7a7488'))),
    p(at(new THREE.ConeGeometry(1.55 * Math.SQRT2 + 0.2, 3.2, 4), 0, 14, 0, Math.PI / 4), 'shingle', '3a3448'),
    p(at(new THREE.CylinderGeometry(0.4, 0.95, 1.3, 12), 0, 11.3, 0), 'metal', 'b08040'),
    p(at(new THREE.BoxGeometry(1.2, 2.2, 0.2), 0, 1.1, 1.45), 'darkwood', '2a1a12'),
  ]);
}

/** A crooked hut on stilts above the marsh water. */
export function stiltHutGeometry(): Prop {
  const parts = [
    ...[-1.6, 1.6].flatMap((x) => [-1.4, 1.4].map((z) => p(at(new THREE.BoxGeometry(0.3, 3.6, 0.3), x, 0.3, z), 'darkwood', '3a2418'))),
    p(at(new THREE.BoxGeometry(4.4, 0.25, 3.8), 0, 2.2, 0), 'wood', '6a4a30'),
    p(at(new THREE.BoxGeometry(3.6, 2.4, 3.0), 0, 3.5, 0), 'wood', '5a4028'),
    p(at(gableRoofGeometry(3.6, 3.0, 2.0, 0.4), 0, 4.7, 0), 'shingle', '3a3448'),
    p(at(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 14), 1.0, 3.6, 1.52, 0, Math.PI / 2), 'glowWarm', 'ffa020'),
    p(at(new THREE.BoxGeometry(0.9, 1.6, 0.1), -0.9, 3.1, 1.52), 'darkwood', '2a1a12'),
    p(at(new THREE.BoxGeometry(1.0, 0.15, 2.6), -0.9, 1.1, 2.6, 0, 0.6), 'wood', '6a4a30'),
  ];
  return build(parts);
}
