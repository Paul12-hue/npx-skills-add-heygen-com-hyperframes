import type { Prim, Vec3 } from './sdf';

/**
 * Character designs, sculpted from soft primitives. Coordinates are metres in
 * the bind pose; the figure stands on y = 0 and faces −z.
 */

export interface Joints {
  hips: Vec3; spine: Vec3; chest: Vec3; neck: Vec3; head: Vec3;
  shoulderL: Vec3; elbowL: Vec3; wristL: Vec3;
  shoulderR: Vec3; elbowR: Vec3; wristR: Vec3;
  hipL: Vec3; kneeL: Vec3; ankleL: Vec3;
  hipR: Vec3; kneeR: Vec3; ankleR: Vec3;
}

export interface FigureSpec {
  name: string;
  joints: Joints;
  prims: Prim[];
  /** eye positions (bind pose) and radius, iris colour */
  eyes: { l: Vec3; r: Vec3; radius: number; iris: string; glow: number };
  bounds: { min: Vec3; max: Vec3 };
  /** colour names used in prims → hex (lets many villagers share one sculpted shape) */
  palette?: Record<string, string>;
  /** villagers with the same shape key share their mesh */
  shapeKey?: string;
}

const mirror = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Adult proportions scaled by height; shared by the Unsung and adult NPCs. */
function adultJoints(h: number): Joints {
  const s = h / 1.75;
  const j = (x: number, y: number, z: number): Vec3 => [x * s, y * s, z * s];
  return {
    hips: j(0, 0.96, 0), spine: j(0, 1.1, 0), chest: j(0, 1.3, 0), neck: j(0, 1.5, 0), head: j(0, 1.6, 0),
    shoulderL: j(0.19, 1.43, 0.0), elbowL: j(0.23, 1.16, 0.03), wristL: j(0.25, 0.92, 0.0),
    shoulderR: j(-0.19, 1.43, 0.0), elbowR: j(-0.23, 1.16, 0.03), wristR: j(-0.25, 0.92, 0.0),
    hipL: j(0.095, 0.94, 0), kneeL: j(0.1, 0.52, -0.02), ankleL: j(0.1, 0.09, 0.01),
    hipR: j(-0.095, 0.94, 0), kneeR: j(-0.1, 0.52, -0.02), ankleR: j(-0.1, 0.09, 0.01),
  };
}

/** Where the eyeballs sit for a face centred at c with scale s. */
export function eyePositions(c: Vec3, s: number): [Vec3, Vec3] {
  return [
    [c[0] + 0.034 * s, c[1] + 0.02 * s, c[2] - 0.095 * s],
    [c[0] - 0.034 * s, c[1] + 0.02 * s, c[2] - 0.095 * s],
  ];
}

/**
 * A friendly, lively face: soft skull and jaw, full cheeks with a little blush,
 * eyelids instead of dark sockets, a small nose, a mouth with lifted corners.
 */
