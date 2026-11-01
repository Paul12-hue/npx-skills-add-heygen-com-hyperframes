import { LAYOUT, hushFactor } from '../world/terrain';
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
  const L = LAYOUT;
  const near = (p: { x: number; z: number }, r: number) => Math.hypot(x - p.x, z - p.z) < r;
  if (near(L.aldersey, 34)) return 'Aldersey';
  if (hushFactor(x, z) > 0.45) return 'The Hush';
  if (near(L.cemetery, 22)) return "Saint Ebba's";
  if (near(L.village, 30)) return 'Candlewick';
  if (near(L.mine, 14)) return 'The Old Silver Mine';
  if (near(L.lake, 36)) return 'Hollowmere';
  if (near(L.stones, 18)) return 'The Nine Places';
  if (near(L.ruin, 16)) return 'The Old Watch';
  if (near(L.farm, 34) || near(L.windmill, 14)) return 'Millfield';
  if (near(L.camp, 14)) return "Hunter's Camp";
  if (near(L.marsh, L.marsh.radius)) return 'The Sallow Marsh';
  if (near(L.moor, L.moor.radius)) return 'The High Moor';
  if (near(L.whisperwood, L.whisperwood.radius)) return 'The Whisperwood';
  return 'Hollowmere Vale';
}
