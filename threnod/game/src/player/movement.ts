/**
 * Character physics – pure logic (no Three.js) so it can be unit tested.
 *
 *  - solid obstacles are circles (trees, posts) or rotated boxes (houses, walls)
 *  - the player slides along obstacles instead of stopping dead
 *  - gravity, jumping and landing; walkable platforms (bridges) above the ground
 *  - slopes steeper than ~45° cannot be climbed; deep water cannot be entered
 */

export type Collider =
  | { x: number; z: number; r: number; hx?: undefined }
  | { x: number; z: number; hx: number; hz: number; rot: number; r?: undefined };

/** A walkable surface above the terrain (bridge deck, floor). */
export interface Platform {
  x: number;
  z: number;
  hx: number;
  hz: number;
  rot: number;
  /** height at the centre */
  y: number;
  /** rise per metre along the local z axis (sloped bridges) */
  slope?: number;
}

export interface MoveParams {
  walkSpeed: number;
  runSpeed: number;
  /** The player may not wade deeper than this below the water level. */
  minGroundHeight: number;
  /** Radius of the playable area; beyond it the vale walls / the Hush block. */
  boundsRadius: number;
  radius: number;
  gravity: number;
  jumpSpeed: number;
  /** Highest step the player walks up without jumping. */
  stepHeight: number;
  /** Steepest climbable slope (rise per metre). */
  maxSlope: number;
}

export const DEFAULT_MOVE: MoveParams = {
  walkSpeed: 4.2,
  runSpeed: 7.4,
  minGroundHeight: -0.45,
  boundsRadius: 382,
  radius: 0.38,
  gravity: 26,
  jumpSpeed: 8.2,
  stepHeight: 0.45,
  maxSlope: 1.05,
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
  const vx = nx * cos - ny * sin;
  const vz = -nx * sin - ny * cos;
  return [vx * speed, vz * speed];
}

/** Point (px, pz) in the local frame of a rotated box. */
function toLocal(px: number, pz: number, b: { x: number; z: number; rot: number }): [number, number] {
  const dx = px - b.x;
  const dz = pz - b.z;
  const c = Math.cos(-b.rot);
  const s = Math.sin(-b.rot);
  return [dx * c - dz * s, dx * s + dz * c];
}

function toWorld(lx: number, lz: number, b: { x: number; z: number; rot: number }): [number, number] {
  const c = Math.cos(b.rot);
  const s = Math.sin(b.rot);
  return [b.x + lx * c - lz * s, b.z + lx * s + lz * c];
}

/** Pushes a circle out of all colliders it overlaps. Returns the corrected position. */
export function resolveCollisions(x: number, z: number, radius: number, colliders: readonly Collider[]): [number, number] {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const c of colliders) {
      if (c.r !== undefined) {
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
      } else {
        // quick reject
        const reach = Math.max(c.hx, c.hz) * 1.42 + radius;
        if (Math.abs(px - c.x) > reach || Math.abs(pz - c.z) > reach) continue;
        const [lx, lz] = toLocal(px, pz, c);
        const cx = Math.max(-c.hx, Math.min(c.hx, lx));
        const cz = Math.max(-c.hz, Math.min(c.hz, lz));
        const dx = lx - cx;
        const dz = lz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let nx: number;
        let nz: number;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = cx + (dx / d) * radius;
          nz = cz + (dz / d) * radius;
        } else {
          // centre is inside the box: leave by the nearest face
          const ex = c.hx - Math.abs(lx);
          const ez = c.hz - Math.abs(lz);
          if (ex < ez) {
            nx = Math.sign(lx || 1) * (c.hx + radius);
            nz = lz;
          } else {
            nx = lx;
            nz = Math.sign(lz || 1) * (c.hz + radius);
          }
        }
        [px, pz] = toWorld(nx, nz, c);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return [px, pz];
}

/** Height of the highest platform under (x, z) that is not above `maxY`, or -Infinity. */
export function platformHeight(x: number, z: number, platforms: readonly Platform[], maxY = Infinity): number {
  let best = -Infinity;
  for (const p of platforms) {
    const [lx, lz] = toLocal(x, z, p);
    if (Math.abs(lx) > p.hx || Math.abs(lz) > p.hz) continue;
    const h = p.y + (p.slope ?? 0) * lz;
    if (h <= maxY && h > best) best = h;
  }
  return best;
}

export interface Body {
  x: number;
  y: number;
  z: number;
  vy: number;
  onGround: boolean;
}

export interface World {
  colliders: readonly Collider[];
  platforms: readonly Platform[];
  terrain: (x: number, z: number) => number;
}

/** Ground under a point for a body currently at height y (platforms only count from above). */
export function groundAt(w: World, x: number, z: number, y: number, p: MoveParams = DEFAULT_MOVE): number {
  return Math.max(w.terrain(x, z), platformHeight(x, z, w.platforms, y + p.stepHeight));
}

/**
 * One physics step: horizontal move with sliding collisions, slope and water
 * limits, world bounds, then gravity / landing. Mutates and returns the body.
 */
export function stepBody(b: Body, vx: number, vz: number, jump: boolean, dt: number, w: World, p: MoveParams = DEFAULT_MOVE): Body {
  // --- horizontal
  let nx = b.x + vx * dt;
  let nz = b.z + vz * dt;
  [nx, nz] = resolveCollisions(nx, nz, p.radius, w.colliders);

  const blocked = (x: number, z: number): boolean => {
    const g = groundAt(w, x, z, b.y, p);
    if (g < p.minGroundHeight) return true; // deep water
    const dist = Math.hypot(x - b.x, z - b.z);
    const rise = g - Math.max(b.y, groundAt(w, b.x, b.z, b.y, p));
    // too high a step while on the ground, or a cliff steeper than maxSlope
    if (b.onGround && rise > p.stepHeight && rise / Math.max(dist, 1e-3) > p.maxSlope) return true;
    if (!b.onGround && g > b.y + 0.05) return true; // jumping into a wall of earth
    return false;
  };
  if (blocked(nx, nz)) {
    // slide along one axis if the other is the problem
    if (!blocked(nx, b.z)) nz = b.z;
    else if (!blocked(b.x, nz)) nx = b.x;
    else {
      nx = b.x;
      nz = b.z;
    }
  }
  const r = Math.hypot(nx, nz);
  if (r > p.boundsRadius) {
    nx *= p.boundsRadius / r;
    nz *= p.boundsRadius / r;
  }
  b.x = nx;
  b.z = nz;

  // --- vertical
  const ground = groundAt(w, b.x, b.z, b.y, p);
  if (b.onGround) {
    if (jump) {
      b.vy = p.jumpSpeed;
      b.onGround = false;
    } else if (ground < b.y - p.stepHeight) {
      b.onGround = false; // walked off a ledge
      b.vy = 0;
    } else {
      b.y = ground; // follow the ground (also down small steps and slopes)
      b.vy = 0;
    }
  }
  if (!b.onGround) {
    b.vy -= p.gravity * dt;
    b.y += b.vy * dt;
    if (b.y <= ground) {
      b.y = ground;
      b.vy = 0;
      b.onGround = true;
    }
  }
  return b;
}
