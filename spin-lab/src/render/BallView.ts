// The ball: textured mesh, spin integration, contact shadow and a ribbon trail.

import * as THREE from 'three';
import { BALL_RADIUS, TABLE } from '../config';
import { ballTexture, radialTexture } from './textures';

const TRAIL = 42;
/** Rendered slightly larger than regulation so it reads on an iPad screen. */
const VISUAL_SCALE = 1.35;

export class BallView {
  readonly mesh: THREE.Mesh;
  readonly glow: THREE.Sprite;
  private shadow: THREE.Mesh;
  private trail: THREE.Mesh;
  private trailPos: THREE.Vector3[] = [];
  private trailGeo: THREE.BufferGeometry;
  private trailMat: THREE.ShaderMaterial;
  private ghosts: THREE.Mesh[] = [];
  readonly quat = new THREE.Quaternion();

  constructor(scene: THREE.Scene) {
    const mat = new THREE.MeshPhysicalMaterial({
      map: ballTexture(), roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25,
      sheen: 0.3, sheenColor: new THREE.Color(0xffffff), envMapIntensity: 0.8,
      emissive: new THREE.Color(0x000000),
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS * VISUAL_SCALE, 40, 28), mat);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: radialTexture('rgba(255,255,255,0.9)', 'rgba(255,255,255,0)'), color: 0x3fe0ff,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0,
    }));
    this.glow.scale.setScalar(0.18);
    scene.add(this.glow);

    this.shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
    );
    this.shadow.rotation.x = -Math.PI / 2;
    scene.add(this.shadow);

    // ribbon trail: two vertices per point, expanded in the vertex shader towards the camera
    this.trailGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(TRAIL * 2 * 3);
    const side = new Float32Array(TRAIL * 2);
    const age = new Float32Array(TRAIL * 2);
    const dir = new Float32Array(TRAIL * 2 * 3);
    for (let i = 0; i < TRAIL; i++) {
      side[i * 2] = -1; side[i * 2 + 1] = 1;
      age[i * 2] = age[i * 2 + 1] = i / (TRAIL - 1);
    }
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.trailGeo.setIndex(idx);
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.trailGeo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    this.trailGeo.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
    this.trailGeo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
    this.trailMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0x3fe0ff) }, uWidth: { value: 0.022 }, uOpacity: { value: 0.0 } },
      vertexShader: /* glsl */`
        attribute vec3 aDir; attribute float aSide; attribute float aAge;
        uniform float uWidth; varying float vAge; varying float vSide;
        void main(){
          vAge = aAge; vSide = aSide;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 d = normalize((modelViewMatrix * vec4(aDir, 0.0)).xyz + 1e-5);
          vec3 n = normalize(cross(d, vec3(0.0, 0.0, 1.0)));
          mv.xyz += n * aSide * uWidth * (1.0 - aAge * 0.85);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vAge; varying float vSide;
        void main(){
          float edge = 1.0 - abs(vSide);
          float a = pow(1.0 - vAge, 1.8) * smoothstep(0.0, 0.6, edge) * uOpacity;
          gl_FragColor = vec4(mix(uColor, vec3(1.0), (1.0 - vAge) * 0.35 * edge), a);
        }`,
    });
    this.trail = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trail.frustumCulled = false;
    scene.add(this.trail);

    // quantum superposition ghosts
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(this.mesh.geometry, new THREE.MeshBasicMaterial({
        color: 0xff5ad1, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      g.visible = false;
      scene.add(g);
      this.ghosts.push(g);
    }
  }

  setTrailColor(color: number) { this.trailMat.uniforms.uColor.value.set(color); }
  setGlow(color: number, opacity: number) {
    const m = this.glow.material as THREE.SpriteMaterial;
    m.color.set(color);
    m.opacity = opacity;
  }
  setTint(color: number, amount: number) {
    const m = this.mesh.material as THREE.MeshPhysicalMaterial;
    m.emissive.set(color).multiplyScalar(amount);
  }

  resetTrail(p: THREE.Vector3) {
    this.trailPos = [];
    for (let i = 0; i < TRAIL; i++) this.trailPos.push(p.clone());
    this.trailMat.uniforms.uOpacity.value = 0;
  }

  /** Advance the ball's spin orientation by angular velocity ω (rad/s) over dt. */
  spin(w: { x: number; y: number; z: number }, dt: number) {
    const mag = Math.hypot(w.x, w.y, w.z);
    if (mag < 1e-4) return;
    // visual spin is slowed so the logo stays readable instead of strobing
    const vis = Math.min(mag, 38) * dt;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(w.x / mag, w.y / mag, w.z / mag), vis);
    this.quat.premultiply(q);
    this.mesh.quaternion.copy(this.quat);
  }

  update(p: THREE.Vector3, trailOn: boolean, dt: number, time: number, quantum = false) {
    this.mesh.position.copy(p);
    this.mesh.position.y += BALL_RADIUS * (VISUAL_SCALE - 1);
    this.glow.position.copy(this.mesh.position);
    // trail history
    if (trailOn) {
      this.trailPos.pop();
      this.trailPos.unshift(p.clone());
      this.trailMat.uniforms.uOpacity.value = Math.min(1, this.trailMat.uniforms.uOpacity.value + dt * 6);
    } else {
      this.trailMat.uniforms.uOpacity.value = Math.max(0, this.trailMat.uniforms.uOpacity.value - dt * 3);
    }
    const pos = this.trailGeo.getAttribute('position') as THREE.BufferAttribute;
    const dir = this.trailGeo.getAttribute('aDir') as THREE.BufferAttribute;
    for (let i = 0; i < TRAIL; i++) {
      const a = this.trailPos[i] ?? p;
      const b = this.trailPos[Math.min(TRAIL - 1, i + 1)] ?? p;
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      for (let k = 0; k < 2; k++) {
        pos.setXYZ(i * 2 + k, a.x, a.y, a.z);
        dir.setXYZ(i * 2 + k, dx || 1e-4, dy, dz);
      }
    }
    pos.needsUpdate = true; dir.needsUpdate = true;

    // contact shadow on table or floor
    const overTable = Math.abs(p.x) < TABLE.halfW && Math.abs(p.z) < TABLE.halfL && p.y > TABLE.height - 0.01;
    const surf = overTable ? TABLE.height + 0.0015 : 0.002;
    const h = Math.max(0, p.y - surf);
    const s = 0.05 + h * 0.18;
    this.shadow.position.set(p.x, surf, p.z);
    this.shadow.scale.set(s, s, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.75 - h * 0.6);

    this.ghosts.forEach((g, i) => {
      g.visible = quantum;
      if (!quantum) return;
      const a = time * 9 + (i * Math.PI * 2) / 3;
      const r = 0.035 + 0.015 * Math.sin(time * 13 + i);
      g.position.set(p.x + Math.cos(a) * r, p.y + Math.sin(a * 1.3) * r, p.z + Math.sin(a) * r);
    });
  }

  setVisible(v: boolean) {
    this.mesh.visible = v;
    this.shadow.visible = v;
    this.glow.visible = v;
  }
}
