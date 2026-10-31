import * as THREE from 'three';
import { Humanoid } from '../character/Humanoid';
import { unsungSpec } from '../character/figures';
import { DEFAULT_MOVE, inputToVelocity, stepMovement } from './movement';
import type { World } from '../world/World';

export class Player {
  readonly mesh = new Humanoid(unsungSpec(), { lantern: true });
  readonly position = new THREE.Vector3();
  /** Facing direction (radians). 0 faces −z. */
  yaw = 0;
  private speed01 = 0;
  private time = 0;

  constructor(private world: World) {}

  place(x: number, z: number, yaw: number): void {
    this.position.set(x, this.world.height(x, z), z);
    this.yaw = yaw;
    this.sync();
  }

  update(dt: number, moveX: number, moveY: number, run: boolean, cameraYaw: number): void {
    this.time += dt;
    const [vx, vz] = inputToVelocity(moveX, moveY, cameraYaw, run);
    const [nx, nz] = stepMovement(this.position.x, this.position.z, vx, vz, dt, this.world.colliders, (x, z) =>
      this.world.height(x, z),
    );
    const moved = Math.hypot(nx - this.position.x, nz - this.position.z) / Math.max(dt, 1e-4);
    this.position.x = nx;
    this.position.z = nz;
    this.position.y = this.world.height(nx, nz);
    if (Math.hypot(vx, vz) > 0.1) {
      const target = Math.atan2(-vx, -vz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.speed01 += (moved / DEFAULT_MOVE.walkSpeed - this.speed01) * Math.min(1, dt * 10);
    this.mesh.animate(dt, this.speed01, this.time);
    this.sync();
  }

  /** Turn smoothly towards a point (used when a conversation starts). */
  faceTowards(x: number, z: number): void {
    this.yaw = Math.atan2(-(x - this.position.x), -(z - this.position.z));
    this.sync();
  }

  private sync(): void {
    this.mesh.root.position.copy(this.position);
    this.mesh.root.rotation.y = this.yaw;
  }
}
