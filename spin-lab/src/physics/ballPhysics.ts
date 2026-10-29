// Deterministic table-tennis ball simulation.
// Every shot is simulated completely at launch time and then played back,
// so slow-motion, cameras and the finale can react to the *real* outcome.

import { BALL_RADIUS as R, G, NET, TABLE } from '../config';

export interface V3 { x: number; y: number; z: number }
export const v3 = (x = 0, y = 0, z = 0): V3 => ({ x, y, z });

export interface Box {
  id: string;
  min: V3;
  max: V3;
  /** Glass walls ring when hit; pillars thud. */
  kind: 'glass' | 'pillar';
}

export interface Magnet {
  pos: (t: number) => V3;
  strength: number;
  radius: number;
}

export interface BallEnv {
  /** Gravity multiplier at absolute game time t. */
  gravityAt: (t: number) => number;
  restitutionTable: number;
  restitutionFloor: number;
  dragScale: number;
  magnusScale: number;
  magnet?: Magnet;
  tunneling: boolean;
  flipSideSpinAtNet: boolean;
  obstacles: Box[];
}

export type PhysEventType =
  | 'table' | 'net' | 'netcord' | 'obstacle' | 'tunnel' | 'floor' | 'spinflip' | 'gravity';

export interface PhysEvent {
  type: PhysEventType;
  /** Time since launch. */
  t: number;
  p: V3;
  side?: 'own' | 'opp';
  speed: number;
  id?: string;
}

export interface Sample { t: number; p: V3; w: V3; speed: number; g: number }

export interface SimResult {
  samples: Sample[];
  events: PhysEvent[];
  duration: number;
  firstOppBounce?: PhysEvent;
  firstBounce?: PhysEvent;
  apex: number;
  maxSpeed: number;
}

export const DRAG = 0.072; // |a| = DRAG·|v|²  (m⁻¹)
export const MAGNUS = 0.005; // a = MAGNUS·(ω × v)
const SPIN_DECAY = 0.35; // 1/s
const MU = 0.26; // table friction
const STEP = 1 / 480;
const RECORD_EVERY = 2;

export const defaultEnv = (): BallEnv => ({
  gravityAt: () => 1,
  restitutionTable: 0.89,
  restitutionFloor: 0.62,
  dragScale: 1,
  magnusScale: 1,
  tunneling: false,
  flipSideSpinAtNet: false,
  obstacles: [],
});

const len = (a: V3) => Math.hypot(a.x, a.y, a.z);

/** Tangential friction impulse for a bounce on a horizontal surface (hollow sphere). */
function bounceHorizontal(v: V3, w: V3, e: number, mu: number, normalSign: 1 | -1) {
  const vn = v.y;
  // contact point relative to centre
  const rc = v3(0, -R * normalSign, 0);
  // slip = v + ω × rc (tangential part)
  const ux = v.x + (w.y * rc.z - w.z * rc.y);
  const uz = v.z + (w.x * rc.y - w.y * rc.x);
  const u = Math.hypot(ux, uz);
  v.y = -vn * e;
  if (u > 1e-6) {
    // 0.4·u stops slipping entirely for a thin shell (I = 2/3 m r²)
    const j = Math.min(mu * (1 + e) * Math.abs(vn), 0.4 * u);
    const jx = (-ux / u) * j;
    const jz = (-uz / u) * j;
    v.x += jx;
    v.z += jz;
    // Δω = 3/(2R²) · (rc × J)
    const k = 3 / (2 * R * R);
    w.x += k * (rc.y * jz - rc.z * 0);
    w.y += k * (rc.z * jx - rc.x * jz);
    w.z += k * (rc.x * 0 - rc.y * jx);
  }
}

