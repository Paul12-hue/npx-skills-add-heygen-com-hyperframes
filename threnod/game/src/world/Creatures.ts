import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { resolveCollisions } from '../player/movement';
import type { World } from './World';

/**
 * The animals of the vale. Every species is one InstancedMesh (one draw call
 * for the whole flock); legs, heads, tails and wings are moved in the vertex
 * shader, the walking around is done here on the CPU.
 *
 * Body parts (attribute aPart): 0 body, 1–4 legs (front left, front right,
 * back left, back right), 5 head, 6 tail, 7/8 wings (left/right).
 */

type SpeciesId = 'sheep' | 'cow' | 'deer' | 'rabbit' | 'chicken' | 'crow' | 'frog';

interface SpeciesDef {
  walk: number;
  run: number;
  /** flees when the player comes closer than this (0 = tame) */
  fear: number;
  flies?: boolean;
  hops?: number;
  /** stride length in metres – drives the leg cycle */
  stride: number;
  radius: number;
  amphibious?: boolean;
  grazes: boolean;
}

const SPECIES: Record<SpeciesId, SpeciesDef> = {
  sheep: { walk: 0.7, run: 3.2, fear: 4, stride: 0.6, radius: 0.5, grazes: true },
  cow: { walk: 0.6, run: 2.2, fear: 0, stride: 0.9, radius: 0.8, grazes: true },
  deer: { walk: 1.0, run: 8, fear: 16, stride: 1.0, radius: 0.5, grazes: true },
  rabbit: { walk: 0.8, run: 6, fear: 7, hops: 0.18, stride: 0.5, radius: 0.2, grazes: true },
  chicken: { walk: 0.6, run: 2.6, fear: 2.5, stride: 0.25, radius: 0.25, grazes: true },
  crow: { walk: 0.5, run: 7, fear: 6, flies: true, stride: 0.2, radius: 0.2, grazes: true },
  frog: { walk: 0.4, run: 2.5, fear: 3, hops: 0.12, stride: 0.4, radius: 0.15, amphibious: true, grazes: false },
};

// ------------------------------------------------------------------ geometry
interface PartSpec {
  geo: THREE.BufferGeometry;
  color: string;
  part: number;
  pivot?: [number, number, number];
}

function part(geo: THREE.BufferGeometry, color: string, partId: number, x: number, y: number, z: number, pivot?: [number, number, number], sx = 1, sy = 1, sz = 1, rx = 0): PartSpec {
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz)));
  return { geo, color, part: partId, pivot };
}

function assemble(parts: PartSpec[]): THREE.BufferGeometry {
  const list = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const c = new THREE.Color('#' + p.color);
    const col = new Float32Array(n * 3);
    const prt = new Float32Array(n);
    const piv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col.set([c.r, c.g, c.b], i * 3);
      prt[i] = p.part;
      if (p.pivot) piv.set(p.pivot, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(prt, 1));
    g.setAttribute('aPivot', new THREE.BufferAttribute(piv, 3));
    return g;
  });
  const m = mergeGeometries(list, false)!;
  m.computeVertexNormals();
  return m;
}

const S = (r: number, w = 10, h = 8) => new THREE.SphereGeometry(r, w, h);
const Cyl = (r1: number, r2: number, h: number, seg = 6) => new THREE.CylinderGeometry(r1, r2, h, seg);
const Bx = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z);

function legs(color: string, hx: number, zf: number, zb: number, top: number, r: number, hoof?: string): PartSpec[] {
  const out: PartSpec[] = [];
  const spots: [number, number, number][] = [[hx, zf, 1], [-hx, zf, 2], [hx, zb, 3], [-hx, zb, 4]];
  for (const [x, z, id] of spots) {
    out.push(part(Cyl(r, r * 0.8, top), color, id, x, top / 2, z, [x, top, z]));
    if (hoof) out.push(part(Cyl(r * 0.9, r * 1.0, 0.06), hoof, id, x, 0.03, z, [x, top, z]));
  }
  return out;
}