function face(c: Vec3, s: number, skin: string, lip: string, brow: string, blush: string): Prim[] {
  const p = (x: number, y: number, z: number): Vec3 => [c[0] + x * s, c[1] + y * s, c[2] + z * s];
  const r = (x: number, y: number, z: number): Vec3 => [x * s, y * s, z * s];
  const prims: Prim[] = [
    { shape: { kind: 'ellipsoid', c: p(0, 0.02, 0.008), r: r(0.093, 0.112, 0.106) }, bone: 'head', color: skin, blend: 0.02 },
    { shape: { kind: 'cone', a: p(0, -0.02, -0.02), b: p(0, -0.078, -0.055), ra: 0.074 * s, rb: 0.042 * s }, bone: 'head', color: skin, blend: 0.05 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.09, -0.064), r: r(0.03, 0.022, 0.024) }, bone: 'head', color: skin, blend: 0.025 * s },
    // full cheeks with a soft blush
    { shape: { kind: 'ellipsoid', c: p(0.045, -0.025, -0.066), r: r(0.027, 0.02, 0.022) }, bone: 'head', color: blush, blend: 0.03 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.045, -0.025, -0.066), r: r(0.027, 0.02, 0.022) }, bone: 'head', color: blush, blend: 0.03 * s },
    // soft brow
    { shape: { kind: 'ellipsoid', c: p(0, 0.046, -0.082), r: r(0.07, 0.016, 0.024) }, bone: 'head', color: skin, blend: 0.03 * s },
    // small nose
    { shape: { kind: 'cone', a: p(0, 0.028, -0.099), b: p(0, -0.017, -0.113), ra: 0.006 * s, rb: 0.0105 * s }, bone: 'head', color: skin, blend: 0.012 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.021, -0.105), r: r(0.015, 0.008, 0.01) }, bone: 'head', color: skin, blend: 0.01 * s },
    // mouth: lips with lifted corners (a gentle smile)
    { shape: { kind: 'ellipsoid', c: p(0, -0.052, -0.098), r: r(0.021, 0.006, 0.01) }, bone: 'head', color: lip, blend: 0.008 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.062, -0.095), r: r(0.018, 0.0065, 0.01) }, bone: 'head', color: lip, blend: 0.008 * s },
    { shape: { kind: 'ellipsoid', c: p(0.022, -0.05, -0.09), r: r(0.007, 0.005, 0.007) }, bone: 'head', color: lip, blend: 0.008 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.022, -0.05, -0.09), r: r(0.007, 0.005, 0.007) }, bone: 'head', color: lip, blend: 0.008 * s },
    // ears
    { shape: { kind: 'ellipsoid', c: p(0.093, 0.0, 0.01), r: r(0.013, 0.028, 0.019) }, bone: 'head', color: skin, blend: 0.012 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.093, 0.0, 0.01), r: r(0.013, 0.028, 0.019) }, bone: 'head', color: skin, blend: 0.012 * s },
    // arched eyebrows
    { shape: { kind: 'cone', a: p(0.014, 0.052, -0.098), b: p(0.058, 0.058, -0.084), ra: 0.0055 * s, rb: 0.0035 * s }, bone: 'head', color: brow, blend: 0.002 },
    { shape: { kind: 'cone', a: p(-0.014, 0.052, -0.098), b: p(-0.058, 0.058, -0.084), ra: 0.0055 * s, rb: 0.0035 * s }, bone: 'head', color: brow, blend: 0.002 },
  ];
  // eyelids frame the eyeballs (no dark sockets)
  for (const x of [0.034, -0.034]) {
    prims.push(
      { shape: { kind: 'ellipsoid', c: p(x, 0.043, -0.082), r: r(0.022, 0.0045, 0.014) }, bone: 'head', color: skin, blend: 0.005 * s },
      { shape: { kind: 'ellipsoid', c: p(x, -0.003, -0.082), r: r(0.018, 0.0032, 0.011) }, bone: 'head', color: skin, blend: 0.005 * s },
    );
  }
  return prims;
}

function limbs(J: Joints, o: { sleeve: string; glove: string; trousers: string; boot: string; armR: number; legR: number }): Prim[] {
  const prims: Prim[] = [];
  for (const side of ['L', 'R'] as const) {
    const sh = J[`shoulder${side}`];
    const el = J[`elbow${side}`];
    const wr = J[`wrist${side}`];
    const hp = J[`hip${side}`];
    const kn = J[`knee${side}`];
    const an = J[`ankle${side}`];
    const ar = o.armR;
    prims.push(
      { shape: { kind: 'cone', a: sh, b: el, ra: 0.052 * ar, rb: 0.042 * ar }, bone: `upperArm${side}`, color: o.sleeve, blend: 0.03 },
      { shape: { kind: 'cone', a: el, b: wr, ra: 0.042 * ar, rb: 0.034 * ar }, bone: `forearm${side}`, color: o.sleeve, blend: 0.02 },
      // cuff + gloved hand with thumb
      { shape: { kind: 'cone', a: add(wr, [0, 0.03, 0]), b: add(wr, [0, -0.01, 0]), ra: 0.042 * ar, rb: 0.04 * ar }, bone: `forearm${side}`, color: o.glove, blend: 0.004 },
      { shape: { kind: 'ellipsoid', c: add(wr, [0, -0.075, -0.004]), r: [0.022 * ar, 0.055 * ar, 0.042 * ar] }, bone: `hand${side}`, color: o.glove, blend: 0.02 },
      { shape: { kind: 'cone', a: add(wr, [0, -0.04, -0.03]), b: add(wr, [side === 'L' ? -0.005 : 0.005, -0.085, -0.05]), ra: 0.013 * ar, rb: 0.011 * ar }, bone: `hand${side}`, color: o.glove, blend: 0.01 },
      { shape: { kind: 'cone', a: hp, b: kn, ra: 0.078 * o.legR, rb: 0.054 * o.legR }, bone: `thigh${side}`, color: o.trousers, blend: 0.03 },
      { shape: { kind: 'cone', a: kn, b: an, ra: 0.052 * o.legR, rb: 0.04 * o.legR }, bone: `shin${side}`, color: o.trousers, blend: 0.02 },
      // boot: shaft and foot
      { shape: { kind: 'cone', a: add(an, [0, 0.2, 0]), b: add(an, [0, -0.02, 0]), ra: 0.056 * o.legR, rb: 0.05 * o.legR }, bone: `shin${side}`, color: o.boot, blend: 0.006 },
      { shape: { kind: 'cone', a: add(an, [0, -0.03, 0.02]), b: add(an, [0, -0.05, -0.13]), ra: 0.05 * o.legR, rb: 0.042 * o.legR }, bone: `foot${side}`, color: o.boot, blend: 0.02 },
    );
  }
  return prims;
}

