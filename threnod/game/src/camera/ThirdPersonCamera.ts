import * as THREE from 'three';

/**
 * Freely adjustable follow camera: drag to turn and tilt (from just over the
 * shoulder down to a top-down view), pinch / mouse wheel to zoom, or switch
 * between three presets. Distance shortens smoothly when terrain is in the way.
 */
export const VIEW_PRESETS = [
  { name: 'Shoulder', pitch: 0.28, distance: 6 },
  { name: 'Classic', pitch: 0.62, distance: 11 },
  { name: 'Overhead', pitch: 1.05, distance: 17 },
];
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera;
  yaw = 0;
  pitch = VIEW_PRESETS[1].pitch;
  distance = VIEW_PRESETS[1].distance;
  private current = new THREE.Vector3();
  private focus = new THREE.Vector3();
  private initialised = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.3, 600);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private preset = 1;

  /** dx/dy in radians. */
  rotate(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy, 0.08, 1.35);
  }

  /** zoom > 0 moves the camera away, < 0 closer. */
  zoom(amount: number): void {
    if (!amount) return;
    this.distance = THREE.MathUtils.clamp(this.distance * Math.exp(amount), 3.2, 34);
  }

  /** Switch to the next of the three view presets; returns its name. */
  cyclePreset(): string {
    this.preset = (this.preset + 1) % VIEW_PRESETS.length;
    const v = VIEW_PRESETS[this.preset];
    this.pitch = v.pitch;
    this.distance = v.distance;
    return v.name;
  }

  update(dt: number, target: THREE.Vector3, heightAt: (x: number, z: number) => number): void {
    // aim a little higher when the camera is low behind the shoulder
    this.focus.set(target.x, target.y + 0.9 + (1 - Math.min(1, this.pitch / 0.8)) * 0.7, target.z);
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