const GEOMETRY: Record<SpeciesId, () => THREE.BufferGeometry> = {
  sheep: () =>
    assemble([
      part(S(0.42, 10, 8), 'e8e2d4', 0, 0, 0.72, 0, undefined, 1, 0.85, 1.35),
      part(S(0.2, 8, 6), 'e8e2d4', 0, 0, 0.9, -0.4),
      part(S(0.13, 8, 6), '2a2420', 5, 0, 0.88, -0.62, [0, 0.86, -0.42], 0.9, 1, 1.4),
      part(Bx(0.16, 0.05, 0.08), '2a2420', 5, 0, 0.93, -0.55, [0, 0.86, -0.42]),
      part(S(0.08, 6, 4), 'e8e2d4', 6, 0, 0.75, 0.55, [0, 0.78, 0.5]),
      ...legs('2a2420', 0.17, -0.3, 0.3, 0.45, 0.045),
    ]),
  cow: () =>
    assemble([
      part(S(0.5, 12, 9), 'ece4d8', 0, 0, 1.12, 0, undefined, 0.85, 0.82, 1.55),
      part(S(0.3, 8, 6), '4a3024', 0, 0.2, 1.22, 0.25, undefined, 0.5, 0.75, 1.0),
      part(S(0.26, 8, 6), '4a3024', 0, -0.22, 1.05, -0.35, undefined, 0.45, 0.7, 0.9),
      part(S(0.12, 8, 6), 'e0a0a0', 0, 0, 0.72, 0.3, undefined, 1, 0.7, 1),
      part(S(0.22, 10, 8), 'ece4d8', 5, 0, 1.3, -0.95, [0, 1.25, -0.7], 0.85, 0.95, 1.25),
      part(S(0.15, 8, 6), 'd8a090', 5, 0, 1.18, -1.15, [0, 1.25, -0.7], 1, 0.75, 0.85),
      part(new THREE.ConeGeometry(0.04, 0.2, 5), 'e8e0d0', 5, 0.15, 1.52, -0.88, [0, 1.25, -0.7]),
      part(new THREE.ConeGeometry(0.04, 0.2, 5), 'e8e0d0', 5, -0.15, 1.52, -0.88, [0, 1.25, -0.7]),
      part(S(0.07, 6, 4), '4a3024', 5, 0.2, 1.38, -0.86, [0, 1.25, -0.7], 1, 0.6, 1.4),
      part(S(0.07, 6, 4), '4a3024', 5, -0.2, 1.38, -0.86, [0, 1.25, -0.7], 1, 0.6, 1.4),
      part(Cyl(0.025, 0.02, 0.6), '3a2a20', 6, 0, 1.0, 0.8, [0, 1.3, 0.75]),
      ...legs('ece4d8', 0.24, -0.5, 0.5, 0.82, 0.075, '2a2018'),
    ]),
  deer: () =>
    assemble([
      part(S(0.32, 10, 8), '9a6438', 0, 0, 1.05, 0, undefined, 0.9, 0.9, 1.9),
      part(Cyl(0.09, 0.12, 0.6), '9a6438', 5, 0, 1.38, -0.55, [0, 1.15, -0.45], 1, 1, 1, 0.5),
      part(S(0.12, 8, 6), '9a6438', 5, 0, 1.66, -0.72, [0, 1.15, -0.45], 0.9, 0.9, 1.5),
      part(S(0.04, 6, 4), '1a1410', 5, 0, 1.64, -0.9, [0, 1.15, -0.45]),
      part(Bx(0.06, 0.14, 0.03), '8a5a30', 5, 0.08, 1.78, -0.66, [0, 1.15, -0.45]),
      part(Bx(0.06, 0.14, 0.03), '8a5a30', 5, -0.08, 1.78, -0.66, [0, 1.15, -0.45]),
      part(S(0.07, 6, 4), 'f0e8e0', 6, 0, 1.15, 0.6, [0, 1.2, 0.56]),
      ...legs('7a4a28', 0.15, -0.38, 0.38, 0.85, 0.04, '2a2018'),
    ]),
  rabbit: () =>
    assemble([
      part(S(0.15, 8, 6), '8a7a68', 0, 0, 0.17, 0.02, undefined, 1, 0.9, 1.3),
      part(S(0.09, 8, 6), '8a7a68', 5, 0, 0.27, -0.16, [0, 0.22, -0.1]),
      part(Bx(0.035, 0.16, 0.02), '8a7a68', 5, 0.035, 0.42, -0.13, [0, 0.22, -0.1]),
      part(Bx(0.035, 0.16, 0.02), '8a7a68', 5, -0.035, 0.42, -0.13, [0, 0.22, -0.1]),
      part(S(0.05, 6, 4), 'f0ece8', 6, 0, 0.2, 0.2, [0, 0.2, 0.18]),
      ...legs('7a6a58', 0.07, -0.1, 0.12, 0.09, 0.03),
    ]),
  chicken: () =>
    assemble([
      part(S(0.16, 8, 6), 'c87a3a', 0, 0, 0.32, 0.02, undefined, 0.9, 0.9, 1.2),
      part(S(0.08, 8, 6), 'c87a3a', 5, 0, 0.5, -0.14, [0, 0.4, -0.1]),
      part(Bx(0.02, 0.06, 0.07), 'c82a1a', 5, 0, 0.6, -0.14, [0, 0.4, -0.1]),
      part(new THREE.ConeGeometry(0.025, 0.06, 4), 'e8b030', 5, 0, 0.49, -0.23, [0, 0.4, -0.1], 1, 1, 1, -Math.PI / 2),
      part(Bx(0.04, 0.16, 0.12), '8a3a1a', 6, 0, 0.42, 0.18, [0, 0.36, 0.14]),
      part(Bx(0.03, 0.12, 0.2), 'a8642a', 7, 0.15, 0.34, 0.02, [0.12, 0.4, 0]),
      part(Bx(0.03, 0.12, 0.2), 'a8642a', 8, -0.15, 0.34, 0.02, [-0.12, 0.4, 0]),
      part(Cyl(0.015, 0.015, 0.2, 4), 'e8b030', 1, 0.06, 0.1, 0.0, [0.06, 0.2, 0]),
      part(Cyl(0.015, 0.015, 0.2, 4), 'e8b030', 2, -0.06, 0.1, 0.0, [-0.06, 0.2, 0]),
    ]),
  crow: () =>
    assemble([
      part(S(0.1, 8, 6), '1a1820', 0, 0, 0.16, 0, undefined, 0.8, 0.8, 1.5),
      part(S(0.06, 8, 6), '1a1820', 5, 0, 0.24, -0.14, [0, 0.2, -0.1]),
      part(new THREE.ConeGeometry(0.02, 0.07, 4), '2a2830', 5, 0, 0.23, -0.21, [0, 0.2, -0.1], 1, 1, 1, -Math.PI / 2),
      part(Bx(0.06, 0.02, 0.14), '1a1820', 6, 0, 0.17, 0.2, [0, 0.17, 0.13]),
      part(Bx(0.3, 0.015, 0.14), '22202a', 7, 0.18, 0.2, 0, [0.06, 0.2, 0]),
      part(Bx(0.3, 0.015, 0.14), '22202a', 8, -0.18, 0.2, 0, [-0.06, 0.2, 0]),
      part(Cyl(0.01, 0.01, 0.1, 4), '2a2830', 1, 0.03, 0.05, 0, [0.03, 0.1, 0]),
      part(Cyl(0.01, 0.01, 0.1, 4), '2a2830', 2, -0.03, 0.05, 0, [-0.03, 0.1, 0]),
    ]),
  frog: () =>
    assemble([
      part(S(0.1, 8, 6), '4a8a3a', 0, 0, 0.08, 0, undefined, 1.1, 0.6, 1.2),
      part(S(0.03, 6, 4), 'e8e080', 5, 0.045, 0.14, -0.07, [0, 0.1, -0.05]),
      part(S(0.03, 6, 4), 'e8e080', 5, -0.045, 0.14, -0.07, [0, 0.1, -0.05]),
      part(Bx(0.05, 0.04, 0.14), '3a7a2a', 3, 0.09, 0.04, 0.08, [0.08, 0.06, 0.02]),
      part(Bx(0.05, 0.04, 0.14), '3a7a2a', 4, -0.09, 0.04, 0.08, [-0.08, 0.06, 0.02]),
    ]),
};