// ======================================================================
/** The Unsung: hooded, grey-violet wanderer with pale skin and pale violet eyes. */
export function unsungSpec(): FigureSpec {
  const J = adultJoints(1.76);
  const C = { skin: 'ecccb8', blush: 'e8bcb0', hair: 'b8b0c8', lip: 'b86a60', brow: '6a6078', hood: '8a3a5a', hoodIn: '4a1a2a', tunic: '3a4560', belt: '4a2c1c', buckle: 'c9a050', trousers: '2c2a34', boot: '3a2618', glove: '3a2618', scarf: '6a4a8a', cape: '7a2e4c' };
  const H = J.head;
  const prims: Prim[] = [
    // long travelling cloak, open at the front
    { shape: { kind: 'cone', a: [0, 1.44, 0.03], b: [0, 0.46, 0.06], ra: 0.2, rb: 0.3 }, bone: 'chest', color: C.cape, },
    { shape: { kind: 'box', c: [0, 0.95, -0.3], h: [0.1, 0.62, 0.2], round: 0.05 }, bone: 'chest', color: C.cape, subtract: true, blend: 0.06 },
    { shape: { kind: 'cone', a: [0, 1.3, 0.03], b: [0, 0.4, 0.06], ra: 0.17, rb: 0.282 }, bone: 'chest', color: C.cape, subtract: true, blend: 0.01 },
    { shape: { kind: 'box', c: [0, 0.4, 0.05], h: [0.5, 0.06, 0.5], round: 0 }, bone: 'chest', color: C.cape, subtract: true },
    // torso: chest, waist, hips (under the tunic)
    { shape: { kind: 'ellipsoid', c: [0, 1.31, 0.005], r: [0.17, 0.16, 0.115] }, bone: 'chest', color: C.tunic },
    { shape: { kind: 'ellipsoid', c: [0, 1.12, 0], r: [0.145, 0.13, 0.095] }, bone: 'spine', color: C.tunic, blend: 0.08 },
    { shape: { kind: 'ellipsoid', c: [0, 0.96, 0.005], r: [0.16, 0.11, 0.1] }, bone: 'hips', color: C.tunic, blend: 0.06 },
    // tunic skirt to mid-thigh
    { shape: { kind: 'cone', a: [0, 0.98, 0.005], b: [0, 0.7, 0.01], ra: 0.165, rb: 0.2 }, bone: 'hips', color: C.tunic, blend: 0.04 },
    // belt with buckle
    { shape: { kind: 'cone', a: [0, 1.0, 0], b: [0, 0.95, 0], ra: 0.168, rb: 0.17 }, bone: 'hips', color: C.belt, blend: 0.004 },
    { shape: { kind: 'box', c: [0, 0.975, -0.165], h: [0.03, 0.025, 0.008], round: 0.006 }, bone: 'hips', color: C.buckle },
    // pouch
    { shape: { kind: 'box', c: [0.13, 0.92, -0.08], h: [0.04, 0.05, 0.025], round: 0.015 }, bone: 'hips', color: C.belt, blend: 0.01 },
    // neck
    { shape: { kind: 'cone', a: J.neck, b: add(H, [0, 0.02, 0]), ra: 0.05, rb: 0.048 }, bone: 'neck', color: C.skin, blend: 0.03 },
    // mantle over the shoulders
    { shape: { kind: 'ellipsoid', c: [0, 1.445, 0.02], r: [0.235, 0.065, 0.165] }, bone: 'chest', color: C.hood, blend: 0.05 },
    // the hood is pulled down: it lies bunched behind the neck
    { shape: { kind: 'ellipsoid', c: [0, 1.53, 0.1], r: [0.15, 0.085, 0.09] }, bone: 'neck', color: C.hood, blend: 0.04 },
    { shape: { kind: 'cone', a: [0, 1.5, 0.15], b: [0, 1.3, 0.17], ra: 0.09, rb: 0.03 }, bone: 'chest', color: C.hood, blend: 0.05 },
    // tousled ash-silver hair
    { shape: { kind: 'shell', c: add(H, [0, 0.115, 0.012]), r: [0.1, 0.112, 0.114], thickness: 0.014 }, bone: 'head', color: C.hair, blend: 0.006 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.075, -0.16]), r: [0.085, 0.1, 0.1] }, bone: 'head', color: C.hair, subtract: true, blend: 0.01 },
    ...face(add(H, [0, 0.085, 0]), 1, C.skin, C.lip, C.brow, C.blush),
    { shape: { kind: 'ellipsoid', c: add(H, [0.03, 0.2, -0.07]), r: [0.06, 0.028, 0.05] }, bone: 'head', color: C.hair, blend: 0.03 },
    { shape: { kind: 'ellipsoid', c: add(H, [-0.045, 0.19, -0.075]), r: [0.045, 0.024, 0.045] }, bone: 'head', color: C.hair, blend: 0.03 },
    { shape: { kind: 'cone', a: add(H, [0.085, 0.13, -0.02]), b: add(H, [0.098, 0.05, -0.03]), ra: 0.024, rb: 0.01 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'cone', a: add(H, [-0.085, 0.13, -0.02]), b: add(H, [-0.098, 0.05, -0.03]), ra: 0.024, rb: 0.01 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.1, 0.08]), r: [0.09, 0.09, 0.05] }, bone: 'head', color: C.hair, blend: 0.03 },
    ...limbs(J, { sleeve: C.tunic, glove: C.glove, trousers: C.trousers, boot: C.boot, armR: 1, legR: 1 }),
  ];
  return {
    name: 'unsung',
    joints: J,
    prims,
    eyes: { ...eyesAt(add(H, [0, 0.085, 0]), 1), radius: 0.0185, iris: '7a6ab8', glow: 0 },
    bounds: { min: [-0.42, -0.02, -0.3], max: [0.42, 1.98, 0.42] },
  };
}

