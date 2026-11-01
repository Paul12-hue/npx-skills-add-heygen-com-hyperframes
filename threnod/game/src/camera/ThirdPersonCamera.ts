import * as THREE from 'three';

/**
 * High, top-down follow camera (looking down at about 60°, like a classic
 * overhead RPG). Dragging turns it around the player; the tilt can be nudged a
 * little. Distance shortens smoothly when terrain would block the view.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = 1.02;
  distance = 15;
  private current = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 900);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** dx/dy in radians. */
  rotate(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.5, 0.75, 1.3);
  }

  update(dt: number, target: THREE.Vector3, heightAt: (x: number, z: number) => number): void {
    this.focus.set(target.x, target.y + 0.9, target.z);
    let dist = this.distance;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    // pull the camera in if the ground is in the way
    for (let d = 1; d <= this.distance; d += 0.5) {
      const p = this.focus.clone().addScaledVector(dir, d);
      if (heightAt(p.x, p.z) + 0.4 > p.y) {
        dist = Math.max(1.2, d - 0.5);
        break;
      }
    }
    const desired = this.focus.clone().addScaledVector(dir, dist);
    const ground = heightAt(desired.x, desired.z) + 0.5;
    if (desired.y < ground) desired.y = ground;
    if (!this.initialised) {
      this.current.copy(desired);
      this.initialised = true;
    } else {
      this.current.lerp(desired, 1 - Math.exp(-dt * 14));
    }
    this.camera.position.copy(this.current);
    this.camera.lookAt(this.focus);
  }

  snap(): void {
    this.initialised = false;
  }
}
