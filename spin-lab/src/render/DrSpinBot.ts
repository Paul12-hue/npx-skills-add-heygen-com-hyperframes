// DR. SPIN: a hovering research drone with an expressive display face.
// The face is drawn on a canvas that is shared by the 3D screen and the dialogue panel.

import * as THREE from 'three';
import { PALETTE } from '../config';

export type Mood = 'idle' | 'happy' | 'smug' | 'shocked' | 'sad' | 'thinking' | 'talk';

export class FaceRenderer {
  readonly canvas = document.createElement('canvas');
  private g: CanvasRenderingContext2D;
  mood: Mood = 'idle';
  talking = false;
  private blink = 0;
  private nextBlink = 2;
  private look = { x: 0, y: 0 };

  constructor(size = 256) {
    this.canvas.width = this.canvas.height = size;
    this.g = this.canvas.getContext('2d')!;
  }

  draw(time: number, dt: number) {
    const g = this.g, S = this.canvas.width;
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 1; this.nextBlink = 2 + Math.random() * 3; }
    this.blink = Math.max(0, this.blink - dt * 7);
    const tl = { x: Math.sin(time * 0.7) * 0.5, y: Math.sin(time * 0.45) * 0.3 };
    if (this.mood === 'thinking') { tl.x = 0.6; tl.y = -0.8; }
    this.look.x += (tl.x - this.look.x) * Math.min(1, dt * 4);
    this.look.y += (tl.y - this.look.y) * Math.min(1, dt * 4);

    g.clearRect(0, 0, S, S);
    // screen
    const grd = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.7);
    grd.addColorStop(0, '#0d2733');
    grd.addColorStop(1, '#03080c');
    g.fillStyle = grd;
    g.beginPath();
    g.roundRect(S * 0.04, S * 0.12, S * 0.92, S * 0.76, S * 0.16);
    g.fill();
    // scanlines
    g.fillStyle = 'rgba(63,224,255,0.05)';
    for (let y = S * 0.12; y < S * 0.88; y += 4) g.fillRect(S * 0.04, y + ((time * 30) % 4), S * 0.92, 1);

    const hot = this.mood === 'shocked' || this.mood === 'sad';
    const col = hot ? '#ff7a1a' : '#3fe0ff';
    g.strokeStyle = col;
    g.fillStyle = col;
    g.shadowColor = col;
    g.shadowBlur = S * 0.06;
    g.lineCap = 'round';
    g.lineWidth = S * 0.045;

    const ex = S * 0.3, ey = S * 0.44, gap = S * 0.4;
    const lx = this.look.x * S * 0.03, ly = this.look.y * S * 0.02;
    for (let i = 0; i < 2; i++) {
      const cx = ex + i * gap + lx, cy = ey + ly;
      const open = 1 - this.blink;
      g.beginPath();
      switch (this.mood) {
        case 'happy':
          g.arc(cx, cy + S * 0.03, S * 0.07, Math.PI * 1.1, Math.PI * 1.9);
          g.stroke();
          break;
        case 'smug':
          g.moveTo(cx - S * 0.07, cy); g.lineTo(cx + S * 0.07, cy);
          g.stroke();
          g.beginPath();
          g.moveTo(cx - S * 0.07, cy - S * (i === 0 ? 0.07 : 0.1)); g.lineTo(cx + S * 0.07, cy - S * (i === 0 ? 0.09 : 0.12));
          g.lineWidth = S * 0.025; g.stroke(); g.lineWidth = S * 0.045;
          break;
        case 'shocked':
          g.arc(cx, cy, S * 0.075, 0, Math.PI * 2);
          g.stroke();
          g.beginPath(); g.arc(cx, cy, S * 0.02, 0, Math.PI * 2); g.fill();
          break;
        case 'sad':
          g.moveTo(cx - S * 0.06, cy - (i ? -1 : 1) * S * 0.02); g.lineTo(cx + S * 0.06, cy + (i ? -1 : 1) * S * 0.02);
          g.stroke();
          break;
        default: {
          const h = S * 0.11 * Math.max(0.08, open);
          g.roundRect(cx - S * 0.045, cy - h / 2, S * 0.09, h, S * 0.04);
          g.fill();
        }
      }
    }
    // mouth: waveform while talking, otherwise a mood line
    g.lineWidth = S * 0.025;
    g.beginPath();
    const my = S * 0.68, mx0 = S * 0.36, mx1 = S * 0.64;
    if (this.talking) {
      for (let x = mx0; x <= mx1; x += 3) {
        const k = (x - mx0) / (mx1 - mx0);
        const amp = Math.sin(k * Math.PI) * S * 0.04 * (0.4 + 0.6 * Math.abs(Math.sin(time * 18 + k * 9)));
        const y = my + Math.sin(k * 22 + time * 30) * amp;
        x === mx0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
    } else if (this.mood === 'happy' || this.mood === 'smug') {
      g.moveTo(mx0, my - S * 0.01);
      g.quadraticCurveTo(S / 2, my + S * (this.mood === 'happy' ? 0.07 : 0.03), mx1, my - S * (this.mood === 'smug' ? 0.04 : 0.01));
    } else if (this.mood === 'shocked') {
      g.ellipse(S / 2, my, S * 0.04, S * 0.05, 0, 0, Math.PI * 2);
    } else if (this.mood === 'sad') {
      g.moveTo(mx0, my + S * 0.03); g.quadraticCurveTo(S / 2, my - S * 0.04, mx1, my + S * 0.03);
    } else if (this.mood === 'thinking') {
      for (let i = 0; i < 3; i++) {
        const a = 0.4 + 0.6 * Math.max(0, Math.sin(time * 5 - i));
        g.globalAlpha = a;
        g.fillRect(S * (0.43 + i * 0.06), my - S * 0.012, S * 0.025, S * 0.025);
      }
      g.globalAlpha = 1;
    } else {
      g.moveTo(mx0 + S * 0.04, my); g.lineTo(mx1 - S * 0.04, my);
    }
    g.stroke();
    g.shadowBlur = 0;
  }
}

