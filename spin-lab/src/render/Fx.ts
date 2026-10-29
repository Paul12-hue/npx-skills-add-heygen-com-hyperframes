// Visual effects and level dressing: particles, shockwaves, targets, obstacles, trajectories.

import * as THREE from 'three';
import { PALETTE, TABLE } from '../config';
import type { Box, Sample, V3 } from '../physics/ballPhysics';
import type { TargetDef } from '../game/experiments';
import { Lab } from './Lab';
import { radialTexture } from './textures';

const TOP = TABLE.height;
const MAX_PARTICLES = 700;

export interface BurstOpts {
  count: number;
  color: number;
  speed: number;
  life: number;
  size: number;
  gravity?: number;
  spread?: V3;
  up?: number;
  drag?: number;
}

class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 3);
  private size = new Float32Array(MAX_PARTICLES);
  private alpha = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private grav = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private baseSize = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  budget = 1;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
      uniforms: { uScale: { value: 600 } },
      vertexShader: /* glsl */`
        attribute float aSize; attribute float aAlpha; varying vec3 vColor; varying float vAlpha;
        uniform float uScale;
        void main(){
          vColor = color; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          gl_FragColor = vec4(vColor * (1.0 + (1.0 - d * 2.0) * 0.6), a * vAlpha);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setViewport(h: number) { (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9; }

  burst(at: V3, o: BurstOpts) {
    const c = new THREE.Color(o.color);
    const n = Math.max(1, Math.round(o.count * this.budget));
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const sp = o.spread ?? { x: 0, y: 0, z: 0 };
      this.pos[i * 3] = at.x + (Math.random() - 0.5) * sp.x;
      this.pos[i * 3 + 1] = at.y + (Math.random() - 0.5) * sp.y;
      this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * sp.z;
      // random direction on a sphere, biased upwards
      const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = o.speed * (0.35 + Math.random() * 0.65);
      this.vel[i * 3] = r * Math.cos(th) * s;
      this.vel[i * 3 + 1] = Math.abs(u) * s * (o.up ?? 0.5) + (o.up ?? 0) * s * 0.5;
      this.vel[i * 3 + 2] = r * Math.sin(th) * s;
      this.life[i] = this.maxLife[i] = o.life * (0.6 + Math.random() * 0.4);
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
      this.baseSize[i] = o.size * (0.6 + Math.random() * 0.6);
      const tint = 0.85 + Math.random() * 0.3;
      this.col[i * 3] = c.r * tint; this.col[i * 3 + 1] = c.g * tint; this.col[i * 3 + 2] = c.b * tint;
    }
  }

  update(dt: number) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const f = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= f; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * f - this.grav[i] * dt; this.vel[i * 3 + 2] *= f;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      this.alpha[i] = Math.min(1, k * 1.6);
      this.size[i] = this.baseSize[i] * (0.4 + k * 0.6);
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Expanding ring on a horizontal surface. */
class Shockwaves {
  private pool: { mesh: THREE.Mesh; t: number; dur: number; size: number }[] = [];
  constructor(scene: THREE.Scene) {
    for (let i = 0; i < 8; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uT: { value: 1 }, uColor: { value: new THREE.Color(PALETTE.cyan) }, uWidth: { value: 0.08 } },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
        fragmentShader: /* glsl */`
          uniform float uT; uniform vec3 uColor; uniform float uWidth; varying vec2 vUv;
          void main(){
            float d = length(vUv - 0.5) * 2.0;
            float r = uT;
            float ring = smoothstep(uWidth, 0.0, abs(d - r));
            float inner = smoothstep(r, 0.0, d) * 0.12;
            float a = (ring + inner) * (1.0 - uT) * step(d, 1.0);
            gl_FragColor = vec4(uColor, a);
          }`,
      });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.pool.push({ mesh, t: 1, dur: 1, size: 1 });
    }
  }
  spawn(at: V3, color: number, size: number, dur: number, width = 0.08) {
    const s = this.pool.reduce((a, b) => (b.t >= a.t ? b : a));
    s.t = 0; s.dur = dur; s.size = size;
    s.mesh.visible = true;
    s.mesh.position.set(at.x, at.y + 0.002, at.z);
    s.mesh.scale.set(size * 2, size * 2, 1);
    const u = (s.mesh.material as THREE.ShaderMaterial).uniforms;
    u.uColor.value.set(color);
    u.uWidth.value = width;
  }
  update(dt: number) {
    for (const s of this.pool) {
      if (s.t >= 1) { s.mesh.visible = false; continue; }
      s.t = Math.min(1, s.t + dt / s.dur);
      (s.mesh.material as THREE.ShaderMaterial).uniforms.uT.value = 1 - Math.pow(1 - s.t, 2.2);
    }
  }
}

/** Target visuals (disc on the table, or a floating ring). */
export class TargetView {
  readonly group = new THREE.Group();
  private disc: THREE.Mesh;
  private ring: THREE.Group;
  private discMat: THREE.ShaderMaterial;
  private hit = 0;
  def?: TargetDef;
  constructor(scene: THREE.Scene) {
    this.discMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        uTime: { value: 0 }, uColor: { value: new THREE.Color(PALETTE.cyan) }, uHot: { value: new THREE.Color(PALETTE.orange) },
        uPerfect: { value: 0.3 }, uHit: { value: 0 }, uGate: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uColor; uniform vec3 uHot; uniform float uPerfect; uniform float uHit; uniform float uGate;
        varying vec2 vUv;
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float d = length(p);
          if (d > 1.18) discard;
          float a = atan(p.y, p.x);
          float outer = smoothstep(0.035, 0.0, abs(d - 1.0));
          float ticks = step(0.5, fract(a * 12.0 / 6.2831 + uTime * 0.25)) * smoothstep(0.05, 0.0, abs(d - 1.1)) ;
          float mid = smoothstep(0.02, 0.0, abs(d - 0.66)) * 0.5;
          float core = smoothstep(0.03, 0.0, abs(d - uPerfect)) + smoothstep(uPerfect, 0.0, d) * 0.35;
          float fill = (1.0 - smoothstep(0.0, 1.0, d)) * 0.10;
          float pulse = 0.75 + 0.25 * sin(uTime * 4.0);
          float scan = smoothstep(0.08, 0.0, abs(d - fract(uTime * 0.6))) * 0.35;
          vec3 col = uColor * (outer + ticks * 0.8 + mid + fill + scan) * pulse + uHot * core;
          col = mix(col, uHot * 2.0, uHit * smoothstep(1.0, 0.0, d));
          float alpha = clamp(outer + ticks + mid + core + fill + scan, 0.0, 1.0);
          // speed gate stripes
          float stripe = uGate * step(0.5, fract((p.x + p.y) * 6.0 - uTime)) * smoothstep(1.05, 1.0, d) * smoothstep(0.9, 0.95, d);
          col += uHot * stripe; alpha = max(alpha, stripe);
          gl_FragColor = vec4(col, alpha * (0.85 + uHit));
        }`,
    });
    this.disc = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), this.discMat);
    this.disc.rotation.x = -Math.PI / 2;
    this.disc.renderOrder = 3;
    this.group.add(this.disc);

    this.ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 12, 64), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.14, 0.1, 8, 48), new THREE.MeshStandardMaterial({ color: 0x232a33, metalness: 0.9, roughness: 0.3 }));
    const membrane = new THREE.Mesh(new THREE.CircleGeometry(0.97, 48), new THREE.MeshBasicMaterial({
      color: PALETTE.cyan, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 8), frame.material);
    stand.name = 'stand';
    this.ring.add(torus, frame, membrane, stand);
    this.group.add(this.ring);
    scene.add(this.group);
    this.group.visible = false;
  }

  set(def: TargetDef | undefined) {
    this.def = def;
    this.group.visible = !!def;
    if (!def) return;
    this.disc.visible = def.kind === 'disc';
    this.ring.visible = def.kind === 'ring';
    if (def.kind === 'disc') {
      this.disc.scale.setScalar(def.radius);
      this.discMat.uniforms.uPerfect.value = def.perfect / def.radius;
      this.discMat.uniforms.uGate.value = def.minSpeed ? 1 : 0;
    } else {
      this.ring.scale.setScalar(def.radius);
      const stand = this.ring.getObjectByName('stand')!;
      const c = def.pos(0);
      const h = c.y / def.radius;
      stand.scale.set(1, h - 1.1, 1);
      stand.position.set(0, -1.1 - (h - 1.1) / 2, 0);
    }
  }

  flash() { this.hit = 1; }

  update(dt: number, clock: number) {
    if (!this.def) return;
    const p = this.def.pos(clock);
    if (this.def.kind === 'disc') this.group.position.set(p.x, TOP + 0.0015, p.z);
    else this.group.position.set(p.x, p.y, p.z);
    this.hit = Math.max(0, this.hit - dt * 1.5);
    this.discMat.uniforms.uTime.value = clock;
    this.discMat.uniforms.uHit.value = this.hit;
  }
}

