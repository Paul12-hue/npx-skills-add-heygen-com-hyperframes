import * as THREE from 'three';
import type { SculptJob, SculptResult } from './sculpt';
import { sculptService } from './SculptService';
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

/** Things a villager can be busy with (overrides the arms, sometimes the whole body). */
export type Action = 'chop' | 'hammer' | 'hoe' | 'sweep' | 'fish' | 'sit' | 'talk' | 'carry' | 'wave' | 'gather';
export type Tool = 'axe' | 'hammer' | 'hoe' | 'broom' | 'rod' | 'basket' | 'crate' | null;

/** Geometry for one shape at one detail level in one palette; the shape data is shared. */
const baseGeos = new Map<string, THREE.BufferGeometry>();
function geometryFor(r: SculptResult, palette: Record<string, string> | undefined): THREE.BufferGeometry {
  let base = baseGeos.get(r.key);
  if (!base) {
    base = new THREE.BufferGeometry();
    base.setAttribute('position', new THREE.BufferAttribute(r.positions, 3));
    base.setAttribute('normal', new THREE.BufferAttribute(r.normals, 3));
    base.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(r.skinIndex, 4));
    base.setAttribute('skinWeight', new THREE.BufferAttribute(r.skinWeight, 4));
    base.setIndex(new THREE.BufferAttribute(r.indices, 1));
    base.computeBoundingSphere();
    baseGeos.set(r.key, base);
  }
  // dress the shape: every vertex mixes up to three palette colours
  const cols = r.slots.map((sl) => new THREE.Color('#' + (palette?.[sl] ?? sl)));
  const n = r.positions.length / 3;
  const color = new Float32Array(n * 3);
  for (let v = 0; v < n; v++) {
    let cr = 0;
    let cg = 0;
    let cb = 0;
    for (let k = 0; k < 3; k++) {
      const w = r.slotWeight[v * 3 + k];
      if (!w) continue;
      const c = cols[r.slotIndex[v * 3 + k]];
      cr += c.r * w;
      cg += c.g * w;
      cb += c.b * w;
    }
    color[v * 3] = cr;
    color[v * 3 + 1] = cg;
    color[v * 3 + 2] = cb;
  }
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) g.setAttribute(k, base.getAttribute(k));
  g.setIndex(base.getIndex());
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.boundingSphere = base.boundingSphere;
  return g;
}

export function sculptJob(spec: FigureSpec, cell: number): SculptJob {
  return { key: (spec.shapeKey ?? spec.name) + '@' + cell, prims: spec.prims, bounds: spec.bounds, cell, bones: BONES.map((b) => b[0]) };
}

const toolMats = new Map<string, THREE.MeshPhongMaterial>();
function toolMat(hex: number): THREE.MeshPhongMaterial {
  const k = hex.toString(16);
  let m = toolMats.get(k);
  if (!m) toolMats.set(k, (m = new THREE.MeshPhongMaterial({ color: hex, shininess: 30 })));
  return m;
}