/** Tilde, the gravedigger's girl: 12 years old, copper braids, a patched smock. */
export function tildeSpec(): FigureSpec {
  const h = 1.42;
  const s = h / 1.75;
  const J0 = adultJoints(h);
  // children: relatively larger heads, shorter legs
  const J: Joints = { ...J0, head: [0, J0.head[1] - 0.02, 0], neck: [0, J0.neck[1] - 0.01, 0] };
  const C = { skin: 'efcdb6', blush: 'ecbcac', lip: 'c46a5e', brow: '8a3a18', hair: 'b4501e', smock: '5a6a3a', apron: 'b8a68a', sleeve: '7a5a3a', trousers: '4a3a2a', boot: '3a2618', glove: 'e8b898', patch: '8a4a2a' };
  const H = J.head;
  const hs = 1.08; // head scale relative to body
  const prims: Prim[] = [
    { shape: { kind: 'ellipsoid', c: [0, 1.31 * s, 0], r: [0.15 * s, 0.15 * s, 0.105 * s] }, bone: 'chest', color: C.smock },
    { shape: { kind: 'ellipsoid', c: [0, 1.1 * s, 0], r: [0.14 * s, 0.13 * s, 0.1 * s] }, bone: 'spine', color: C.smock, blend: 0.06 },
    { shape: { kind: 'cone', a: [0, 1.05 * s, 0], b: [0, 0.6 * s, 0.01], ra: 0.15 * s, rb: 0.22 * s }, bone: 'hips', color: C.smock, blend: 0.05 },
    // apron
    { shape: { kind: 'box', c: [0, 0.92 * s, -0.13 * s], h: [0.12 * s, 0.22 * s, 0.01], round: 0.015 }, bone: 'hips', color: C.apron, blend: 0.02 },
    { shape: { kind: 'box', c: [0.06 * s, 0.85 * s, -0.15 * s], h: [0.035 * s, 0.035 * s, 0.006], round: 0.006 }, bone: 'hips', color: C.patch },
    { shape: { kind: 'cone', a: J.neck, b: add(H, [0, 0.02, 0]), ra: 0.042, rb: 0.04 }, bone: 'neck', color: C.skin, blend: 0.025 },
    // collar
    { shape: { kind: 'ellipsoid', c: [0, J.neck[1] - 0.03, 0.005], r: [0.1, 0.028, 0.08] }, bone: 'chest', color: '8a7a5a', blend: 0.02 },
    // hair: cap (cut open over the face), fringe and two braids
    { shape: { kind: 'shell', c: add(H, [0, 0.1, 0.014]), r: [0.102 * hs, 0.112 * hs, 0.114 * hs], thickness: 0.012 }, bone: 'head', color: C.hair, blend: 0.006 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.07, -0.16]), r: [0.088, 0.105, 0.1] }, bone: 'head', color: C.hair, subtract: true, blend: 0.01 },
    ...face(add(H, [0, 0.08, 0]), hs, C.skin, C.lip, C.brow, C.blush),
    { shape: { kind: 'cone', a: add(H, [-0.06, 0.2, -0.07]), b: add(H, [0.05, 0.165, -0.095]), ra: 0.022, rb: 0.01 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'cone', a: add(H, [0.08, 0.06, 0.04]), b: add(H, [0.1, -0.16, 0.05]), ra: 0.028, rb: 0.018 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'cone', a: add(H, [-0.08, 0.06, 0.04]), b: add(H, [-0.1, -0.16, 0.05]), ra: 0.028, rb: 0.018 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'ellipsoid', c: add(H, [0.1, -0.18, 0.05]), r: [0.022, 0.012, 0.022] }, bone: 'head', color: C.patch, blend: 0.004 },
    { shape: { kind: 'ellipsoid', c: add(H, [-0.1, -0.18, 0.05]), r: [0.022, 0.012, 0.022] }, bone: 'head', color: C.patch, blend: 0.004 },
    ...limbs(J, { sleeve: C.sleeve, glove: C.glove, trousers: C.trousers, boot: C.boot, armR: 0.85, legR: 0.85 }),
  ];
  return {
    name: 'tilde',
    joints: J,
    prims,
    eyes: { ...eyesAt(add(H, [0, 0.08, 0]), hs), radius: 0.019, iris: '3a8a5a', glow: 0 },
    bounds: { min: [-0.36, -0.02, -0.24], max: [0.36, 1.62, 0.24] },
  };
}

