// Level data: every experiment is a list of rounds; every round has a stage and an attempt budget.

import { BALL_RADIUS, NET, TABLE, type SubstanceId } from '../config';
import { applySubstance, defaultEnv } from '../physics/shot';
import type { BallEnv, Box, SimResult, V3 } from '../physics/ballPhysics';

const TOP = TABLE.height;

export interface TargetDef {
  kind: 'disc' | 'ring';
  /** Centre at absolute game time t (disc: on the table surface). */
  pos: (t: number) => V3;
  radius: number;
  perfect: number;
  /** Speed gate: the impact must be at least this fast (m/s). */
  minSpeed?: number;
}

export interface StageDef {
  title: string;
  /** One-line instruction shown in the HUD. */
  brief: string;
  target: TargetDef;
  obstacles: Box[];
  /** Substance choice: undefined = none, 'choose' = player picks, or a forced substance. */
  substance?: 'choose' | SubstanceId;
  gravity?: (t: number) => number;
  /** Optional DR. SPIN hint after a failed attempt. */
  hint?: string;
  /** Multiplies the Magnus effect (finale "resonance field"). */
  magnusScale?: number;
  /** For the solver/QA only: which substance is the intended solution. */
  intended?: SubstanceId;
}

export interface RoundDef { stage: StageDef; attempts: number }

export type ExperimentId = 'perfect' | 'chemical' | 'gravity' | 'rally' | 'finale';

export interface ExperimentDef {
  id: ExperimentId;
  code: string;
  name: string;
  tagline: string;
  intro: string;
  rounds: RoundDef[];
  /** Rally: multiplier grows with each success, misses cost points. */
  multiplier?: boolean;
  /** Minimum successful rounds to count the experiment as passed. */
  passAt: number;
}

const disc = (pos: (t: number) => V3, radius: number, perfect = radius * 0.3, minSpeed?: number): TargetDef =>
  ({ kind: 'disc', pos, radius, perfect, minSpeed });
const fixed = (x: number, z: number) => () => ({ x, y: TOP, z });
const sway = (z: number, amp: number, speed: number, phase = 0, cx = 0) =>
  (t: number) => ({ x: cx + amp * Math.sin(t * speed + phase), y: TOP, z });