export function simulate(p0: V3, v0: V3, w0: V3, env: BallEnv, startClock: number, maxT = 4.2): SimResult {
  const p = { ...p0 };
  const v = { ...v0 };
  const w = { ...w0 };
  const samples: Sample[] = [];
  const events: PhysEvent[] = [];
  let t = 0;
  let step = 0;
  let apex = p.y;
  let maxSpeed = len(v);
  let crossedNet = p.z < 0;
  let floorHits = 0;
  let lastG = env.gravityAt(startClock);
  const inside = new Set<string>();
  const top = TABLE.height;

  const record = (g: number) => samples.push({ t, p: { ...p }, w: { ...w }, speed: len(v), g });
  record(lastG);

  while (t < maxT) {
    const g = env.gravityAt(startClock + t);
    if (Math.abs(g - lastG) > 0.05) {
      events.push({ type: 'gravity', t, p: { ...p }, speed: g });
      lastG = g;
    }
    const sp = len(v);
    // drag + magnus + gravity
    const kd = DRAG * env.dragScale * sp;
    const km = MAGNUS * env.magnusScale;
    let ax = -kd * v.x + km * (w.y * v.z - w.z * v.y);
    let ay = -kd * v.y + km * (w.z * v.x - w.x * v.z) - G * g;
    let az = -kd * v.z + km * (w.x * v.y - w.y * v.x);
    if (env.magnet) {
      // lateral homing spring: the gel lines the ball up with the target axis, depth stays the player's job
      const m = env.magnet.pos(startClock + t);
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < env.magnet.radius) {
        const k = env.magnet.strength * (1 - d / env.magnet.radius);
        ax += k * dx - 2 * Math.sqrt(k) * v.x;
      }
    }
    v.x += ax * STEP; v.y += ay * STEP; v.z += az * STEP;
    const prevZ = p.z;
    const prevY = p.y;
    p.x += v.x * STEP; p.y += v.y * STEP; p.z += v.z * STEP;
    const decay = Math.exp(-SPIN_DECAY * STEP);
    w.x *= decay; w.y *= decay; w.z *= decay;
    t += STEP;
    step++;

    // --- table top
    const onTable = Math.abs(p.x) <= TABLE.halfW + R * 0.5 && Math.abs(p.z) <= TABLE.halfL + R * 0.5;
    if (onTable && p.y - R < top && prevY - R >= top - 0.02 && v.y < 0) {
      p.y = top + R;
      const impact = len(v);
      bounceHorizontal(v, w, env.restitutionTable, MU, 1);
      const side = p.z > 0 ? 'own' : 'opp';
      events.push({ type: 'table', t, p: { ...p }, side, speed: impact });
    }
    // table underside / edges: ball below the top and inside the footprint just falls through visually;
    // we only treat it as gone once it reaches the floor.

    // --- net plane z = 0
    if (!crossedNet && prevZ > 0 && p.z <= 0) {
      crossedNet = true;
      if (Math.abs(p.x) <= NET.halfSpan && p.y - R < top + NET.height && p.y > top - 0.01) {
        if (env.tunneling) {
          events.push({ type: 'tunnel', t, p: { ...p }, speed: len(v), id: 'net' });
        } else if (p.y > top + NET.height - R * 0.8) {
          // net cord: ball rolls over the tape, loses pace and pops up
          events.push({ type: 'netcord', t, p: { ...p }, speed: len(v) });
          v.z *= 0.45; v.x *= 0.7; v.y = Math.abs(v.y) * 0.3 + 0.9;
          p.y = top + NET.height + R;
        } else {
          events.push({ type: 'net', t, p: { ...p }, speed: len(v) });
          p.z = 0.002;
          v.z = Math.abs(v.z) * 0.12; v.x *= 0.4; v.y *= 0.3;
          w.x *= 0.3; w.y *= 0.3; w.z *= 0.3;
          crossedNet = false;
        }
      }
      if (crossedNet && env.flipSideSpinAtNet) {
        w.y = -w.y;
        events.push({ type: 'spinflip', t, p: { ...p }, speed: len(v) });
      }
    }

    // --- obstacles (axis-aligned boxes)
    for (const b of env.obstacles) {
      const cx = Math.max(b.min.x, Math.min(p.x, b.max.x));
      const cy = Math.max(b.min.y, Math.min(p.y, b.max.y));
      const cz = Math.max(b.min.z, Math.min(p.z, b.max.z));
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const touching = d2 < R * R;
      if (env.tunneling) {
        if (touching && !inside.has(b.id)) {
          inside.add(b.id);
          events.push({ type: 'tunnel', t, p: { ...p }, speed: len(v), id: b.id });
        } else if (!touching) inside.delete(b.id);
        continue;
      }
      if (!touching) continue;
      // push out along the axis of least penetration
      const pen = [
        { ax: 'x', d: p.x - (b.min.x - R), s: -1 }, { ax: 'x', d: b.max.x + R - p.x, s: 1 },
        { ax: 'y', d: p.y - (b.min.y - R), s: -1 }, { ax: 'y', d: b.max.y + R - p.y, s: 1 },
        { ax: 'z', d: p.z - (b.min.z - R), s: -1 }, { ax: 'z', d: b.max.z + R - p.z, s: 1 },
      ].sort((a, c) => a.d - c.d)[0];
      const axis = pen.ax as 'x' | 'y' | 'z';
      p[axis] += pen.s * pen.d;
      if (v[axis] * pen.s < 0) v[axis] = -v[axis] * 0.45;
      v.x *= 0.8; v.y *= 0.8; v.z *= 0.8;
      events.push({ type: 'obstacle', t, p: { ...p }, speed: len(v), id: b.id });
    }

    // --- floor
    if (p.y - R < 0 && v.y < 0) {
      p.y = R;
      const impact = len(v);
      bounceHorizontal(v, w, env.restitutionFloor, 0.4, 1);
      events.push({ type: 'floor', t, p: { ...p }, speed: impact });
      if (++floorHits >= 2) { if (step % RECORD_EVERY === 0) record(g); break; }
    }

    if (p.y > apex) apex = p.y;
    const s = len(v);
    if (s > maxSpeed) maxSpeed = s;
    if (step % RECORD_EVERY === 0) record(g);
    if (Math.abs(p.x) > 6 || Math.abs(p.z) > 7 || p.y > 9) break;
  }
  record(env.gravityAt(startClock + t));

  const firstBounce = events.find((e) => e.type === 'table' || e.type === 'floor');
  const firstOppBounce = firstBounce && firstBounce.type === 'table' && firstBounce.side === 'opp' ? firstBounce : undefined;
  return { samples, events, duration: t, firstBounce, firstOppBounce, apex, maxSpeed };
}

/** Interpolated playback position. */
export function sampleAt(res: SimResult, t: number, out: V3): Sample {
  const s = res.samples;
  if (t <= 0) { Object.assign(out, s[0].p); return s[0]; }
  if (t >= res.duration) { const last = s[s.length - 1]; Object.assign(out, last.p); return last; }
  // samples are evenly spaced except the last one
  const dt = s[1].t - s[0].t;
  let i = Math.min(s.length - 2, Math.floor(t / dt));
  while (i > 0 && s[i].t > t) i--;
  while (i < s.length - 2 && s[i + 1].t < t) i++;
  const a = s[i], b = s[i + 1];
  const f = Math.max(0, Math.min(1, (t - a.t) / Math.max(1e-6, b.t - a.t)));
  out.x = a.p.x + (b.p.x - a.p.x) * f;
  out.y = a.p.y + (b.p.y - a.p.y) * f;
  out.z = a.p.z + (b.p.z - a.p.z) * f;
  return a;
}