export { mirror };

function eyesAt(c: Vec3, s: number): { l: Vec3; r: Vec3 } {
  const [l, r] = eyePositions(c, s);
  return { l, r };
}

/** A long skirt or robe from the waist down, plus a shawl – shared by older villagers and the Faded. */
function robe(J: Joints, cloth: string, shawl: string, skirtR: number): Prim[] {
  return [
    { shape: { kind: 'ellipsoid', c: [0, 1.31, 0.005], r: [0.16, 0.15, 0.11] }, bone: 'chest', color: cloth },
    { shape: { kind: 'ellipsoid', c: [0, 1.12, 0], r: [0.15, 0.13, 0.1] }, bone: 'spine', color: cloth, blend: 0.08 },
    { shape: { kind: 'cone', a: [0, 1.02, 0], b: [0, 0.06, 0.01], ra: 0.16, rb: skirtR }, bone: 'hips', color: cloth, blend: 0.06 },
    { shape: { kind: 'ellipsoid', c: [0, 1.43, 0.02], r: [0.23, 0.08, 0.16] }, bone: 'chest', color: shawl, blend: 0.05 },
    { shape: { kind: 'cone', a: J.neck, b: add(J.head, [0, 0.02, 0]), ra: 0.05, rb: 0.048 }, bone: 'neck', color: 'e2c0a8', blend: 0.03 },
  ];
}