/** Simple hand tools, held in the right hand (the hand points down its −y axis). */
function toolMesh(kind: Exclude<Tool, null>): THREE.Object3D {
  const g = new THREE.Group();
  const wood = toolMat(0x6a4a2a);
  const iron = toolMat(0x5a5a66);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    g.add(mesh);
  };
  switch (kind) {
    case 'axe':
      add(new THREE.CylinderGeometry(0.018, 0.022, 0.8, 6), wood, 0, -0.1, -0.25, Math.PI / 2);
      add(new THREE.BoxGeometry(0.03, 0.16, 0.12), iron, 0, -0.1, -0.62);
      break;
    case 'hammer':
      add(new THREE.CylinderGeometry(0.016, 0.018, 0.4, 6), wood, 0, -0.08, -0.15, Math.PI / 2);
      add(new THREE.BoxGeometry(0.06, 0.06, 0.13), iron, 0, -0.08, -0.34, Math.PI / 2);
      break;
    case 'hoe':
      add(new THREE.CylinderGeometry(0.018, 0.018, 1.4, 6), wood, 0, -0.08, -0.4, Math.PI / 2);
      add(new THREE.BoxGeometry(0.16, 0.14, 0.02), iron, 0, -0.16, -1.08);
      break;
    case 'broom':
      add(new THREE.CylinderGeometry(0.016, 0.016, 1.3, 6), wood, 0, -0.3, -0.1, 0.4);
      add(new THREE.ConeGeometry(0.11, 0.35, 8), toolMat(0xb8984a), 0, -0.95, 0.15, 0.4 + Math.PI);
      break;
    case 'rod':
      add(new THREE.CylinderGeometry(0.008, 0.016, 2.6, 5), wood, 0, 0.1, -1.2, Math.PI / 2 - 0.5);
      break;
    case 'basket':
      add(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 10), toolMat(0x9a7a4a), 0, 0, 0);
      add(new THREE.SphereGeometry(0.14, 8, 6), toolMat(0xb83a2a), 0, 0.08, 0);
      break;
    case 'crate':
      add(new THREE.BoxGeometry(0.42, 0.3, 0.32), toolMat(0x8a6a40), 0, 0, 0);
      break;
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
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
  private lids: THREE.Mesh[] = [];
  private eyes: THREE.Group[] = [];
  private gaze = new THREE.Vector2();
  private gazeTarget = new THREE.Vector2();
  private gazeTimer = 1;
  private phase = 0;
  private blinkTimer = 2 + Math.random() * 3;
  private lookYaw = 0;

  /** Detail levels: [near mesh, far mesh]; the far one has a quarter of the triangles. */
  private lodMeshes: (THREE.SkinnedMesh | null)[] = [];
  private lodLevel = -1;
  private requested = new Set<number>();
  private material: THREE.Material;
  private skeleton: THREE.Skeleton;
  private spec: FigureSpec;
  private cells: number[];
  private lazyNear = false;
  /** true once at least one detail level has been built */
  ready = false;
  private blob: THREE.Mesh | null = null;
  /** called when the first mesh appears */
  onReady: (() => void) | null = null;
  /** false while the figure is too far away to be drawn (skip its animation too). */
  inView = true;

  constructor(spec: FigureSpec, opts: { scale?: number; lantern?: boolean; cell?: number; lods?: number[]; ghost?: boolean; priority?: number; lazyNear?: boolean } = {}) {
    const scale = opts.scale ?? 1;
    const cells = opts.cell ? [opts.cell] : opts.lods ?? [0.017, 0.03];
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
    this.material = Humanoid.material(!!opts.ghost);
    this.skeleton = new THREE.Skeleton(bones);
    this.root.add(bones[0]);
    bones[0].visible = false; // eyes, tools and lantern appear together with the body
    this.spec = spec;
    this.cells = cells;
    this.lodMeshes = cells.map(() => null);
    const priority = opts.priority ?? 1;
    // the coarse level first, the fine level right away too unless it may wait until the figure is near
    for (let i = cells.length - 1; i >= 0; i--) {
      if (i === 0 && cells.length > 1 && opts.lazyNear) continue;
      this.requestLevel(i, priority + (i === 0 && cells.length > 1 ? 1 : 0));
    }
    this.lazyNear = !!opts.lazyNear && cells.length > 1;
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
      // a resting upper eyelid covers the top of the eye – relaxed instead of staring
      const upper = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.36), lidMat);
      upper.rotation.x = -0.35;
      eye.add(upper);
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
    shadow.visible = this.ready;
    this.blob = shadow;
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

  private static mats = new Map<boolean, THREE.MeshPhongMaterial>();
  /** One shared material for all figures (fewer shader switches). */
  private static material(ghost: boolean): THREE.MeshPhongMaterial {
    let m = Humanoid.mats.get(ghost);
    if (!m) {
      m = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 10, specular: 0x14101a });
      if (ghost) {
        // the Faded: see-through and softly glowing
        m.transparent = true;
        m.opacity = 0.5;
        m.depthWrite = false;
        m.emissive = new THREE.Color(0x30343c);
      }
      Humanoid.mats.set(ghost, m);
    }
    return m;
  }

  private requestLevel(i: number, priority: number): void {
    if (this.requested.has(i)) return;
    this.requested.add(i);
    sculptService.request(sculptJob(this.spec, this.cells[i]), priority, (r) => {
      const m = new THREE.SkinnedMesh(geometryFor(r, this.spec.palette), this.material);
      m.castShadow = i === 0;
      m.frustumCulled = false;
      m.visible = false;
      this.root.add(m);
      this.root.updateMatrixWorld(true);
      m.bind(this.skeleton);
      this.lodMeshes[i] = m;
      this.lodLevel = -1; // re-pick on the next update
      this.setLod(this.wantLevel);
      if (!this.ready) {
        this.ready = true;
        this.bones.get('hips')!.visible = true;
        if (this.blob) this.blob.visible = true;
        this.root.visible = this.inView;
        this.onReady?.();
      }
    });
  }

  private wantLevel = 0;

  private setLod(level: number): void {
    this.wantLevel = level;
    // use the wanted level if it is built, otherwise any level that is
    let use = this.lodMeshes[level] ? level : this.lodMeshes.findIndex((m) => m);
    if (use < 0) use = -1;
    // the eyes are too small to see from afar – save their draw calls
    for (const e of this.eyes) e.visible = level === 0;
    if (use === this.lodLevel) return;
    this.lodLevel = use;
    this.lodMeshes.forEach((m, i) => m && (m.visible = i === use));
  }

  /**
   * Picks the detail level from the camera distance; hides the figure entirely
   * beyond maxDist. Returns whether the figure is drawn.
   */
  updateLod(camera: THREE.Vector3, maxDist = 75, nearDist = 16): boolean {
    const d = camera.distanceTo(this.root.position);
    this.inView = d < maxDist;
    this.root.visible = this.inView && this.ready;
    if (!this.inView) return false;
    const level = d < nearDist || this.cells.length === 1 ? 0 : 1;
    // fine detail is only sculpted once somebody comes close
    if (this.lazyNear && d < nearDist * 1.6) this.requestLevel(0, 0);
    this.setLod(level);
    return this.ready;
  }

  private bone(n: string): THREE.Bone {
    return this.bones.get(n)!;
  }

  /** speed01: 0 = idle, 1 = walking, ~1.7 = running. */
  /**
   * Procedural animation. speed01: 0 = idle, 1 = walking, ~1.75 = running.
   * The stride advances with the distance covered, so the feet do not slide.
   */
  animate(dt: number, speed01: number, t: number, airborne = false): void {
    const B = (n: string) => this.bone(n);
    const a = Math.min(1, speed01); // walk weight
    const run = Math.min(1, Math.max(0, (speed01 - 1.05) / 0.6)); // run weight
    const metres = speed01 * 4.2 * dt;
    const stepLen = 0.72 + run * 0.45; // one step = half a gait cycle
    if (a > 0.03) this.phase += (metres / stepLen) * Math.PI;
    const ease = Math.min(1, dt * 14);
    const set = (b: THREE.Bone, x: number, y = 0, z = 0) => {
      b.rotation.x += (x - b.rotation.x) * ease;
      b.rotation.y += (y - b.rotation.y) * ease;
      b.rotation.z += (z - b.rotation.z) * ease;
    };
    const breathe = Math.sin(t * 1.7) * 0.02;
    const legs = (phi: number, side: 'L' | 'R') => {
      const sw = Math.sin(phi);
      const forward = Math.max(0, Math.cos(phi)); // leg swinging forward
      const thigh = sw * (0.42 + 0.3 * run) * a;
      const knee = -((0.06 + (0.6 + 0.65 * run) * Math.pow(forward, 1.4)) * a + 0.12 * a * Math.max(0, sw)) - 0.04;
      set(B('thigh' + side), thigh - 0.12 * run);
      set(B('shin' + side), knee);
      set(B('foot' + side), -thigh * 0.35 - knee * 0.45 + 0.2 * a * Math.max(0, -sw));
    };
    const arms = (phi: number, side: 'L' | 'R', outward: number) => {
      const sw = Math.sin(phi);
      const lantern = side === 'R' && this.lanternLight ? 0.4 : 0;
      set(B('upperArm' + side), -sw * (0.42 + 0.35 * run) * a * (lantern ? 0.5 : 1) + breathe + run * 0.15, 0, outward * (1 + run));
      set(B('forearm' + side), 0.18 + 0.2 * a + 1.0 * run + 0.25 * a * Math.max(0, -sw) + lantern);
    };

    if (airborne) {
      set(B('thighL'), 0.7);
      set(B('shinL'), -1.1);
      set(B('thighR'), 0.1);
      set(B('shinR'), -0.5);
      set(B('upperArmL'), 0.5, 0, 0.5);
      set(B('upperArmR'), 0.3, 0, -0.5);
      set(B('forearmL'), 0.6);
      set(B('forearmR'), 0.8);
      set(B('spine'), 0.12);
    } else {
      const phi = this.phase;
      legs(phi, 'L');
      legs(phi + Math.PI, 'R');
      arms(phi, 'L', 0.09);
      arms(phi + Math.PI, 'R', -0.09);
    }
    if (this.lanternLight) this.lanternLight.intensity = 2.6 * (0.92 + Math.sin(t * 11) * 0.04 + Math.sin(t * 27) * 0.04);

    const sw = Math.sin(this.phase);
    // pelvis: up at mid-stance, down when both feet touch; rolls and turns with the stride
    const hips = B('hips');
    hips.position.y = (hips.userData.baseY ??= hips.position.y) + (0.022 + 0.02 * run) * a * Math.cos(2 * this.phase) - 0.02 * a - 0.06 * run;
    const idleSway = a < 0.1 ? Math.sin(t * 0.55) * 0.035 : 0;
    set(hips, 0, sw * 0.12 * a, sw * 0.05 * a + idleSway);
    // the upper body turns against the hips and leans into a run
    set(B('spine'), 0.03 * a + 0.22 * run + breathe * 0.5, -sw * 0.08 * a, -idleSway * 0.6 - sw * 0.03 * a);
    set(B('chest'), breathe + 0.05 * run, -sw * 0.12 * a);
    // idle: the head looks around now and then; walking: it stays steady
    if (a < 0.1) this.lookYaw = Math.sin(t * 0.31) * 0.35 * Math.max(0, Math.sin(t * 0.13));
    else this.lookYaw *= 0.9;
    set(B('neck'), -0.03 - 0.1 * run, this.lookYaw * 0.4 + sw * 0.05 * a, -idleSway * 0.5);
    set(B('head'), 0.02 - 0.08 * run, this.lookYaw * 0.6 + sw * 0.06 * a, -sw * 0.03 * a);

    if (this.action) {
      // the action wins over the walk / idle pose (it is a smooth cycle itself)
      const hard = (b: THREE.Bone, x: number, y = 0, z = 0) => b.rotation.set(x, y, z);
      this.applyAction(this.action, t + this.actionPhase, hard);
    }

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

  action: Action | null = null;
  private actionPhase = Math.random() * 10;
  private tool: THREE.Object3D | null = null;

  /** Put a tool (or nothing) into the right hand. */
  setTool(kind: Tool): void {
    if (this.tool) this.tool.removeFromParent();
    this.tool = kind ? toolMesh(kind) : null;
    if (!this.tool) return;
    if (kind === 'basket' || kind === 'crate') {
      this.tool.position.set(0, 1.0, -0.32);
      this.bone('chest').add(this.tool);
      this.tool.position.set(0, -0.2, -0.3);
    } else this.bone('handR').add(this.tool);
  }

  private applyAction(a: Action, t: number, set: (b: THREE.Bone, x: number, y?: number, z?: number) => void): void {
    const B = (n: string) => this.bone(n);
    const hips = B('hips');
    const base = (hips.userData.baseY as number) ?? hips.position.y;
    switch (a) {
      case 'chop': {
        // both hands on the axe: up over the shoulder, then a hard swing down
        const c = (t % 1.6) / 1.6;
        const up = c < 0.65 ? c / 0.65 : 1 - (c - 0.65) / 0.35;
        const k = up * up * (3 - 2 * up);
        for (const sd of ['L', 'R']) {
          set(B('upperArm' + sd), 0.7 + k * 2.1, 0, sd === 'L' ? -0.35 : 0.35);
          set(B('forearm' + sd), 0.5 + k * 0.6);
        }
        set(B('spine'), 0.25 - k * 0.3);
        break;
      }
      case 'hammer': {
        const c = (t % 0.9) / 0.9;
        const k = c < 0.6 ? c / 0.6 : 1 - (c - 0.6) / 0.4;
        set(B('upperArmR'), 0.6 + k * 1.3, 0, -0.1);
        set(B('forearmR'), 0.9 + k * 0.6);
        set(B('upperArmL'), 0.7, 0, 0.15);
        set(B('forearmL'), 1.1);
        set(B('spine'), 0.2);
        break;
      }
      case 'hoe': {
        const c = (t % 1.8) / 1.8;
        const k = Math.sin(c * Math.PI * 2) * 0.5 + 0.5;
        for (const sd of ['L', 'R']) {
          set(B('upperArm' + sd), 0.6 + k * 0.9, 0, sd === 'L' ? -0.3 : 0.3);
          set(B('forearm' + sd), 0.3 + k * 0.5);
        }
        set(B('spine'), 0.35 - k * 0.15);
        set(B('chest'), 0.1);
        break;
      }
      case 'sweep': {
        const k = Math.sin(t * 2.6);
        for (const sd of ['L', 'R']) {
          set(B('upperArm' + sd), 0.55, k * 0.35, sd === 'L' ? -0.25 : 0.25);
          set(B('forearm' + sd), 0.5);
        }
        set(B('spine'), 0.22, k * 0.25);
        break;
      }
      case 'fish': {
        const bob = Math.sin(t * 0.8) * 0.04;
        set(B('upperArmR'), 0.9 + bob, 0, 0.1);
        set(B('forearmR'), 0.5);
        set(B('upperArmL'), 0.7 + bob, 0, -0.25);
        set(B('forearmL'), 0.9);
        break;
      }
      case 'sit': {
        hips.position.y = base - 0.44 * (this.root.scale.y || 1);
        for (const sd of ['L', 'R']) {
          set(B('thigh' + sd), 1.45, 0, sd === 'L' ? 0.08 : -0.08);
          set(B('shin' + sd), -1.4);
          set(B('foot' + sd), 0);
          set(B('upperArm' + sd), 0.35, 0, sd === 'L' ? -0.1 : 0.1);
          set(B('forearm' + sd), 0.9);
        }
        set(B('spine'), 0.05 + Math.sin(t * 0.4) * 0.03);
        break;
      }
      case 'talk': {
        // gestures with one hand, nods now and then
        const g = Math.sin(t * 1.3) * 0.5 + 0.5;
        set(B('upperArmR'), 0.25 + g * 0.5, 0, 0.15);
        set(B('forearmR'), 0.9 + g * 0.6);
        set(B('upperArmL'), 0.1, 0, -0.1);
        set(B('forearmL'), 0.3);
        set(B('head'), Math.max(0, Math.sin(t * 2.1)) * 0.12, Math.sin(t * 0.7) * 0.2);
        break;
      }
      case 'carry': {
        for (const sd of ['L', 'R']) {
          set(B('upperArm' + sd), 0.5, 0, sd === 'L' ? -0.3 : 0.3);
          set(B('forearm' + sd), 1.3);
        }
        break;
      }
      case 'wave': {
        set(B('upperArmR'), 0.3, 0, -2.4);
        set(B('forearmR'), 0.3 + Math.sin(t * 7) * 0.4);
        break;
      }
      case 'gather': {
        // bending down to pick something up from the ground, then standing again
        const c = (t % 3.2) / 3.2;
        const k = Math.sin(c * Math.PI) ** 2;
        set(B('spine'), 0.2 + k * 0.7);
        set(B('chest'), k * 0.3);
        for (const sd of ['L', 'R']) {
          set(B('upperArm' + sd), k * 1.0, 0, sd === 'L' ? -0.1 : 0.1);
          set(B('forearm' + sd), 0.3);
          set(B('thigh' + sd), k * 0.5);
          set(B('shin' + sd), -k * 0.8);
        }
        hips.position.y = base - k * 0.12;
        break;
      }
    }
  }

  /** Turn the head towards a world position (used in conversations). */
  get headBone(): THREE.Bone {
    return this.bone('head');
  }
}
