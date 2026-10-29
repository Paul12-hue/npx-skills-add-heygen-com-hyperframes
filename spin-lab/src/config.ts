// Shared world dimensions (metres) and the art-direction palette.

export const TABLE = {
  length: 2.74,
  width: 1.525,
  height: 0.76,
  halfL: 1.37,
  halfW: 0.7625,
  thickness: 0.03,
} as const;

export const NET = {
  height: 0.1525,
  halfSpan: 0.915,
} as const;

/** The coach this lab is dedicated to. DR. SPIN talks about him, and to him when he plays. */
export const COACH = 'ROLF';

export const BALL_RADIUS = 0.02;
export const G = 9.81;

/** Where the ball hovers in the levitation emitter before a shot. */
export const LAUNCH = { x: 0, y: 1.02, z: 1.62 } as const;

export const PALETTE = {
  void: 0x05070b,
  anthracite: 0x10141b,
  deepBlue: 0x0a1424,
  cyan: 0x3fe0ff,
  cyanSoft: 0x2aa9c8,
  orange: 0xff7a1a,
  white: 0xf3f6f8,
  table: 0x14324a,
} as const;

export type SubstanceId = 'none' | 'nitro' | 'magnet' | 'bounce' | 'quantum';

export interface SubstanceDef {
  id: SubstanceId;
  name: string;
  formula: string;
  color: number;
  css: string;
  effect: string;
}

export const SUBSTANCES: Record<Exclude<SubstanceId, 'none'>, SubstanceDef> = {
  nitro: {
    id: 'nitro',
    name: 'LIQUID NITRO',
    formula: 'N₂(l)·Ω',
    color: 0x8fe9ff,
    css: '#8fe9ff',
    effect: '+45 % Abschussgeschwindigkeit, halber Luftwiderstand',
  },
  magnet: {
    id: 'magnet',
    name: 'MAGNETIC GEL',
    formula: 'Fe₃O₄-GEL',
    color: 0x8a7bff,
    css: '#8a7bff',
    effect: 'Wird vom Zielfeld angezogen',
  },
  bounce: {
    id: 'bounce',
    name: 'SUPER BOUNCE',
    formula: 'POLY-ε 1.4',
    color: 0xa6ff5c,
    css: '#a6ff5c',
    effect: 'Restitution 1,4 — springt höher, als er fällt',
  },
  quantum: {
    id: 'quantum',
    name: 'QUANTUM DUST',
    formula: 'Qu-∅ (instabil)',
    color: 0xff5ad1,
    css: '#ff5ad1',
    effect: 'Tunnelt durch Hindernisse · Seitenspin kippt am Netz',
  },
};