const box = (id: string, kind: Box['kind'], x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box =>
  ({ id, kind, min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });

// ---------------------------------------------------------------- gravity schedule
export const GRAVITY_CYCLE = 5.2;
export const GRAVITY_PHASES = [
  { until: 1.5, g: 1.0, label: '1 g', kind: 'normal' as const },
  { until: 2.6, g: 0.25, label: '0,25 g', kind: 'low' as const },
  { until: 3.7, g: 2.6, label: '2,6 g', kind: 'heavy' as const },
  { until: 4.3, g: -0.4, label: '−0,4 g', kind: 'reverse' as const },
  { until: 5.2, g: 1.0, label: '1 g', kind: 'normal' as const },
];
export function gravityPhase(t: number) {
  const c = ((t % GRAVITY_CYCLE) + GRAVITY_CYCLE) % GRAVITY_CYCLE;
  return GRAVITY_PHASES.find((p) => c < p.until) ?? GRAVITY_PHASES[0];
}
export const gravitySchedule = (t: number) => gravityPhase(t).g;

// ---------------------------------------------------------------- experiments
const perfectRounds: RoundDef[] = [0.5, 0.75, 1.0, 1.25, 1.5, 1.8].map((speed, i) => ({
  attempts: 1,
  stage: {
    title: `VERSUCH ${i + 1}/6`,
    brief: 'Triff das wandernde Zielfeld.',
    target: disc(sway(-0.62 - (i % 3) * 0.17, 0.42, speed, i * 1.7), 0.17, 0.05),
    obstacles: [],
  },
}));

const glassWall = box('glass', 'glass', -1.3, 1.3, TOP - 0.2, TOP + 2.4, -0.47, -0.41);

const chemicalRounds: RoundDef[] = [
  {
    attempts: 3,
    stage: {
      title: 'PROBE A · PLASMA-GLAS',
      brief: 'Ziel hinter einer undurchdringlichen Glaswand.',
      target: disc(fixed(0.22, -0.95), 0.17, 0.05),
      obstacles: [glassWall],
      substance: 'choose',
      hint: 'Undurchdringlich gilt nur für Materie, die sich an Regeln hält. Quantenstaub tut das nicht.',
      intended: 'quantum',
    },
  },
  {
    attempts: 3,
    stage: {
      title: 'PROBE B · SCHWEBERING',
      brief: 'Erst auf den Tisch, dann durch den Ring.',
      target: { kind: 'ring', pos: () => ({ x: -0.1, y: TOP + 0.7, z: -1.85 }), radius: 0.2, perfect: 0.06 },
      obstacles: [],
      substance: 'choose',
      hint: 'Der Ring hängt höher, als ein anständiger Ball springt. Wir brauchen einen unanständigen.',
      intended: 'bounce',
    },
  },
  {
    attempts: 3,
    stage: {
      title: 'PROBE C · LICHTSCHRANKE',
      brief: 'Aufprall schneller als 7,6 m/s.',
      target: disc(fixed(0, -1.0), 0.3, 0.08, 7.6),
      obstacles: [],
      substance: 'choose',
      hint: 'Die Lichtschranke verlangt Tempo. Kälte macht schnell. Und Topspin hält es auf dem Tisch.',
      intended: 'nitro',
    },
  },
  {
    attempts: 3,
    stage: {
      title: 'PROBE D · MIKROZIEL',
      brief: 'Zielfeld Ø 12 cm. Viel Glück.',
      target: disc(sway(-0.85, 0.3, 0.6), 0.06, 0.02),
      obstacles: [],
      substance: 'choose',
      hint: 'Wenn du das Ziel nicht treffen kannst, lass dich vom Ziel treffen. Magnetgel.',
      intended: 'magnet',
    },
  },
];

const gravitySpots: [number, number][] = [[-0.3, -0.7], [0.35, -1.12], [0, -0.35], [-0.5, -1.15], [0.45, -0.55]];
const gravityRounds: RoundDef[] = gravitySpots.map(([x, z], i) => ({
  attempts: 2,
  stage: {
    title: `FELD ${i + 1}/5`,
    brief: 'Die Gravitation ändert sich. Timing ist alles.',
    target: disc(fixed(x, z), 0.18, 0.05),
    obstacles: [],
    gravity: gravitySchedule,
  },
}));

const rallyRounds: RoundDef[] = [
  {
    attempts: 3,
    stage: {
      title: '1 · BEWEGLICHES ZIEL',
      brief: 'Schnelles Ziel. Nicht hinterherschauen, vorhersagen.',
      target: disc(sway(-0.85, 0.5, 2.0), 0.17, 0.05),
      obstacles: [],
    },
  },
  {
    attempts: 3,
    stage: {
      title: '2 · SPIN-SCHLAG',
      brief: 'Eine Säule versperrt den Weg. Kurve drum herum.',
      target: disc(fixed(-0.5, -1.05), 0.2, 0.06),
      obstacles: [box('pillar', 'pillar', -0.44, -0.28, TOP, TOP + 1.6, -0.42, -0.28)],
      hint: 'Der Treffpunkt am Ball bestimmt die Kurve. Seitlich treffen, der Ball dankt es mit einer Biegung.',
    },
  },
  {
    attempts: 3,
    stage: {
      title: '3 · LASERSCHRANKE',
      brief: 'Unter dem Balken durch. Flach und mit Topspin.',
      target: disc(fixed(0.2, -1.0), 0.2, 0.06),
      obstacles: [box('bar', 'glass', -NET.halfSpan, NET.halfSpan, TOP + 0.34, TOP + 2.2, -0.03, 0.03)],
      hint: 'Niedrig rüber, Topspin bringt ihn runter. Das ist kein Tipp, das ist Physik.',
    },
  },
  {
    attempts: 3,
    stage: {
      title: '4 · SPEZIALEFFEKT',
      brief: 'SUPER BOUNCE geladen: Tisch, dann Ring.',
      target: { kind: 'ring', pos: () => ({ x: 0.15, y: TOP + 0.62, z: -1.8 }), radius: 0.2, perfect: 0.06 },
      obstacles: [],
      substance: 'bounce',
    },
  },
  {
    attempts: 3,
    stage: {
      title: '5 · FINALTREFFER',
      brief: 'Ø 16 cm, in Bewegung. Hier entstehen Legenden.',
      target: disc(sway(-1.05, 0.35, 1.1, 0.8), 0.08, 0.03),
      obstacles: [],
    },
  },
];

export const FINALE_WALL = box('monolith', 'pillar', -0.2, 0.2, TOP, TOP + 2.3, -0.24, -0.1);

const finaleRounds: RoundDef[] = [{
  attempts: Infinity,
  stage: {
    title: 'MONOLITH-PROTOKOLL',
    brief: 'Ziel direkt hinter dem Monolithen. R.O.L.F.-Feld aktiv.',
    target: disc(fixed(0, -1.02), 0.14, 0.045),
    obstacles: [FINALE_WALL],
    magnusScale: 3.2,
    hint: 'Ziele am Monolithen vorbei und lass den Seitenspin den Rest erledigen. Viel Seitenspin.',
  },
}];

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: 'perfect', code: '01', name: 'THE PERFECT SPIN', tagline: 'Winkel. Kraft. Rotation.',
    intro: 'Experiment 01. Ein Zielfeld, das nicht stillhalten kann. Wie meine Kollegen in der Kaffeepause.',
    rounds: perfectRounds, passAt: 3,
  },
  {
    id: 'chemical', code: '02', name: 'CHEMICAL CHAOS', tagline: 'Vier Substanzen. Null Sicherheitsfreigabe.',
    intro: 'Experiment 02. Wähle eine Substanz, bevor du schlägst. Die Etiketten habe ich selbst geschrieben.',
    rounds: chemicalRounds, passAt: 2,
  },
  {
    id: 'gravity', code: '03', name: 'GRAVITY BREAKER', tagline: 'Die Schwerkraft macht Schichtdienst.',
    intro: 'Experiment 03. Bitte bleiben Sie ruhig. Die Gravitation befindet sich nur kurz in der Wartung.',
    rounds: gravityRounds, passAt: 3,
  },
  {
    id: 'rally', code: '04', name: 'THE IMPOSSIBLE RALLY', tagline: 'Fünf Prüfungen. Ein Multiplikator.',
    intro: 'Experiment 04. Fünf Prüfungen am Stück. Jeder Treffer erhöht den Multiplikator. Jeder Fehler meine Laune.',
    rounds: rallyRounds, multiplier: true, passAt: 3,
  },
  {
    id: 'finale', code: '05', name: 'DER UNMÖGLICHE SCHLAG', tagline: 'Die Simulation sagt nein.',
    intro: 'Die Simulation hält diesen Schlag für unmöglich. Ich persönlich halte das für eine Herausforderung.',
    rounds: finaleRounds, passAt: 1,
  },
];