const VERT_HEAD = /* glsl */ `
  attribute float aPart;
  attribute vec3 aPivot;
  attribute vec4 aAnim; // phase, gait, graze, flap
  mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
  mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
  mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
  mat3 partRot() {
    float ph = aAnim.x;
    float gait = min(aAnim.y, 1.4);
    if (aPart > 0.5 && aPart < 4.5) {
      float off = (aPart < 1.5 || aPart > 3.5) ? 0.0 : 3.14159;
      return rotX(sin(ph + off) * 0.55 * gait);
    }
    if (aPart > 4.5 && aPart < 5.5) return rotX(-aAnim.z * 1.05 + sin(ph * 0.5) * 0.04 * gait);
    if (aPart > 5.5 && aPart < 6.5) return rotY(sin(ph * 1.7 + aAnim.x) * 0.25);
    if (aPart > 6.5 && aPart < 7.5) return rotZ(aAnim.w);
    if (aPart > 7.5) return rotZ(-aAnim.w);
    return mat3(1.0);
  }
`;

/** One species: its instanced mesh and the state of every animal in it. */
interface Animal {
  x: number;
  z: number;
  y: number;
  yaw: number;
  homeX: number;
  homeZ: number;
  homeR: number;
  tx: number;
  tz: number;
  state: 'rest' | 'walk' | 'flee' | 'fly';
  timer: number;
  phase: number;
  gait: number;
  graze: number;
  flap: number;
  alt: number;
  hop: number;
  scale: number;
}