export class DrSpinBot {
  readonly group = new THREE.Group();
  readonly face = new FaceRenderer();
  private faceTex: THREE.CanvasTexture;
  private rotor: THREE.Mesh;
  private beam: THREE.Mesh;
  private body: THREE.Group;
  private home = new THREE.Vector3(-1.25, 1.55, 0.35);
  private target = this.home.clone();
  private excite = 0;

  constructor(scene: THREE.Scene) {
    this.faceTex = new THREE.CanvasTexture(this.face.canvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.body = new THREE.Group();
    this.group.add(this.body);

    const shell = new THREE.MeshPhysicalMaterial({ color: 0xdfe5ea, roughness: 0.28, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x151a21, roughness: 0.35, metalness: 0.85 });
    // capsule head: rounded box made of a squashed sphere
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 40, 28), shell);
    head.scale.set(1.25, 0.95, 1);
    head.castShadow = true;
    this.body.add(head);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.163, 40, 28, Math.PI / 2 - 0.95, 1.9, 0.75, 1.65), dark);
    visor.scale.set(1.25, 0.95, 1);
    this.body.add(visor);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.27), new THREE.MeshBasicMaterial({ map: this.faceTex, transparent: true, toneMapped: false }));
    screen.position.set(0, 0, 0.168);
    this.body.add(screen);
    // ear pods
    for (const s of [-1, 1]) {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 24), dark);
      pod.rotation.z = Math.PI / 2;
      pod.position.set(s * 0.205, 0, 0);
      this.body.add(pod);
      const led = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), new THREE.MeshBasicMaterial({ color: PALETTE.cyan }));
      led.position.set(s * 0.232, 0, 0);
      led.rotation.y = s * Math.PI / 2;
      this.body.add(led);
    }
    // antenna with orange tip — his one vanity
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), dark);
    ant.position.set(0.06, 0.19, 0);
    ant.rotation.z = -0.25;
    this.body.add(ant);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshBasicMaterial({ color: PALETTE.orange }));
    tip.position.set(0.075, 0.25, 0);
    this.body.add(tip);
    // rotor halo
    this.rotor = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.006, 6, 64), new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.7 }));
    this.rotor.rotation.x = Math.PI / 2;
    this.rotor.position.y = -0.13;
    this.group.add(this.rotor);
    // projection beam below
    const beamMat = new THREE.MeshBasicMaterial({ color: PALETTE.cyan, transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 24, 1, true), beamMat);
    this.beam.position.y = -0.4;
    this.group.add(this.beam);

    this.group.position.copy(this.home);
    scene.add(this.group);
  }

  setHome(p: THREE.Vector3) { this.home.copy(p); this.target.copy(p); }
  moveTo(p: THREE.Vector3 | null) { this.target.copy(p ?? this.home); }
  react() { this.excite = 1; }

  update(dt: number, time: number, lookAt: THREE.Vector3) {
    this.face.draw(time, dt);
    this.faceTex.needsUpdate = true;
    this.excite = Math.max(0, this.excite - dt * 1.5);
    const bob = Math.sin(time * 2.1) * 0.025 + Math.sin(time * 15) * 0.01 * this.excite;
    this.group.position.lerp(this.target, Math.min(1, dt * 2));
    this.body.position.y = bob;
    this.rotor.rotation.z += dt * (3 + this.excite * 12);
    this.rotor.position.y = -0.13 + bob;
    // turn towards what matters
    const m = new THREE.Matrix4().lookAt(this.group.position, lookAt, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    this.body.quaternion.slerp(q, Math.min(1, dt * 3));
    this.body.rotation.z += Math.sin(time * 1.3) * 0.002;
  }
}