/** Mother Odile, eldest of the Lamplighters: grey bun, warm shawl, candle-wax apron. */
export function odileSpec(): FigureSpec {
  const J = adultJoints(1.62);
  const H = J.head;
  const C = { skin: 'e2c0a8', blush: 'dca898', lip: 'b0706a', brow: 'a8a0a0', hair: 'c8c4c8', dress: '5a3a4a', shawl: 'b07040', apron: 'd8ccb0' };
  const prims: Prim[] = [
    ...robe(J, C.dress, C.shawl, 0.3),
    { shape: { kind: 'box', c: [0, 0.7, -0.17], h: [0.15, 0.36, 0.012], round: 0.02 }, bone: 'hips', color: C.apron, blend: 0.02 },
    { shape: { kind: 'shell', c: add(H, [0, 0.11, 0.012]), r: [0.1, 0.11, 0.112], thickness: 0.012 }, bone: 'head', color: C.hair, blend: 0.006 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.075, -0.16]), r: [0.085, 0.1, 0.1] }, bone: 'head', color: C.hair, subtract: true, blend: 0.01 },
    ...face(add(H, [0, 0.085, 0]), 1, C.skin, C.lip, C.brow, C.blush),
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.19, 0.09]), r: [0.06, 0.055, 0.055] }, bone: 'head', color: C.hair, blend: 0.02 },
    ...limbs(J, { sleeve: C.dress, glove: C.skin, trousers: C.dress, boot: '3a2618', armR: 0.95, legR: 0.9 }),
  ];
  return {
    name: 'odile',
    joints: J,
    prims,
    eyes: { ...eyesAt(add(H, [0, 0.085, 0]), 1), radius: 0.017, iris: '6a5a40', glow: 0 },
    bounds: { min: [-0.42, -0.02, -0.3], max: [0.42, 1.85, 0.32] },
  };
}

/** One of the Faded: a grey, half-remembered villager. */
export function fadedSpec(variant: number): FigureSpec {
  const J = adultJoints(1.66 + (variant % 3) * 0.06);
  const H = J.head;
  const g = ['9a98a4', '8a8896', 'a8a6b0'][variant % 3];
  const prims: Prim[] = [
    ...robe(J, g, '7a7886', 0.26 + (variant % 2) * 0.05),
    { shape: { kind: 'shell', c: add(H, [0, 0.11, 0.03]), r: [0.13, 0.15, 0.15], thickness: 0.014 }, bone: 'head', color: '7a7886', blend: 0.03 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.06, -0.16]), r: [0.11, 0.15, 0.15] }, bone: 'head', color: '7a7886', subtract: true, blend: 0.04 },
    ...face(add(H, [0, 0.085, 0]), 1, 'b8b6c0', '9a98a4', '7a7886', 'b0aeb8'),
    ...limbs(J, { sleeve: g, glove: 'b8b6c0', trousers: g, boot: '6a6874', armR: 0.95, legR: 0.95 }),
  ];
  return {
    name: 'faded' + (variant % 3),
    joints: J,
    prims,
    eyes: { ...eyesAt(add(H, [0, 0.085, 0]), 1), radius: 0.017, iris: 'c8c6d0', glow: 0.4 },
    bounds: { min: [-0.42, -0.02, -0.3], max: [0.42, 1.95, 0.34] },
  };
}

// ======================================================================
/** Body types for ordinary villagers. */
export type Build = 'man' | 'woman' | 'elder' | 'child';

const SKIN = ['f0d0b8', 'e8c0a0', 'd8a888', 'c89070', 'a87058', 'f2d8c8'];
const HAIR = ['3a2418', '5a3a20', '8a5a2a', 'b4501e', '1e1a1a', 'c8a060', '6a5a4a'];
const CLOTH = ['6a4a3a', '4a5a3a', '3a4a5a', '7a5a3a', '5a3a4a', '8a6a4a', '4a4a5a', '6a3a2a', '3a5a50', '8a7a5a'];
const LIGHT = ['c8b898', 'b8a888', 'd8c8a8', 'a89878', 'c0b090'];
const BOOT = ['3a2618', '2a1e14', '4a3020'];

/**
 * An ordinary inhabitant of the vale. The seed picks the body, clothes, hair,
 * headwear and colours, so a handful of seeds gives a varied village.
 */