class Flock {
  readonly mesh: THREE.InstancedMesh;
  readonly animals: Animal[] = [];
  private anim: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(readonly id: SpeciesId, readonly def: SpeciesDef, capacity: number) {
    const geo = GEOMETRY[id]();
    this.anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAnim', this.anim);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = VERT_HEAD + sh.vertexShader
        .replace('#include <beginnormal_vertex>', 'mat3 pr = partRot();\nvec3 objectNormal = pr * vec3(normal);')
        .replace('#include <begin_vertex>', 'vec3 transformed = aPart > 0.5 ? aPivot + pr * (position - aPivot) : vec3(position);');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, capacity);
    this.mesh.count = 0;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'creatures-' + id;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  add(x: number, z: number, homeR: number, rnd: () => number, tint: THREE.Color, scale = 1): void {
    const i = this.animals.length;
    if (i >= this.mesh.instanceMatrix.count) return;
    this.animals.push({
      x, z, y: 0, yaw: rnd() * Math.PI * 2, homeX: x, homeZ: z, homeR, tx: x, tz: z,
      state: 'rest', timer: rnd() * 6, phase: rnd() * 10, gait: 0, graze: 0, flap: 0, alt: 0, hop: 0, scale,
    });
    this.mesh.setColorAt(i, tint);
    this.mesh.count = this.animals.length;
  }

  update(dt: number, t: number, world: World, player: THREE.Vector3, cam: THREE.Vector3, rnd: () => number, active: boolean): void {
    const d = this.def;
    for (let i = 0; i < this.animals.length; i++) {
      const a = this.animals[i];
      const camD = Math.hypot(a.x - cam.x, a.z - cam.z);
      const far = camD > 150;
      if (far && a.state !== 'fly') {
        // out of sight: park it (scaled to nothing) and do not simulate
        this.m.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m);
        continue;
      }
      const pd = Math.hypot(a.x - player.x, a.z - player.z);
      if (active && d.fear && pd < d.fear && a.state !== 'flee' && a.state !== 'fly') {
        if (d.flies) {
          a.state = 'fly';
          a.timer = 6 + rnd() * 6;
          const ang = rnd() * Math.PI * 2;
          a.tx = a.homeX + Math.cos(ang) * a.homeR;
          a.tz = a.homeZ + Math.sin(ang) * a.homeR;
        } else {
          a.state = 'flee';
          a.timer = 2.5 + rnd() * 2;
          const ax = a.x - player.x;
          const az = a.z - player.z;
          const l = Math.hypot(ax, az) || 1;
          a.tx = a.x + (ax / l) * 25;
          a.tz = a.z + (az / l) * 25;
        }
      }
      a.timer -= dt;
      let speed = 0;
      switch (a.state) {
        case 'rest':
          if (a.timer < 0) {
            // pick a new spot to wander to (on land unless it likes water, away from walls)
            for (let k = 0; k < 6; k++) {
              const ang = rnd() * Math.PI * 2;
              const r = Math.sqrt(rnd()) * a.homeR;
              const x = a.homeX + Math.cos(ang) * r;
              const z = a.homeZ + Math.sin(ang) * r;
              const h = world.height(x, z);
              if ((d.amphibious || h > 0.35) && world.isFree(x, z, d.radius + 0.3)) {
                a.tx = x;
                a.tz = z;
                a.state = 'walk';
                a.timer = 20;
                break;
              }
            }
            if (a.state === 'rest') a.timer = 1 + rnd() * 3;
          }
          break;
        case 'walk':
          speed = d.walk;
          if (Math.hypot(a.tx - a.x, a.tz - a.z) < 0.4 || a.timer < 0) {
            a.state = 'rest';
            a.timer = 3 + rnd() * 9;
          }
          break;
        case 'flee':
          speed = d.run;
          if (a.timer < 0) {
            a.state = 'rest';
            a.timer = 2 + rnd() * 4;
            a.homeX = a.x;
            a.homeZ = a.z;
          }
          break;
        case 'fly': {
          speed = d.run;
          const target = Math.hypot(a.tx - a.x, a.tz - a.z) < 2 && a.timer < 0 ? 0 : 7 + Math.sin(t * 0.5 + i) * 2;
          a.alt += (target - a.alt) * Math.min(1, dt * 1.2);
          if (a.timer < 0 && Math.hypot(a.tx - a.x, a.tz - a.z) < 2) {
            speed = d.walk;
            if (a.alt < 0.1) {
              a.alt = 0;
              a.state = 'rest';
              a.timer = 3 + rnd() * 6;
            }
          } else if (Math.hypot(a.tx - a.x, a.tz - a.z) < 3) {
            // circle until it is time to land
            const ang = rnd() * Math.PI * 2;
            a.tx = a.homeX + Math.cos(ang) * a.homeR;
            a.tz = a.homeZ + Math.sin(ang) * a.homeR;
          }
          break;
        }
      }
      if (speed > 0) {
        const dx = a.tx - a.x;
        const dz = a.tz - a.z;
        const want = Math.atan2(-dx, -dz);
        let dy = want - a.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        a.yaw += dy * Math.min(1, dt * (a.state === 'walk' ? 2.5 : 6));
        const step = speed * dt;
        let nx = a.x - Math.sin(a.yaw) * step;
        let nz = a.z - Math.cos(a.yaw) * step;
        if (a.state !== 'fly') {
          [nx, nz] = resolveCollisions(nx, nz, d.radius, world.nearby(nx, nz));
          // walking into a lake: turn around
          if (!d.amphibious && world.height(nx, nz) < 0.2) {
            a.state = 'rest';
            a.timer = 0.5;
            nx = a.x;
            nz = a.z;
          }
        }
        a.x = nx;
        a.z = nz;
      }
      const moving = speed > 0 ? speed / Math.max(d.walk, 0.01) : 0;
      a.gait += ((speed > 0 ? Math.min(1.4, 0.7 + speed * 0.12) : 0) - a.gait) * Math.min(1, dt * 6);
      a.phase += (speed * dt / d.stride) * Math.PI;
      // heads go down to graze while resting
      const grazing = d.grazes && a.state === 'rest' && Math.sin(t * 0.3 + i * 1.7) > -0.2 ? 1 : 0;
      a.graze += (grazing - a.graze) * Math.min(1, dt * 2.5);
      if (d.flies) a.flap = a.state === 'fly' ? Math.sin(t * 16 + i) * 0.9 : 0;
      else if (this.id === 'chicken') a.flap = a.state === 'flee' ? Math.sin(t * 20 + i) * 0.7 : 0;
      a.hop = d.hops && speed > 0 ? Math.abs(Math.sin(a.phase)) * d.hops * Math.min(1, moving) : 0;
      a.y = Math.max(d.amphibious ? -0.05 : 0, world.height(a.x, a.z)) + a.alt + a.hop;

      this.q.setFromAxisAngle(this.up, a.yaw);
      this.sc.setScalar(a.scale);
      this.v.set(a.x, a.y, a.z);
      this.m.compose(this.v, this.q, this.sc);
      this.mesh.setMatrixAt(i, this.m);
      this.anim.setXYZW(i, a.phase, a.state === 'fly' ? 0 : a.gait, d.flies && a.state === 'fly' ? 0 : a.graze, a.flap);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.anim.needsUpdate = true;
  }
}

