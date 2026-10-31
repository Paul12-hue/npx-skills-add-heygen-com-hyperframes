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
    p(at(new THREE.ConeGeometry(2.0, 3.0, 7), 0, 2.7, 0), 'foliage', '2a6a50'),
    p(at(new THREE.ConeGeometry(1.55, 2.6, 7), 0, 4.0, 0, 0.45), 'foliage', '307a5a'),
    p(at(new THREE.ConeGeometry(1.0, 2.2, 7), 0, 5.3, 0), 'foliage', '3a8a64'),
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
/** Crooked, leaning timber house with a steep shingle roof and glowing windows. */
export function crookedHouseGeometry(variant: number): Prop {
  const tall = variant % 3 === 0;
  const h1 = 3.0;
  const h2 = tall ? 3.0 : 2.4;
  const roofH = tall ? 6.2 : 5.2;
  const parts: Part[] = [
    p(at(new THREE.BoxGeometry(5.6, 0.7, 4.8), 0, 0.35, 0), 'stone', '9a8aa8'),
    p(at(new THREE.BoxGeometry(5, h1, 4.2), 0, 0.7 + h1 / 2, 0), 'plaster', 'e0c090'),
    p(at(new THREE.BoxGeometry(5.8, h2, 5.0), 0, 0.7 + h1 + h2 / 2, 0.15), 'plaster', 'd0b088'),
    p(at(new THREE.BoxGeometry(6.0, 0.3, 5.2), 0, 0.7 + h1, 0.15), 'darkwood', '3a2418'),
  ];
  // timber frame
  for (const x of [-2.45, -0.8, 0.8, 2.45]) parts.push(p(at(new THREE.BoxGeometry(0.22, h1, 0.22), x, 0.7 + h1 / 2, 2.12), 'darkwood', '3a2418'));
  for (const x of [-2.85, 0, 2.85]) parts.push(p(at(new THREE.BoxGeometry(0.22, h2, 0.22), x, 0.7 + h1 + h2 / 2, 2.67), 'darkwood', '3a2418'));
  parts.push(p(at(new THREE.BoxGeometry(0.2, 3.4, 0.2), -1.4, 0.7 + h1 + h2 / 2, 2.68, 0, 0, 0.75), 'darkwood', '3a2418'));
  // steep roof: a stretched four-sided cone, slightly twisted
  const roof = new THREE.ConeGeometry(4.4, roofH, 4, 1);
  parts.push(p(at(roof, 0, 0.7 + h1 + h2 + roofH / 2 - 0.2, 0.15, Math.PI / 4 + 0.05, 0, 0, 1, 1, 0.82), 'shingle', '3a3050'));
  // chimney, leaning
  parts.push(p(at(new THREE.BoxGeometry(0.8, 3.4, 0.8), 1.6, 0.7 + h1 + h2 + 1.6, -0.9, 0, 0, -0.12), 'stone', '8a7a98'));
  // door
  parts.push(p(at(new THREE.BoxGeometry(1.1, 2.1, 0.12), -1.6, 1.75, 2.15), 'darkwood', '2a1a12'));
  // glowing windows
  parts.push(p(at(new THREE.BoxGeometry(0.9, 1.0, 0.1), 1.0, 2.3, 2.16), 'glowWarm', 'ff9a1a'));
  parts.push(p(at(new THREE.BoxGeometry(0.8, 0.9, 0.1), -1.4, 0.7 + h1 + h2 / 2, 2.71), 'glowWarm', 'ff9a1a'));
  parts.push(p(at(new THREE.BoxGeometry(0.8, 0.9, 0.1), 1.4, 0.7 + h1 + h2 / 2, 2.71), 'glowWarm', 'ff8a10'));
  parts.push(p(at(new THREE.BoxGeometry(0.1, 0.9, 0.8), 2.56, 2.3, 0), 'glowWarm', 'ff9a1a'));
  parts.push(p(at(new THREE.BoxGeometry(0.1, 0.9, 0.8), -2.56, 2.3, -0.6), 'glowWarm', 'ff8a10'));
  // round gable window
  parts.push(p(at(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 14), 0, 0.7 + h1 + h2 + 1.2, 1.55, 0, Math.PI / 2), 'glowWarm', 'ffa020'));
  parts.push(p(at(new THREE.TorusGeometry(0.58, 0.09, 5, 14), 0, 0.7 + h1 + h2 + 1.2, 1.6), 'darkwood', '2a1a12'));
  return build(parts, variant % 2 === 0 ? 0.05 : -0.04);
}

export function chapelGeometry(): Prop {
  const roof = new THREE.ConeGeometry(4.2, 5, 4);
  return build([
    p(at(new THREE.BoxGeometry(10, 5.5, 5.6), 0, 2.75, 0), 'stone', '9a8aa8'),
    p(at(roof, 0.2, 7.6, 0, Math.PI / 4, 0, 0, 1.75, 1, 0.75), 'shingle', '2e2848'),
    p(at(new THREE.BoxGeometry(2.8, 11, 2.8), -5.2, 5.5, 0), 'stone', '9a8aa8'),
    p(at(new THREE.ConeGeometry(2.2, 7, 4), -5.2, 14.5, 0, Math.PI / 4), 'shingle', '2e2848'),
    p(at(new THREE.BoxGeometry(1.6, 3, 0.25), 5.05, 1.5, 0, Math.PI / 2), 'darkwood', '2a1a12'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), -2, 3.2, 2.85), 'glowMagenta', 'ff4ad0'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), 0.5, 3.2, 2.85), 'glowCyan', '40d0ff'),
    p(at(new THREE.BoxGeometry(0.7, 2.4, 0.1), 3, 3.2, 2.85), 'glowMagenta', 'ff4ad0'),
    p(at(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 14), -5.2, 8.5, 1.45, 0, Math.PI / 2), 'glowViolet', 'b060ff'),
  ]);
}

export function bellTowerGeometry(): Prop {
  return build([
    ...[-1.1, 1.1].flatMap((x) => [-1.1, 1.1].map((z) => p(at(new THREE.BoxGeometry(0.4, 7, 0.4), x, 3.5, z), 'darkwood', '3a2418'))),
    p(at(new THREE.ConeGeometry(2.3, 2.8, 4), 0, 8.3, 0, Math.PI / 4), 'shingle', '3a3050'),
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
    p(at(new THREE.ConeGeometry(1.4, 1.0, 4), 0, 3.2, -0.5, Math.PI / 4, 0, 0, 1, 1, 0.3), 'shingle', '3a3050'),
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
    p(at(new THREE.BoxGeometry(0.34, 0.5, 0.34), 0.62, 2.55, 0), 'glowViolet', '9a30ff'),
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
