import * as THREE from 'three';
import { Humanoid } from '../character/Humanoid';
import { unsungSpec } from '../character/figures';
import { DEFAULT_MOVE, inputToVelocity, stepBody, type Body } from './movement';
import type { World } from '../world/World';

export class Player {
  readonly mesh = new Humanoid(unsungSpec(), { lantern: true, priority: 0, lods: [0.012, 0.017, 0.03], lazyNear: true });
  readonly position = new THREE.Vector3();
  /** Facing direction (radians). 0 faces −z. */
  yaw = 0;
  private speed01 = 0;
  private time = 0;
  private body: Body = { x: 0, y: 0, z: 0, vy: 0, onGround: true };

  get onGround(): boolean {
    return this.body.onGround;
  }

  constructor(private world: World) {}

  place(x: number, z: number, yaw: number): void {
    const y = this.world.groundHeight(x, z, 1e9);
    this.body = { x, y, z, vy: 0, onGround: true };
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.sync();
  }

  update(dt: number, moveX: number, moveY: number, run: boolean, cameraYaw: number, jump = false): void {
    this.time += dt;
    const [vx, vz] = inputToVelocity(moveX, moveY, cameraYaw, run);
    const ox = this.body.x;
    const oz = this.body.z;
    // fixed small sub-steps keep collisions solid even at low frame rates
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    // only the obstacles near the player take part in this step
    const near = { ...this.world.physics, colliders: this.world.nearby(this.body.x, this.body.z) };
    for (let i = 0; i < steps; i++) {
      stepBody(this.body, vx, vz, jump && i === 0, dt / steps, near);
    }
    const moved = Math.hypot(this.body.x - ox, this.body.z - oz) / Math.max(dt, 1e-4);
    this.position.set(this.body.x, this.body.y, this.body.z);
    if (Math.hypot(vx, vz) > 0.1) {
      const target = Math.atan2(-vx, -vz);
      let d = target - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }
    this.speed01 += (moved / DEFAULT_MOVE.walkSpeed - this.speed01) * Math.min(1, dt * 10);
    this.mesh.animate(dt, this.speed01, this.time, !this.body.onGround);
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