/** All animals, placed in herds and flocks where they belong. */
export class Creatures {
  readonly group = new THREE.Group();
  private flocks = new Map<SpeciesId, Flock>();
  private seed = 1234567;
  private rnd = () => ((this.seed = (this.seed * 16807) % 2147483647) / 2147483647);

  constructor(private world: World) {}

  /** Place a herd of n animals around (x, z). */
  herd(id: SpeciesId, n: number, x: number, z: number, spread: number, roam: number, tints: string[], scale: [number, number] = [0.9, 1.1]): void {
    let f = this.flocks.get(id);
    if (!f) {
      f = new Flock(id, SPECIES[id], 220);
      this.flocks.set(id, f);
      this.group.add(f.mesh);
    }
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 8; k++) {
        const ang = this.rnd() * Math.PI * 2;
        const r = Math.sqrt(this.rnd()) * spread;
        const ax = x + Math.cos(ang) * r;
        const az = z + Math.sin(ang) * r;
        const h = this.world.height(ax, az);
        if ((SPECIES[id].amphibious || h > 0.35) && this.world.isFree(ax, az, 0.6)) {
          const tint = new THREE.Color('#' + tints[Math.floor(this.rnd() * tints.length)]);
          f.add(ax, az, roam, this.rnd, tint, scale[0] + this.rnd() * (scale[1] - scale[0]));
          break;
        }
      }
    }
  }

  get count(): number {
    let n = 0;
    for (const f of this.flocks.values()) n += f.animals.length;
    return n;
  }

  update(dt: number, t: number, player: THREE.Vector3, cam: THREE.Vector3, active: boolean): void {
    for (const f of this.flocks.values()) f.update(dt, t, this.world, player, cam, this.rnd, active);
  }
}