export const experimentById = (id: ExperimentId) => EXPERIMENTS.find((e) => e.id === id)!;

// ---------------------------------------------------------------- environment & evaluation

export function buildEnv(stage: StageDef, substance: SubstanceId): BallEnv {
  const env = applySubstance(defaultEnv(), substance);
  env.obstacles = stage.obstacles;
  if (stage.gravity) env.gravityAt = stage.gravity;
  if (stage.magnusScale) env.magnusScale *= stage.magnusScale;
  if (substance === 'magnet') {
    const tp = stage.target.pos;
    env.magnet = { pos: tp, strength: 260, radius: 1.1 };
  }
  return env;
}

export type FailReason = 'net' | 'own' | 'long' | 'wide' | 'obstacle' | 'miss' | 'slow' | 'ring' | 'short';

export interface ShotOutcome {
  success: boolean;
  perfect: boolean;
  reason?: FailReason;
  /** Distance from the target centre (m) at the decisive moment. */
  distance: number;
  /** 0..1 accuracy inside the target radius. */
  accuracy: number;
  /** Time since launch of the decisive moment. */
  hitTime: number;
  hitPoint: V3;
  impactSpeed: number;
}

export function evaluateShot(sim: SimResult, stage: StageDef, launchClock: number): ShotOutcome {
  const T = stage.target;
  const fail = (reason: FailReason, t: number, p: V3, d = Infinity, speed = 0): ShotOutcome =>
    ({ success: false, perfect: false, reason, distance: d, accuracy: 0, hitTime: t, hitPoint: p, impactSpeed: speed });

  const blocking = sim.events.find((e) => e.type === 'obstacle');
  const first = sim.firstBounce;
  const netEv = sim.events.find((e) => e.type === 'net');
  const endT = sim.duration;
  const endP = sim.samples[sim.samples.length - 1].p;

  if (T.kind === 'disc') {
    if (blocking && (!first || blocking.t < first.t)) return fail('obstacle', blocking.t, blocking.p);
    if (netEv && (!first || netEv.t < first.t)) return fail('net', netEv.t, netEv.p);
    if (!first) return fail('long', endT, endP);
    if (first.type === 'floor') {
      const p = first.p;
      const reason: FailReason = Math.abs(p.x) > TABLE.halfW && p.z < TABLE.halfL ? 'wide' : p.z > 0 ? 'short' : 'long';
      return fail(reason, first.t, p);
    }
    if (first.side === 'own') return fail('own', first.t, first.p);
    const c = T.pos(launchClock + first.t);
    const d = Math.hypot(first.p.x - c.x, first.p.z - c.z);
    if (d > T.radius) return fail('miss', first.t, first.p, d, first.speed);
    if (T.minSpeed && first.speed < T.minSpeed) return fail('slow', first.t, first.p, d, first.speed);
    return {
      success: true, perfect: d <= T.perfect, distance: d, accuracy: 1 - d / T.radius,
      hitTime: first.t, hitPoint: first.p, impactSpeed: first.speed,
    };
  }

  // ring: must bounce on the opponent half first, then fly through the hoop
  if (!first || first.type !== 'table' || first.side !== 'opp') {
    if (blocking) return fail('obstacle', blocking.t, blocking.p);
    if (netEv) return fail('net', netEv.t, netEv.p);
    if (first?.side === 'own') return fail('own', first.t, first.p);
    return fail(first ? 'long' : 'long', first?.t ?? endT, first?.p ?? endP);
  }
  const s = sim.samples;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1], b = s[i];
    if (a.t < first.t) continue;
    const c = T.pos(launchClock + b.t);
    if (a.p.z > c.z && b.p.z <= c.z) {
      const f = (a.p.z - c.z) / (a.p.z - b.p.z);
      const x = a.p.x + (b.p.x - a.p.x) * f, y = a.p.y + (b.p.y - a.p.y) * f;
      const d = Math.hypot(x - c.x, y - c.y);
      const hp = { x, y, z: c.z };
      if (d > T.radius - BALL_RADIUS) return fail('ring', b.t, hp, d, b.speed);
      return {
        success: true, perfect: d <= T.perfect, distance: d, accuracy: 1 - d / T.radius,
        hitTime: b.t, hitPoint: hp, impactSpeed: b.speed,
      };
    }
  }
  return fail('ring', first.t, first.p);
}
