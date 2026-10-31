/**
 * Finds the interactable the player is facing. Pure logic, unit tested.
 */

export interface Target {
  id: string;
  x: number;
  z: number;
  radius: number;
  verb: string;
  dialogue: string;
  /** Optional display name (NPCs). */
  name?: string;
}

/**
 * Returns the best target: within its radius and roughly in front of the player
 * (within ±100°). Closer and more central targets win.
 */
export function findTarget(px: number, pz: number, yaw: number, targets: readonly Target[]): Target | null {
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  let best: Target | null = null;
  let bestScore = Infinity;
  for (const t of targets) {
    const dx = t.x - px;
    const dz = t.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > t.radius) continue;
    const cos = d < 0.5 ? 1 : (dx * fx + dz * fz) / d;
    if (cos < -0.17) continue; // behind the player
    const score = d - cos * 1.2;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

/** Name of the place the player is standing in (shown when it changes). */
export function placeName(x: number, z: number): string {
  const near = (cx: number, cz: number, r: number) => Math.hypot(x - cx, z - cz) < r;
  if (near(-44, -40, 22)) return "Saint Ebba's";
  if (near(54, 0, 26)) return 'Candlewick';
  if (near(36, 58, 14)) return 'The Old Silver Mine';
  if (near(0, 6, 36)) return 'Hollowmere';
  return 'Hollowmere Vale';
}
