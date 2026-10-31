import * as THREE from 'three';
import { figureDistance, shapeDistance, type Prim } from './sdf';
import { surfaceNets } from './surfaceNets';
import type { FigureSpec, Joints } from './figures';

const BONES: [string, keyof Joints, string | null][] = [
  ['hips', 'hips', null],
  ['spine', 'spine', 'hips'],
  ['chest', 'chest', 'spine'],
  ['neck', 'neck', 'chest'],
  ['head', 'head', 'neck'],
  ['upperArmL', 'shoulderL', 'chest'],
  ['forearmL', 'elbowL', 'upperArmL'],
  ['handL', 'wristL', 'forearmL'],
  ['upperArmR', 'shoulderR', 'chest'],
  ['forearmR', 'elbowR', 'upperArmR'],
  ['handR', 'wristR', 'forearmR'],
  ['thighL', 'hipL', 'hips'],
  ['shinL', 'kneeL', 'thighL'],
  ['footL', 'ankleL', 'shinL'],
  ['thighR', 'hipR', 'hips'],
  ['shinR', 'kneeR', 'thighR'],
  ['footR', 'ankleR', 'shinR'],
];

interface Built {
  geometry: THREE.BufferGeometry;
}

const cache = new Map<string, Built>();

/** Sculpts the figure into a smooth skinned mesh (cached per design). */
function buildGeometry(spec: FigureSpec, cell: number): Built {
  const key = spec.name + cell;
  const hit = cache.get(key);
  if (hit) return hit;
  const prims = spec.prims;
  const solid = prims.filter((p) => !p.subtract);
  const f = (x: number, y: number, z: number) => figureDistance(prims, x, y, z);
  const { positions, indices } = surfaceNets(f, spec.bounds.min, spec.bounds.max, cell);
  const n = positions.length / 3;

  const normals = new Float32Array(n * 3);
  const colors = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const boneIdx = new Map(BONES.map(([name], i) => [name, i]));
  const primColor = solid.map((p) => new THREE.Color('#' + p.color));
  const e = 0.0015;
  const tmp = new THREE.Color();

  for (let v = 0; v < n; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    // normal = gradient of the distance field
    const gx = f(x + e, y, z) - f(x - e, y, z);
    const gy = f(x, y + e, z) - f(x, y - e, z);
    const gz = f(x, y, z + e) - f(x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    normals.set([gx / gl, gy / gl, gz / gl], v * 3);

    // colour and bone weights from the nearest primitives
    const d = solid.map((p: Prim) => shapeDistance(p.shape, x, y, z));
    const dmin = Math.min(...d);
    let wsum = 0;
    tmp.setRGB(0, 0, 0);
    const perBone = new Map<string, number>();
    for (let i = 0; i < solid.length; i++) {
      const cw = Math.exp(-(d[i] - dmin) / 0.0035);
      if (cw > 0.01) {
        tmp.r += primColor[i].r * cw;
        tmp.g += primColor[i].g * cw;
        tmp.b += primColor[i].b * cw;
        wsum += cw;
      }
      const b = solid[i].bone;
      perBone.set(b, Math.min(perBone.get(b) ?? 1e9, d[i]));
    }
    colors.set([tmp.r / wsum, tmp.g / wsum, tmp.b / wsum], v * 3);
    const ranked = [...perBone.entries()]
      .map(([b, bd]) => [b, Math.exp(-(bd - dmin) / 0.018)] as [string, number])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
    const total = ranked.reduce((s, r) => s + r[1], 0);
    ranked.forEach(([b, w], k) => {
      skinIndex[v * 4 + k] = boneIdx.get(b) ?? 0;
      skinWeight[v * 4 + k] = w / total;
    });
  }

  // make every triangle face outwards
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * normals[a] + ny * normals[a + 1] + nz * normals[a + 2] < 0) {
      const s = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = s;
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeBoundingSphere();
  const built = { geometry: g };
  cache.set(key, built);
  return built;
}

function irisTexture(iris: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 4, 32, 32, 30);
  const col = new THREE.Color('#' + iris);
  const dark = col.clone().multiplyScalar(0.45);
  g.addColorStop(0, '#' + col.clone().lerp(new THREE.Color(1, 1, 1), 0.35).getHexString());
  g.addColorStop(0.7, '#' + col.getHexString());
  g.addColorStop(1, '#' + dark.getHexString());
  x.fillStyle = g;
  x.beginPath();
  x.arc(32, 32, 30, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = '#0a0608';
  x.beginPath();
  x.arc(32, 32, 11, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.95)';
  x.beginPath();
  x.arc(24, 23, 6, 0, Math.PI * 2);
  x.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * A sculpted, skinned character with a face, blinking eyes and a procedural
 * walk / idle animation. Faces −z in its local space.
 */
export class Humanoid {
  readonly root = new THREE.Group();
  private bones = new Map<string, THREE.Bone>();
  private mesh: THREE.SkinnedMesh;
  private lids: THREE.Mesh[] = [];
  private eyes: THREE.Group[] = [];
  private gaze = new THREE.Vector2();
  private gazeTarget = new THREE.Vector2();
  private gazeTimer = 1;
  private phase = 0;
  private blinkTimer = 2 + Math.random() * 3;
  private lookYaw = 0;

  constructor(spec: FigureSpec, opts: { scale?: number; lantern?: boolean; cell?: number } = {}) {
    const scale = opts.scale ?? 1;
    const cell = opts.cell ?? 0.011;
    const { geometry } = buildGeometry(spec, cell);
    const bones: THREE.Bone[] = [];
    for (const [name, joint, parent] of BONES) {
      const b = new THREE.Bone();
      b.name = name;
      const p = spec.joints[joint];
      if (parent) {
        const pp = spec.joints[BONES.find((x) => x[0] === parent)![1]];
        b.position.set(p[0] - pp[0], p[1] - pp[1], p[2] - pp[2]);
        this.bones.get(parent)!.add(b);
      } else {
        b.position.set(p[0], p[1], p[2]);
      }
      this.bones.set(name, b);
      bones.push(b);
    }
    const mat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: 0x3a3048 });
    this.mesh = new THREE.SkinnedMesh(geometry, mat);
    this.mesh.add(bones[0]);
    this.mesh.updateMatrixWorld(true);
    this.mesh.bind(new THREE.Skeleton(bones));
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.root.add(this.mesh);

    // eyes with glossy irises (and lids for blinking), attached to the head bone
    const head = this.bones.get('head')!;
    const hp = spec.joints.head;
    const sclera = new THREE.MeshPhongMaterial({ color: 0xf4eee8, shininess: 90, specular: 0x444444 });
    const irisMat = new THREE.MeshPhongMaterial({
      map: irisTexture(spec.eyes.iris),
      shininess: 100,
      specular: 0x888888,
      emissive: new THREE.Color('#' + spec.eyes.iris),
      emissiveIntensity: spec.eyes.glow,
    });
    const skin = spec.prims.find((p) => p.bone === 'head' && !p.subtract)!.color;
    const lidMat = new THREE.MeshPhongMaterial({ color: '#' + skin, shininess: 30 });
    for (const pos of [spec.eyes.l, spec.eyes.r]) {
      const r = spec.eyes.radius;
      const eye = new THREE.Group();
      eye.position.set(pos[0] - hp[0], pos[1] - hp[1], pos[2] - hp[2]);
      eye.add(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), sclera));
      const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.66, 20), irisMat);
      iris.position.z = -r * 0.94;
      iris.rotation.y = Math.PI;
      eye.add(iris);
      const lid = new THREE.Mesh(new THREE.SphereGeometry(r * 1.12, 14, 10), lidMat);
      lid.visible = false;
      eye.add(lid);
      this.lids.push(lid);
      this.eyes.push(eye);
      head.add(eye);
    }

    if (opts.lantern) this.addLantern();

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 16),
      new THREE.MeshBasicMaterial({ color: 0x05030a, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.03;
    this.root.add(shadow);
    this.root.scale.setScalar(scale);
  }

  /** A small storm lantern in the right hand; its warm light also lights the face. */
  private addLantern(): void {
    const hand = this.bones.get('handR')!;
    const g = new THREE.Group();
    g.position.set(0, -0.13, -0.03);
    const iron = new THREE.MeshPhongMaterial({ color: 0x2a2028, shininess: 90, specular: 0x9a8aa0 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 14, Math.PI), iron);
    handle.position.y = 0.0;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.04, 8), iron);
    top.position.y = -0.04;
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.08, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.4, 0.45) }));
    glass.position.y = -0.1;
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.015, 10), iron);
    bottom.position.y = -0.145;
    const bars = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.09, 0.006), iron);
      const a = (i / 4) * Math.PI * 2 + 0.4;
      bar.position.set(Math.cos(a) * 0.04, -0.1, Math.sin(a) * 0.04);
      bars.add(bar);
    }
    const light = new THREE.PointLight(0xffa850, 2.6, 7, 1.4);
    light.position.y = -0.1;
    g.add(handle, top, glass, bottom, bars, light);
    hand.add(g);
    this.lanternLight = light;
  }

  lanternLight: THREE.PointLight | null = null;

  private bone(n: string): THREE.Bone {
    return this.bones.get(n)!;
  }

  /** speed01: 0 = idle, 1 = walking, ~1.7 = running. */
  animate(dt: number, speed01: number, t: number): void {
    const B = (n: string) => this.bone(n);
    const walk = Math.min(1.4, speed01);
    if (walk > 0.05) this.phase += dt * (5.2 + walk * 3.4);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const a = walk;
    const ease = Math.min(1, dt * 10);
    const set = (b: THREE.Bone, x: number, y = 0, z = 0) => {
      b.rotation.x += (x - b.rotation.x) * ease;
      b.rotation.y += (y - b.rotation.y) * ease;
      b.rotation.z += (z - b.rotation.z) * ease;
    };
    const breathe = Math.sin(t * 1.7) * 0.02;
    set(B('thighL'), s * 0.55 * a);
    set(B('thighR'), -s * 0.55 * a);
    set(B('shinL'), -Math.max(0, -s) * 0.9 * a - 0.04);
    set(B('shinR'), -Math.max(0, s) * 0.9 * a - 0.04);
    set(B('footL'), Math.max(0, -s) * 0.3 * a);
    set(B('footR'), Math.max(0, s) * 0.3 * a);
    set(B('upperArmL'), -s * 0.45 * a + breathe, 0, 0.08);
    set(B('upperArmR'), s * 0.45 * a + breathe, 0, -0.08);
    set(B('forearmL'), 0.25 + Math.max(0, -s) * 0.35 * a);
    set(B('forearmR'), (this.lanternLight ? 0.55 : 0.25) + Math.max(0, s) * 0.35 * a);
    if (this.lanternLight) this.lanternLight.intensity = 2.6 * (0.92 + Math.sin(t * 11) * 0.04 + Math.sin(t * 27) * 0.04);
    set(B('chest'), breathe, -s * 0.06 * a);
    // idle: the head looks around now and then
    if (a < 0.1) this.lookYaw = Math.sin(t * 0.31) * 0.35 * Math.max(0, Math.sin(t * 0.13));
    else this.lookYaw *= 0.9;
    set(B('head'), 0.02 + Math.abs(c) * 0.02 * a, this.lookYaw * 0.6);
    B('hips').position.y = (B('hips').userData.baseY ??= B('hips').position.y) + Math.abs(c) * 0.035 * a - 0.015 * a;

    // idle: shift the weight from one leg to the other, now and then
    const sway = a < 0.1 ? Math.sin(t * 0.55) * 0.035 : 0;
    set(B('hips'), 0, 0, sway);
    set(B('spine'), 0.05 * a + breathe * 0.5, s * 0.08 * a, -sway * 0.6);
    set(B('neck'), -0.03, this.lookYaw * 0.4, -sway * 0.5);

    // the eyes dart around like a living person's
    this.gazeTimer -= dt;
    if (this.gazeTimer < 0) {
      this.gazeTarget.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.25);
      this.gazeTimer = 0.6 + Math.random() * 2.2;
    }
    this.gaze.lerp(this.gazeTarget, Math.min(1, dt * 18));
    for (const e of this.eyes) e.rotation.set(this.gaze.y, this.gaze.x + this.lookYaw * 0.3, 0);

    // blinking
    this.blinkTimer -= dt;
    const closed = this.blinkTimer < 0.12;
    for (const lid of this.lids) lid.visible = closed;
    if (this.blinkTimer < 0) this.blinkTimer = 2.5 + Math.random() * 4;
  }

  /** Turn the head towards a world position (used in conversations). */
  get headBone(): THREE.Bone {
    return this.bone('head');
  }
}
