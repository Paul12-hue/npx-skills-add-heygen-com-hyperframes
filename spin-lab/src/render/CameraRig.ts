// Smoothly damped camera with named shots, scripted overrides and impact shake.

import * as THREE from 'three';

export interface Shot { pos: THREE.Vector3; look: THREE.Vector3; fovAdd?: number }

export class CameraRig {
  readonly pos = new THREE.Vector3(0, 2, 4);
  readonly look = new THREE.Vector3(0, 0.8, 0);
  private goalPos = this.pos.clone();
  private goalLook = this.look.clone();
  private stiffness = 2.5;
  private shake = 0;
  /** When set, fully drives the camera each frame (intro, cinematics). */
  script: ((dt: number) => Shot | null) | null = null;
  private portrait = false;

  constructor(private cam: THREE.PerspectiveCamera) {}

  setPortrait(p: boolean) { this.portrait = p; }

  /** Gameplay view from behind the player's end of the table. */
  playShot(): Shot {
    return this.portrait
      ? { pos: new THREE.Vector3(0, 2.25, 3.55), look: new THREE.Vector3(0, 0.62, -0.55) }
      : { pos: new THREE.Vector3(0, 1.8, 2.82), look: new THREE.Vector3(0, 0.7, -0.68) };
  }

  go(shot: Shot, stiffness = 2.5, snap = false) {
    this.goalPos.copy(shot.pos);
    this.goalLook.copy(shot.look);
    this.stiffness = stiffness;
    if (snap) { this.pos.copy(shot.pos); this.look.copy(shot.look); }
  }

  kick(amount: number) { this.shake = Math.max(this.shake, amount); }

  update(dt: number, time: number) {
    const s = this.script?.(dt);
    if (s) {
      this.pos.copy(s.pos);
      this.look.copy(s.look);
      this.goalPos.copy(s.pos);
      this.goalLook.copy(s.look);
    } else {
      const k = 1 - Math.exp(-this.stiffness * dt);
      this.pos.lerp(this.goalPos, k);
      this.look.lerp(this.goalLook, k);
    }
    this.cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const a = this.shake * this.shake * 0.02;
      this.cam.position.x += Math.sin(time * 71) * a;
      this.cam.position.y += Math.sin(time * 53 + 1) * a;
    }
    this.cam.lookAt(this.look);
  }
}