export function villagerSpec(seed: number, build: Build): FigureSpec {
  // the shape comes from a small set per body type (so meshes are shared); the colours from the seed
  const shapeSeed = seed % { man: 5, woman: 4, elder: 3, child: 2 }[build];
  const gen = (start: number) => {
    let st = start * 9301 + 49297;
    return () => ((st = (st * 9301 + 49297) % 233280) / 233280);
  };
  const r = gen(shapeSeed * 7 + { man: 1, woman: 2, elder: 3, child: 4 }[build]);
  const rc = gen(seed);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const pickC = <T,>(a: T[]) => a[Math.floor(rc() * a.length)];
  const child = build === 'child';
  const h = child ? 1.3 + r() * 0.12 : build === 'elder' ? 1.6 + r() * 0.08 : build === 'woman' ? 1.62 + r() * 0.1 : 1.72 + r() * 0.12;
  const sc = h / 1.75;
  const J0 = adultJoints(h);
  const J: Joints = child ? { ...J0, head: [0, J0.head[1] - 0.02, 0], neck: [0, J0.neck[1] - 0.01, 0] } : J0;
  const H = J.head;
  const hs = child ? 1.08 : 1;
  const skin = pickC(SKIN);
  const palette: Record<string, string> = {
    skin,
    hair: build === 'elder' ? pickC(['c8c4c8', 'a8a4a8', 'e0dcd8']) : pickC(HAIR),
    cloth: pickC(CLOTH),
    second: pickC(CLOTH),
    light: pickC(LIGHT),
    boot: pickC(BOOT),
    blush: new_blush(skin),
    lip: 'b0706a',
  };
  // prims name palette slots; the palette above fills them in
  const C = { skin: 'skin', hair: 'hair', cloth: 'cloth', second: 'second', light: 'light', boot: 'boot' };
  const blush = 'blush';
  const lip = 'lip';
  const wide = build === 'man' ? 1.08 : 1;
  const skirt = build === 'woman' || (build === 'elder' && r() < 0.5) || (child && r() < 0.4);
  const prims: Prim[] = [];
  if (skirt) {
    prims.push(...robe(J, C.cloth, C.second, child ? 0.2 : 0.27 + r() * 0.05).map((p) => (p.bone === 'neck' ? { ...p, color: C.skin } : p)));
    if (r() < 0.6) prims.push({ shape: { kind: 'box', c: [0, 0.7 * sc, -0.16 * sc], h: [0.14 * sc, 0.33 * sc, 0.012], round: 0.02 }, bone: 'hips', color: C.light, blend: 0.02 });
  } else {
    prims.push(
      { shape: { kind: 'ellipsoid', c: [0, 1.31 * sc, 0.005], r: [0.17 * sc * wide, 0.16 * sc, 0.115 * sc] }, bone: 'chest', color: C.cloth },
      { shape: { kind: 'ellipsoid', c: [0, 1.12 * sc, 0], r: [0.15 * sc * wide, 0.13 * sc, 0.1 * sc] }, bone: 'spine', color: C.cloth, blend: 0.08 },
      { shape: { kind: 'ellipsoid', c: [0, 0.96 * sc, 0.005], r: [0.16 * sc, 0.11 * sc, 0.1 * sc] }, bone: 'hips', color: C.cloth, blend: 0.06 },
      { shape: { kind: 'cone', a: [0, 0.98 * sc, 0.005], b: [0, 0.74 * sc, 0.01], ra: 0.165 * sc, rb: 0.19 * sc }, bone: 'hips', color: C.cloth, blend: 0.04 },
      { shape: { kind: 'cone', a: [0, 1.0 * sc, 0], b: [0, 0.95 * sc, 0], ra: 0.168 * sc, rb: 0.17 * sc }, bone: 'hips', color: '4a2c1c', blend: 0.004 },
      { shape: { kind: 'cone', a: J.neck, b: add(H, [0, 0.02, 0]), ra: 0.05 * hs, rb: 0.048 * hs }, bone: 'neck', color: C.skin, blend: 0.03 },
    );
    // a vest or a leather apron over the tunic
    if (r() < 0.5) prims.push({ shape: { kind: 'ellipsoid', c: [0, 1.25 * sc, -0.01], r: [0.175 * sc * wide, 0.19 * sc, 0.12 * sc] }, bone: 'chest', color: C.second, blend: 0.01 });
    else if (r() < 0.5) prims.push({ shape: { kind: 'box', c: [0, 1.0 * sc, -0.13 * sc], h: [0.15 * sc, 0.3 * sc, 0.012], round: 0.02 }, bone: 'spine', color: '6a4a30', blend: 0.02 });
  }
  // collar or shawl
  prims.push({ shape: { kind: 'ellipsoid', c: [0, J.neck[1] - 0.03, 0.01], r: [0.12 * hs, 0.03, 0.09] }, bone: 'chest', color: C.light, blend: 0.02 });

  // head: hair style and headwear
  const style = child ? pick(['short', 'braids', 'cap']) : build === 'man' ? pick(['short', 'short', 'cap', 'hood', 'bald']) : build === 'woman' ? pick(['bun', 'long', 'scarf', 'braids']) : pick(['bun', 'scarf', 'short', 'hood']);
  const hairCap = (col: string) => [
    { shape: { kind: 'shell', c: add(H, [0, 0.11, 0.012]), r: [0.1 * hs, 0.112 * hs, 0.114 * hs], thickness: 0.013 }, bone: 'head', color: col, blend: 0.006 } as Prim,
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.075, -0.16]), r: [0.085 * hs, 0.1 * hs, 0.1 * hs] }, bone: 'head', color: col, subtract: true, blend: 0.01 } as Prim,
  ];
  if (style !== 'bald') prims.push(...hairCap(style === 'scarf' || style === 'hood' ? (style === 'hood' ? C.second : C.light) : C.hair));
  prims.push(...face(add(H, [0, 0.085, 0]), hs, C.skin, lip, style === 'bald' ? C.hair : C.hair, blush));
  if (style === 'bun') prims.push({ shape: { kind: 'ellipsoid', c: add(H, [0, 0.19, 0.09]), r: [0.06, 0.055, 0.055] }, bone: 'head', color: C.hair, blend: 0.02 });
  if (style === 'long') prims.push({ shape: { kind: 'cone', a: add(H, [0, 0.12, 0.07]), b: add(H, [0, -0.14, 0.09]), ra: 0.09, rb: 0.07 }, bone: 'head', color: C.hair, blend: 0.03 });
  if (style === 'braids') {
    for (const x of [0.08, -0.08]) prims.push({ shape: { kind: 'cone', a: add(H, [x, 0.06, 0.04]), b: add(H, [x * 1.2, -0.16, 0.05]), ra: 0.026, rb: 0.017 }, bone: 'head', color: C.hair, blend: 0.02 });
  }
  if (style === 'short') prims.push({ shape: { kind: 'ellipsoid', c: add(H, [0.01, 0.2, -0.06]), r: [0.07, 0.026, 0.05] }, bone: 'head', color: C.hair, blend: 0.03 });
  if (style === 'cap') prims.push(
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.19, 0.0]), r: [0.115 * hs, 0.06, 0.12 * hs] }, bone: 'head', color: C.second, blend: 0.01 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.165, -0.1]), r: [0.08, 0.012, 0.05] }, bone: 'head', color: C.second, blend: 0.01 },
  );
  if (style === 'hood') prims.push({ shape: { kind: 'ellipsoid', c: [0, J.neck[1] + 0.02, 0.09], r: [0.14, 0.08, 0.08] }, bone: 'neck', color: C.second, blend: 0.04 });
  if (style === 'scarf') prims.push({ shape: { kind: 'cone', a: add(H, [0, 0.0, 0.1]), b: add(H, [0, -0.12, 0.12]), ra: 0.07, rb: 0.03 }, bone: 'head', color: C.light, blend: 0.03 });
  // beards for some of the men and elders
  if ((build === 'man' || build === 'elder') && !skirt && r() < 0.55) {
    const c = add(H, [0, 0.085, 0]);
    prims.push(
      { shape: { kind: 'ellipsoid', c: add(c, [0, -0.085, -0.06]), r: [0.07, 0.05, 0.05] }, bone: 'head', color: C.hair, blend: 0.02 },
      { shape: { kind: 'ellipsoid', c: add(c, [0, -0.04, -0.098]), r: [0.03, 0.008, 0.012] }, bone: 'head', color: C.hair, blend: 0.006 },
    );
  }
  const arm = child ? 0.85 : build === 'man' ? 1.05 : 0.95;
  prims.push(...limbs(J, { sleeve: skirt ? C.cloth : C.cloth, glove: C.skin, trousers: skirt ? C.cloth : C.second, boot: C.boot, armR: arm, legR: child ? 0.85 : arm }));
  return {
    name: `villager-${build}-${seed}`,
    shapeKey: `villager-${build}-shape${shapeSeed}`,
    palette,
    joints: J,
    prims,
    eyes: { ...eyesAt(add(H, [0, 0.085, 0]), hs), radius: child ? 0.019 : 0.0175, iris: pickC(['5a4030', '3a6a8a', '4a7a4a', '6a5a40', '2a2a3a']), glow: 0 },
    bounds: { min: [-0.44, -0.02, -0.32], max: [0.44, h + 0.25, 0.36] },
  };
}

function new_blush(skin: string): string {
  const n = parseInt(skin, 16);
  const r = Math.min(255, ((n >> 16) & 255) - 4);
  const g = Math.max(0, ((n >> 8) & 255) - 22);
  const b = Math.max(0, (n & 255) - 14);
  return ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}
