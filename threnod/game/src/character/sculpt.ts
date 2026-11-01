import { figureDistance, shapeDistance, type Prim, type Vec3 } from './sdf';
import { surfaceNets } from './surfaceNets';

/**
 * Turns a character design (soft primitives) into mesh data: positions,
 * normals, triangles, bone weights and colour *slots*. Pure maths without
 * three.js, so it can run in a Web Worker.
 *
 * Colours are stored as up to three slots per vertex with weights; the slots
 * are the prims' colour names (a hex value or a palette key such as "skin").
 * One sculpted shape can therefore be dressed in many different palettes.
 */
export interface SculptJob {
  key: string;
  prims: Prim[];
  bounds: { min: Vec3; max: Vec3 };
  cell: number;
  bones: string[];
}

export interface SculptResult {
  key: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  slotIndex: Uint8Array;
  slotWeight: Float32Array;
  slots: string[];
}

export function sculpt(job: SculptJob): SculptResult {
  const { prims, bounds, cell, bones } = job;
  const solidIdx = prims.map((p, i) => [i, p] as [number, Prim]).filter(([, p]) => !p.subtract);
  const solid = solidIdx.map(([, p]) => p);
  const subtracts = prims.map((p, i) => [i, p] as [number, Prim]).filter(([, p]) => p.subtract);
  const f = (x: number, y: number, z: number) => figureDistance(prims, x, y, z);
  const { positions, indices } = surfaceNets(f, bounds.min, bounds.max, cell);
  const n = positions.length / 3;

  const slots: string[] = [];
  const slotOf = solid.map((p) => {
    let i = slots.indexOf(p.color);
    if (i < 0) i = slots.push(p.color) - 1;
    return i;
  });
  const boneIdx = new Map(bones.map((b, i) => [b, i]));

  const normals = new Float32Array(n * 3);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const slotIndex = new Uint8Array(n * 3);
  const slotWeight = new Float32Array(n * 3);
  const e = 0.0015;
  const d = new Float64Array(solid.length);
  const subDist = new Float64Array(subtracts.length);
  const perSlot = new Float64Array(slots.length);
  const perBone = new Map<string, number>();

  for (let v = 0; v < n; v++) {
    const x = positions[v * 3];
    const y = positions[v * 3 + 1];
    const z = positions[v * 3 + 2];
    // normal from the gradient (tetrahedron sampling: four evaluations)
    const a = f(x + e, y - e, z - e);
    const b = f(x - e, y - e, z + e);
    const c = f(x - e, y + e, z - e);
    const dd = f(x + e, y + e, z + e);
    const gx = a - b - c + dd;
    const gy = -a - b + c + dd;
    const gz = -a + b - c + dd;
    const gl = Math.hypot(gx, gy, gz) || 1;
    normals[v * 3] = gx / gl;
    normals[v * 3 + 1] = gy / gl;
    normals[v * 3 + 2] = gz / gl;

    // distance to each solid part, with the cuts that come after it applied
    for (let k = 0; k < subtracts.length; k++) subDist[k] = shapeDistance(subtracts[k][1].shape, x, y, z);
    let dmin = Infinity;
    for (let i = 0; i < solid.length; i++) {
      let di = shapeDistance(solid[i].shape, x, y, z);
      const idx = solidIdx[i][0];
      for (let k = 0; k < subtracts.length; k++) if (subtracts[k][0] > idx) di = Math.max(di, -subDist[k]);
      d[i] = di;
      if (di < dmin) dmin = di;
    }
    perSlot.fill(0);
    perBone.clear();
    for (let i = 0; i < solid.length; i++) {
      const cw = Math.exp(-(d[i] - dmin) / 0.0014);
      if (cw > 0.01) perSlot[slotOf[i]] += cw;
      const bn = solid[i].bone;
      const prev = perBone.get(bn);
      if (prev === undefined || d[i] < prev) perBone.set(bn, d[i]);
    }
    // the three strongest colour slots
    let total = 0;
    for (let k = 0; k < 3; k++) {
      let best = -1;
      let bw = 0;
      for (let s = 0; s < perSlot.length; s++) if (perSlot[s] > bw) {
        bw = perSlot[s];
        best = s;
      }
      if (best < 0) break;
      slotIndex[v * 3 + k] = best;
      slotWeight[v * 3 + k] = bw;
      total += bw;
      perSlot[best] = 0;
    }
    for (let k = 0; k < 3; k++) slotWeight[v * 3 + k] /= total || 1;

    const ranked = [...perBone.entries()]
      .map(([bn, bd]) => [bn, Math.exp(-(bd - dmin) / 0.018)] as [string, number])
      .sort((p, q) => q[1] - p[1])
      .slice(0, 4);
    const tw = ranked.reduce((s, r) => s + r[1], 0);
    ranked.forEach(([bn, w], k) => {
      skinIndex[v * 4 + k] = boneIdx.get(bn) ?? 0;
      skinWeight[v * 4 + k] = w / tw;
    });
  }

  // make every triangle face outwards
  for (let t = 0; t < indices.length; t += 3) {
    const a = indices[t] * 3;
    const b = indices[t + 1] * 3;
    const c = indices[t + 2] * 3;
    const ux = positions[b] - positions[a];
    const uy = positions[b + 1] - positions[a + 1];
    const uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a];
    const vy = positions[c + 1] - positions[a + 1];
    const vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    if (nx * normals[a] + ny * normals[a + 1] + nz * normals[a + 2] < 0) {
      const s = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = s;
    }
  }
  return { key: job.key, positions, normals, indices, skinIndex, skinWeight, slotIndex, slotWeight, slots };
}
