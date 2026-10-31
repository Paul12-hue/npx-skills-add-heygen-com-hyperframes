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

/** A face: skull, jaw, nose, brows, cheeks, lips, ears, eye sockets. */
function face(c: Vec3, s: number, skin: string, lip: string, brow: string, blendK = 0.02): Prim[] {
  const p = (x: number, y: number, z: number): Vec3 => [c[0] + x * s, c[1] + y * s, c[2] + z * s];
  const r = (x: number, y: number, z: number): Vec3 => [x * s, y * s, z * s];
  const prims: Prim[] = [
    { shape: { kind: 'ellipsoid', c: p(0, 0.02, 0.01), r: r(0.092, 0.115, 0.108) }, bone: 'head', color: skin, blend: blendK },
    { shape: { kind: 'cone', a: p(0, -0.02, -0.02), b: p(0, -0.082, -0.058), ra: 0.072 * s, rb: 0.04 * s }, bone: 'head', color: skin, blend: 0.045 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.095, -0.068), r: r(0.03, 0.024, 0.024) }, bone: 'head', color: skin, blend: 0.02 * s },
    // cheekbones
    { shape: { kind: 'ellipsoid', c: p(0.046, -0.005, -0.07), r: r(0.03, 0.022, 0.025) }, bone: 'head', color: skin, blend: 0.035 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.046, -0.005, -0.07), r: r(0.03, 0.022, 0.025) }, bone: 'head', color: skin, blend: 0.035 * s },
    // brow ridge
    { shape: { kind: 'ellipsoid', c: p(0, 0.04, -0.086), r: r(0.074, 0.018, 0.026) }, bone: 'head', color: skin, blend: 0.02 * s },
    // nose
    { shape: { kind: 'cone', a: p(0, 0.03, -0.1), b: p(0, -0.022, -0.117), ra: 0.008 * s, rb: 0.014 * s }, bone: 'head', color: skin, blend: 0.016 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.027, -0.108), r: r(0.019, 0.01, 0.012) }, bone: 'head', color: skin, blend: 0.014 * s },
    // lips
    { shape: { kind: 'ellipsoid', c: p(0, -0.058, -0.1), r: r(0.026, 0.0075, 0.012) }, bone: 'head', color: lip, blend: 0.006 * s },
    { shape: { kind: 'ellipsoid', c: p(0, -0.071, -0.096), r: r(0.022, 0.008, 0.012) }, bone: 'head', color: lip, blend: 0.006 * s },
    // ears
    { shape: { kind: 'ellipsoid', c: p(0.093, 0.0, 0.01), r: r(0.014, 0.03, 0.02) }, bone: 'head', color: skin, blend: 0.01 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.093, 0.0, 0.01), r: r(0.014, 0.03, 0.02) }, bone: 'head', color: skin, blend: 0.01 * s },
    // eyebrows
    { shape: { kind: 'cone', a: p(0.016, 0.047, -0.103), b: p(0.06, 0.05, -0.088), ra: 0.006 * s, rb: 0.004 * s }, bone: 'head', color: brow, blend: 0.002 },
    { shape: { kind: 'cone', a: p(-0.016, 0.047, -0.103), b: p(-0.06, 0.05, -0.088), ra: 0.006 * s, rb: 0.004 * s }, bone: 'head', color: brow, blend: 0.002 },
    // eye sockets
    { shape: { kind: 'ellipsoid', c: p(0.034, 0.018, -0.104), r: r(0.02, 0.013, 0.014) }, bone: 'head', color: skin, subtract: true, blend: 0.012 * s },
    { shape: { kind: 'ellipsoid', c: p(-0.034, 0.018, -0.104), r: r(0.02, 0.013, 0.014) }, bone: 'head', color: skin, subtract: true, blend: 0.012 * s },
  ];
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
  const C = { skin: 'e2c6b2', lip: 'c08a80', brow: '3a2e3a', hood: '4a3d6e', hoodIn: '2a2240', tunic: '3a4560', belt: '4a2c1c', buckle: 'c9a050', trousers: '2c2a34', boot: '3a2618', glove: '3a2618', scarf: '6a4a8a', cape: '3e3260' };
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
    // hood: a loose shell that falls back onto the shoulders, wide open at the front
    { shape: { kind: 'shell', c: add(H, [0, 0.1, 0.045]), r: [0.15, 0.17, 0.175], thickness: 0.016 }, bone: 'head', color: C.hood, blend: 0.03 },
    { shape: { kind: 'cone', a: add(H, [0, 0.08, 0.13]), b: [0, 1.42, 0.14], ra: 0.1, rb: 0.17 }, bone: 'neck', color: C.hood, blend: 0.06 },
    { shape: { kind: 'cone', a: add(H, [0, 0.2, 0.15]), b: add(H, [0, 0.1, 0.25]), ra: 0.06, rb: 0.015 }, bone: 'head', color: C.hood, blend: 0.05 },
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.06, -0.17]), r: [0.118, 0.155, 0.16] }, bone: 'head', color: C.hoodIn, subtract: true, blend: 0.05 },
    // short dark hair under the hood (cut away over the face before the face is added)
    { shape: { kind: 'shell', c: add(H, [0, 0.12, 0.012]), r: [0.096, 0.105, 0.108], thickness: 0.008 }, bone: 'head', color: C.brow, blend: 0.005 },
    { shape: { kind: 'box', c: add(H, [0, 0.0, -0.1]), h: [0.2, 0.09, 0.08], round: 0 }, bone: 'head', color: C.brow, subtract: true },
    ...face(add(H, [0, 0.085, 0]), 1, C.skin, C.lip, C.brow),
    ...limbs(J, { sleeve: C.tunic, glove: C.glove, trousers: C.trousers, boot: C.boot, armR: 1, legR: 1 }),
  ];
  return {
    name: 'unsung',
    joints: J,
    prims,
    eyes: { l: add(H, [0.034, 0.103, -0.094]), r: add(H, [-0.034, 0.103, -0.094]), radius: 0.0152, iris: '9a7ae0', glow: 0.12 },
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
  const C = { skin: 'eebc9c', lip: 'cc8a7c', brow: '8a3a18', hair: 'b4501e', smock: '5a6a3a', apron: 'b8a68a', sleeve: '7a5a3a', trousers: '4a3a2a', boot: '3a2618', glove: 'e8b898', patch: '8a4a2a' };
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
    { shape: { kind: 'ellipsoid', c: [0, J.neck[1] - 0.02, 0], r: [0.1, 0.03, 0.08] }, bone: 'chest', color: C.apron, blend: 0.02 },
    // hair: cap (cut open over the face), fringe and two braids
    { shape: { kind: 'shell', c: add(H, [0, 0.1, 0.014]), r: [0.102 * hs, 0.112 * hs, 0.114 * hs], thickness: 0.012 }, bone: 'head', color: C.hair, blend: 0.006 },
    { shape: { kind: 'box', c: add(H, [0, 0.03, -0.12]), h: [0.2, 0.08, 0.06], round: 0 }, bone: 'head', color: C.hair, subtract: true },
    ...face(add(H, [0, 0.08, 0]), hs, C.skin, C.lip, C.brow),
    { shape: { kind: 'ellipsoid', c: add(H, [0, 0.19, -0.06]), r: [0.085, 0.03, 0.05] }, bone: 'head', color: C.hair, blend: 0.03 },
    { shape: { kind: 'cone', a: add(H, [0.08, 0.06, 0.04]), b: add(H, [0.1, -0.16, 0.05]), ra: 0.028, rb: 0.018 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'cone', a: add(H, [-0.08, 0.06, 0.04]), b: add(H, [-0.1, -0.16, 0.05]), ra: 0.028, rb: 0.018 }, bone: 'head', color: C.hair, blend: 0.02 },
    { shape: { kind: 'ellipsoid', c: add(H, [0.1, -0.18, 0.05]), r: [0.022, 0.012, 0.022] }, bone: 'head', color: C.patch, blend: 0.004 },
    { shape: { kind: 'ellipsoid', c: add(H, [-0.1, -0.18, 0.05]), r: [0.022, 0.012, 0.022] }, bone: 'head', color: C.patch, blend: 0.004 },
    ...limbs(J, { sleeve: C.sleeve, glove: C.glove, trousers: C.trousers, boot: C.boot, armR: 0.85, legR: 0.85 }),
  ];
  const e = (x: number): Vec3 => add(H, [x * hs, 0.08 + 0.018 * hs, -0.095 * hs]);
  return {
    name: 'tilde',
    joints: J,
    prims,
    eyes: { l: e(0.034), r: e(-0.034), radius: 0.0165, iris: '4a8a5a', glow: 0 },
    bounds: { min: [-0.36, -0.02, -0.24], max: [0.36, 1.62, 0.24] },
  };
}

export { mirror };
