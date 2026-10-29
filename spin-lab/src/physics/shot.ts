// Maps player intent (aim, power, contact point on the ball) to launch vectors.

import { LAUNCH, type SubstanceId } from '../config';
import { defaultEnv, type BallEnv, type V3, v3 } from './ballPhysics';

export interface ShotInput {
  /** Horizontal aim in radians, negative = left. */
  yaw: number;
  /** 0..1 */
  power: number;
  /** Contact point on the ball, unit disk. y>0 = topspin, x>0 = curve right. */
  spinX: number;
  spinY: number;
}

export const MAX_SPIN = 170; // rad/s ≈ 1620 rpm
export const MAX_YAW = 0.65;

export const toRpm = (radPerSec: number) => (radPerSec * 60) / (2 * Math.PI);

export function launchSpeed(power: number, substance: SubstanceId) {
  const base = 4.7 + 4.3 * power;
  return substance === 'nitro' ? base * 1.5 : base;
}

export function launchVectors(input: ShotInput, substance: SubstanceId) {
  const p = Math.max(0, Math.min(1, input.power));
  const speed = launchSpeed(p, substance);
  // soft shots are lobbed, hard shots are driven flat
  const elev = ((21 - 13 * p + 8 * input.spinY) * Math.PI) / 180;
  const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, input.yaw));
  const dx = Math.sin(yaw), dz = -Math.cos(yaw);
  const v = v3(dx * Math.cos(elev) * speed, Math.sin(elev) * speed, dz * Math.cos(elev) * speed);
  // right = d × up = (-dz, 0, dx)
  const rx = -dz, rz = dx;
  const top = input.spinY * MAX_SPIN;
  const side = input.spinX * MAX_SPIN;
  const w = v3(-top * rx, -side, -top * rz);
  const pos: V3 = v3(LAUNCH.x, LAUNCH.y, LAUNCH.z);
  return { pos, v, w, speed };
}

/** Environment modifications of a chemical substance. */
export function applySubstance(env: BallEnv, substance: SubstanceId): BallEnv {
  switch (substance) {
    case 'nitro': env.dragScale *= 0.6; env.magnusScale *= 2.6; break;
    case 'bounce': env.restitutionTable = 1.4; env.restitutionFloor = 1.05; break;
    case 'quantum': env.tunneling = true; env.flipSideSpinAtNet = true; break;
    default: break; // magnet needs a target and is attached by the level
  }
  return env;
}

export { defaultEnv };