/** Builds meshes for obstacle boxes, styled per kind. */
export class ObstacleViews {
  private group = new THREE.Group();
  private glassMats: THREE.ShaderMaterial[] = [];
  private flashes = new Map<string, { mat: THREE.ShaderMaterial | THREE.MeshStandardMaterial; t: number }>();
  constructor(scene: THREE.Scene) { scene.add(this.group); }

  set(boxes: Box[], monolith = false) {
    this.clear();
    for (const b of boxes) {
      const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
      const cx = (b.max.x + b.min.x) / 2, cy = (b.max.y + b.min.y) / 2, cz = (b.max.z + b.min.z) / 2;
      if (b.kind === 'glass') {
        const mat = new THREE.ShaderMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
          uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(b.id === 'bar' ? PALETTE.orange : PALETTE.cyan) }, uFlash: { value: 0 }, uSize: { value: new THREE.Vector2(w, h) } },
          vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); vN = normalize(normalMatrix*normal); gl_Position = projectionMatrix*mv; }`,
          fragmentShader: /* glsl */`
            uniform float uTime; uniform vec3 uColor; uniform float uFlash; uniform vec2 uSize; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
            void main(){
              vec2 p = vUv * uSize * 14.0;
              vec2 h = abs(fract(p + vec2(0.0, uTime*0.2)) - 0.5);
              float hex = smoothstep(0.47, 0.5, max(h.x, h.y));
              float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
              float edge = smoothstep(0.02, 0.0, min(min(vUv.x, 1.0-vUv.x), min(vUv.y, 1.0-vUv.y)));
              float band = smoothstep(0.03, 0.0, abs(fract(vUv.y*3.0 - uTime*0.3) - 0.5)) * 0.4;
              float a = 0.05 + hex * 0.10 + fres * 0.25 + edge * 0.9 + band * 0.15 + uFlash * 0.6;
              gl_FragColor = vec4(uColor * (1.0 + uFlash), a);
            }`,
        });
        this.glassMats.push(mat);
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(cx, cy, cz);
        m.renderOrder = 4;
        this.group.add(m);
        this.flashes.set(b.id, { mat, t: 0 });
        if (b.id === 'bar') {
          // three laser beams at the bottom edge make the "gap" readable
          for (let i = 0; i < 3; i++) {
            const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, w, 6), new THREE.MeshBasicMaterial({ color: PALETTE.orange }));
            beam.rotation.z = Math.PI / 2;
            beam.position.set(cx, b.min.y + 0.004 + i * 0.03, cz);
            this.group.add(beam);
          }
        }
      } else {
        const mat = new THREE.MeshStandardMaterial({
          color: monolith ? 0x050608 : 0x1a2029, roughness: monolith ? 0.08 : 0.35, metalness: 0.9,
          emissive: new THREE.Color(PALETTE.orange), emissiveIntensity: 0,
        });
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        m.position.set(cx, cy, cz);
        m.castShadow = true;
        this.group.add(m);
        this.flashes.set(b.id, { mat, t: 0 });
        // glowing edges
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(m.geometry),
          new THREE.LineBasicMaterial({ color: monolith ? PALETTE.orange : PALETTE.cyan, transparent: true, opacity: monolith ? 0.9 : 0.6 }),
        );
        edges.position.copy(m.position);
        this.group.add(edges);
        // hazard band at the base
        const tex = Lab.hazard().clone();
        tex.needsUpdate = true;
        tex.repeat.set(Math.max(1, (w + d) * 6), 1);
        const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, 0.035, d + 0.004), new THREE.MeshBasicMaterial({ map: tex }));
        band.position.set(cx, b.min.y + 0.02, cz);
        this.group.add(band);
        if (monolith) {
          // engraved glyph lines climbing the monolith
          for (let i = 0; i < 9; i++) {
            const glyph = new THREE.Mesh(new THREE.PlaneGeometry(w * (0.2 + ((i * 37) % 60) / 100), 0.006), new THREE.MeshBasicMaterial({ color: PALETTE.orange, transparent: true, opacity: 0.7 }));
            glyph.position.set(cx - w * 0.2 + ((i * 13) % 10) / 60, b.min.y + 0.18 + i * 0.2, b.max.z + 0.001);
            this.group.add(glyph);
          }
        }
      }
    }
  }

  flash(id?: string) {
    if (!id) return;
    const f = this.flashes.get(id);
    if (f) f.t = 1;
  }

  update(dt: number, time: number) {
    for (const m of this.glassMats) m.uniforms.uTime.value = time;
    for (const f of this.flashes.values()) {
      f.t = Math.max(0, f.t - dt * 2.5);
      if (f.mat instanceof THREE.ShaderMaterial) f.mat.uniforms.uFlash.value = f.t;
      else f.mat.emissiveIntensity = f.t * 1.5;
    }
  }

  clear() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      if (m.material) {
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.group.clear();
    this.glassMats = [];
    this.flashes.clear();
  }
}

/** Dotted line of the previous shot plus a landing marker, and the short aim preview. */
export class Trajectories {
  private past: THREE.Points;
  private preview: THREE.Points;
  private marker: THREE.Mesh;
  private pastCount = 0;
  constructor(scene: THREE.Scene) {
    const mk = (n: number, color: number, size: number) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uScale: { value: 600 } },
        vertexShader: `attribute float aA; varying float vA; uniform float uSize; uniform float uScale; void main(){ vA = aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize*uScale/max(0.1,-mv.z); gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uColor; varying float vA; void main(){ float d = length(gl_PointCoord-0.5); if(d>0.5) discard; gl_FragColor = vec4(uColor, smoothstep(0.5,0.2,d)*vA); }`,
      });
      const p = new THREE.Points(geo, mat);
      p.frustumCulled = false;
      geo.setDrawRange(0, 0);
      scene.add(p);
      return p;
    };
    this.past = mk(400, PALETTE.cyan, 0.008);
    this.preview = mk(120, 0xffffff, 0.011);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.018, 0.026, 32),
      new THREE.MeshBasicMaterial({ color: PALETTE.orange, transparent: true, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  setViewport(h: number) {
    for (const p of [this.past, this.preview]) (p.material as THREE.ShaderMaterial).uniforms.uScale.value = h * 0.9;
  }

  showPast(samples: Sample[], upTo: number, color: number, landing?: V3) {
    const geo = this.past.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const a = geo.getAttribute('aA') as THREE.BufferAttribute;
    let n = 0;
    const stepT = 0.012;
    let next = 0;
    for (const s of samples) {
      if (s.t > upTo) break;
      if (s.t < next) continue;
      next = s.t + stepT;
      if (n >= pos.count) break;
      pos.setXYZ(n, s.p.x, s.p.y, s.p.z);
      a.setX(n, 0.85);
      n++;
    }
    this.pastCount = n;
    geo.setDrawRange(0, n);
    pos.needsUpdate = true; a.needsUpdate = true;
    (this.past.material as THREE.ShaderMaterial).uniforms.uColor.value.set(color);
    if (landing) {
      this.marker.visible = true;
      this.marker.position.set(landing.x, landing.y - 0.018, landing.z);
    } else this.marker.visible = false;
  }

  hidePast() { this.past.geometry.setDrawRange(0, 0); this.marker.visible = false; this.pastCount = 0; }
  get hasPast() { return this.pastCount > 0; }

  showPreview(samples: Sample[], maxT: number) {
    const geo = this.preview.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const a = geo.getAttribute('aA') as THREE.BufferAttribute;
    let n = 0, next = 0;
    for (const s of samples) {
      if (s.t > maxT || n >= pos.count) break;
      if (s.t < next) continue;
      next = s.t + 0.018;
      pos.setXYZ(n, s.p.x, s.p.y, s.p.z);
      a.setX(n, 0.9 * (1 - s.t / maxT));
      n++;
    }
    geo.setDrawRange(0, n);
    pos.needsUpdate = true; a.needsUpdate = true;
  }
  hidePreview() { this.preview.geometry.setDrawRange(0, 0); }
}

export class Fx {
  readonly particles: Particles;
  readonly waves: Shockwaves;
  readonly target: TargetView;
  readonly obstacles: ObstacleViews;
  readonly traj: Trajectories;
  /** Ambient dust motes that react to gravity. */
  private dust: THREE.Points;
  private dustVel: Float32Array;
  gravity = 1;
  private flare: THREE.Sprite;
  private flareT = 0;

  constructor(scene: THREE.Scene) {
    this.particles = new Particles(scene);
    this.waves = new Shockwaves(scene);
    this.target = new TargetView(scene);
    this.obstacles = new ObstacleViews(scene);
    this.traj = new Trajectories(scene);

    const n = 260;
    const pos = new Float32Array(n * 3);
    this.dustVel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(Math.random()) * 2.4;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * 4.6;
      pos[i * 3 + 2] = Math.sin(a) * r * 1.3;
      this.dustVel[i] = 0.5 + Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.012, color: 0xcfe9ff, transparent: true, opacity: 0.55, depthWrite: false,
      map: radialTexture(), blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    this.dust.frustumCulled = false;
    scene.add(this.dust);

    this.flare = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), color: PALETTE.orange,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    scene.add(this.flare);
  }

  setViewport(h: number) {
    this.particles.setViewport(h);
    this.traj.setViewport(h);
  }

  setBudget(b: number) { this.particles.budget = b; }

  flareAt(p: V3, color: number, size = 0.6) {
    this.flare.position.set(p.x, p.y + 0.02, p.z);
    this.flare.scale.setScalar(size);
    (this.flare.material as THREE.SpriteMaterial).color.set(color);
    this.flareT = 1;
  }

  update(dt: number, time: number, clock: number) {
    this.particles.update(dt);
    this.waves.update(dt);
    this.target.update(dt, clock);
    this.obstacles.update(dt, time);
    this.flareT = Math.max(0, this.flareT - dt * 2.2);
    (this.flare.material as THREE.SpriteMaterial).opacity = this.flareT;

    const pos = this.dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    const g = this.gravity;
    for (let i = 0; i < pos.count; i++) {
      // in normal gravity dust drifts down slowly; in zero-g it floats up; in heavy gravity it rains
      const fall = (g - 0.35) * 0.09 * this.dustVel[i] * (g > 1.5 ? 6 : 1);
      let y = pos.getY(i) - fall * dt;
      const x = pos.getX(i) + Math.sin(time * 0.3 + i) * 0.02 * dt;
      if (y < 0) y += 4.6;
      if (y > 4.6) y -= 4.6;
      pos.setXY(i, x, y);
    }
    pos.needsUpdate = true;
  }
}
