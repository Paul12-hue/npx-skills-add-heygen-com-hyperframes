/**
 * Signed-distance "sculpting" for characters. A character is described as a set
 * of soft primitives (round cones, ellipsoids, rounded boxes, shells) that are
 * smoothly blended together like clay. Each primitive also carries the bone it
 * belongs to (for skinning) and a material colour.
 */

export type Vec3 = [number, number, number];

export type Shape =
  | { kind: 'cone'; a: Vec3; b: Vec3; ra: number; rb: number }
  | { kind: 'ellipsoid'; c: Vec3; r: Vec3 }
  | { kind: 'box'; c: Vec3; h: Vec3; round: number }
  /** hollow ellipsoid (hoods, hair caps) */
  | { kind: 'shell'; c: Vec3; r: Vec3; thickness: number };

export interface Prim {
  shape: Shape;
  bone: string;
  color: string;
  /** smooth-union radius with what came before (0 = hard) */
  blend?: number;
  /** carve this shape away from everything listed before it (eye sockets, hood opening) */
  subtract?: boolean;
}

const len3 = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z);

export function shapeDistance(s: Shape, x: number, y: number, z: number): number {
  switch (s.kind) {
    case 'cone': {
      // round cone between a and b (radii ra, rb)
      const [ax, ay, az] = s.a;
      const bx = s.b[0] - ax;
      const by = s.b[1] - ay;
      const bz = s.b[2] - az;
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      const l2 = bx * bx + by * by + bz * bz;
      const t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2));
      const r = s.ra + (s.rb - s.ra) * t;
      return len3(px - bx * t, py - by * t, pz - bz * t) - r;
    }
    case 'ellipsoid': {
      const [cx, cy, cz] = s.c;
      const [rx, ry, rz] = s.r;
      const k0 = len3((x - cx) / rx, (y - cy) / ry, (z - cz) / rz);
      const k1 = len3((x - cx) / (rx * rx), (y - cy) / (ry * ry), (z - cz) / (rz * rz));
      return k1 > 0 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    }
    case 'box': {
      const qx = Math.abs(x - s.c[0]) - s.h[0];
      const qy = Math.abs(y - s.c[1]) - s.h[1];
      const qz = Math.abs(z - s.c[2]) - s.h[2];
      return len3(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - s.round;
    }
    case 'shell': {
      const d = shapeDistance({ kind: 'ellipsoid', c: s.c, r: s.r }, x, y, z);
      return Math.abs(d) - s.thickness;
    }
  }
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

/** Distance of the whole figure. */
export function figureDistance(prims: Prim[], x: number, y: number, z: number): number {
  let d = 1e9;
  for (const p of prims) {
    const pd = shapeDistance(p.shape, x, y, z);
    if (p.subtract) d = smax(d, -pd, p.blend ?? 0);
    else d = smin(d, pd, p.blend ?? 0);
  }
  return d;
}
