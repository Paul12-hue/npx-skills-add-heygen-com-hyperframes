import type { Collider } from '../world/World';

/**
 * Pure movement helpers (no Three.js) so they can be unit tested.
 */

export interface MoveParams {
  walkSpeed: number;
  runSpeed: number;
  /** The player may not wade deeper than this below the water level. */
  minGroundHeight: number;
  /** Radius of the playable area; beyond it the vale walls / the Hush block. */
  boundsRadius: number;
  radius: number;
}

export const DEFAULT_MOVE: MoveParams = {
  walkSpeed: 4.2,
  runSpeed: 7.2,
  minGroundHeight: -0.45,
  boundsRadius: 104,
  radius: 0.4,
};

/**
 * Converts stick input (x right, y forward, length 0..1) and the camera yaw into a
 * world-space velocity (x, z). Camera yaw 0 looks towards −z.
 */
export function inputToVelocity(ix: number, iy: number, cameraYaw: number, run: boolean, p: MoveParams = DEFAULT_MOVE): [number, number] {
  const len = Math.min(1, Math.hypot(ix, iy));
  if (len < 0.08) return [0, 0];
  const speed = (run || len > 0.95 ? p.runSpeed : p.walkSpeed) * (run ? 1 : Math.max(0.35, len));
  const nx = ix / Math.hypot(ix, iy);
  const ny = iy / Math.hypot(ix, iy);
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // forward = (-sin, -cos), right = (cos, -sin)
  const vx = nx * cos - ny * sin;
  const vz = -nx * sin - ny * cos;
  return [vx * speed, vz * speed];
}

/** Pushes a circle out of all colliders it overlaps. Returns the corrected position. */
export function resolveCollisions(x: number, z: number, radius: number, colliders: readonly Collider[]): [number, number] {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 3; iter++) {
    let moved = false;
    for (const c of colliders) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const min = radius + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min) {
        const d = Math.sqrt(d2) || 0.0001;
        px = c.x + (dx / d) * min;
        pz = c.z + (dz / d) * min;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, pz];
}

/**
 * One movement step with collisions, water and world bounds.
 * `heightAt` samples the terrain. Returns the new position.
 */
export function stepMovement(
  x: number,
  z: number,
  vx: number,
  vz: number,
  dt: number,
  colliders: readonly Collider[],
  heightAt: (x: number, z: number) => number,
  p: MoveParams = DEFAULT_MOVE,
): [number, number] {
  let nx = x + vx * dt;
  let nz = z + vz * dt;
  [nx, nz] = resolveCollisions(nx, nz, p.radius, colliders);
  // deep water: try sliding along each axis, otherwise stay
  if (heightAt(nx, nz) < p.minGroundHeight) {
    if (heightAt(nx, z) >= p.minGroundHeight) nz = z;
    else if (heightAt(x, nz) >= p.minGroundHeight) nx = x;
    else return [x, z];
  }
  const r = Math.hypot(nx, nz);
  if (r > p.boundsRadius) {
    nx *= p.boundsRadius / r;
    nz *= p.boundsRadius / r;
  }
  return [nx, nz];
}
