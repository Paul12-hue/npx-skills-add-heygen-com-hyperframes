import * as THREE from 'three';
import { fbm } from './noise';

/** Layout of the test slice of Hollowmere Vale (world units ≈ metres). */
export const LAYOUT = {
  size: 240,
  segments: 120,
  waterLevel: 0,
  lake: { x: 0, z: 6, radius: 27 },
  village: { x: 54, z: 0, radius: 22, height: 2.2 },
  cemetery: { x: -44, z: -40, radius: 16, height: 3.4 },
  mine: { x: 36, z: 58 },
  /** Old roads as polylines (x, z). */
  paths: [
    [[-44, -40], [-24, -32], [0, -30], [26, -18], [54, 0]],
    [[54, 0], [46, 26], [36, 52]],
    [[-24, -32], [-46, -6], [-40, 20]],
  ] as [number, number][][],
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

/** Distance from a point to the nearest old road. */
export function distToPath(x: number, z: number): number {
  let best = Infinity;
  for (const p of LAYOUT.paths) {
    for (let i = 0; i < p.length - 1; i++) {
      best = Math.min(best, distToSegment(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    }
  }
  return best;
}

/** Normalised distance to the lake shore: < 1 inside the lake. */
export function lakeFactor(x: number, z: number): number {
  const { lake } = LAYOUT;
  const a = Math.atan2(z - lake.z, x - lake.x);
  const wobble = 1 + 0.18 * Math.sin(a * 3 + 1.3) + 0.08 * Math.sin(a * 7 + 0.4);
  return Math.hypot(x - lake.x, z - lake.z) / (lake.radius * wobble);
}

/** The analytic height function the terrain mesh is built from. */
export function heightAt(x: number, z: number): number {
  let h = 1.2 + fbm(x * 0.02, z * 0.02, 4, 11) * 3.2;
  // valley walls – the vale is enclosed by hills
  const r = Math.hypot(x, z);
  h += smoothstep(70, 118, r) * (22 + fbm(x * 0.03, z * 0.03, 3, 5) * 16);
  // the lake basin
  const lf = lakeFactor(x, z);
  if (lf < 1.4) h = lerp(-3.2, h, smoothstep(0.55, 1.35, lf));
  // flattened ground for the village and the cemetery
  for (const s of [LAYOUT.village, LAYOUT.cemetery]) {
    const d = Math.hypot(x - s.x, z - s.z);
    h = lerp(s.height, h, smoothstep(s.radius * 0.6, s.radius * 1.4, d));
  }
  // roads are smoother
  const pd = distToPath(x, z);
  if (pd < 4) h = lerp(1.2 + fbm(x * 0.02, z * 0.02, 2, 11) * 3.2, h, smoothstep(1, 4, pd) * 0.6 + 0.4);
  return h;
}

const C = (hex: string) => new THREE.Color('#' + hex);
const COLORS = {
  lakebed: C('0c1a2a'),
  shore: C('5a4a48'),
  earth: C('5a4038'),
  grass: [C('2e6a3e'), C('3a7a44'), C('2a5a3a'), C('4a8a48')],
  moss: C('6a9a3a'),
  rock: [C('7a6a90'), C('5a5070')],
};

export class Terrain {
  readonly mesh: THREE.Mesh;
  private heights: Float32Array;
  private n: number;
  private cell: number;
  private half: number;

  constructor(material?: THREE.Material) {
    const { size, segments } = LAYOUT;
    this.n = segments + 1;
    this.cell = size / segments;
    this.half = size / 2;
    this.heights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        this.heights[j * this.n + i] = heightAt(i * this.cell - this.half, j * this.cell - this.half);
      }
    }
    this.mesh = new THREE.Mesh(this.buildGeometry(), material ?? new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.name = 'terrain';
    this.mesh.receiveShadow = true;
  }

  /** Smooth indexed grid with per-vertex colours and world-space UVs. */
  private buildGeometry(): THREE.BufferGeometry {
    const n = this.n;
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    const tmp = new THREE.Color();
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const x = i * this.cell - this.half;
        const z = j * this.cell - this.half;
        const y = this.heights[k];
        pos.set([x, y, z], k * 3);
        uv.set([x / 6, z / 6], k * 2);
        this.vertexColor(i, j, x, y, z, tmp);
        col.set([tmp.r, tmp.g, tmp.b], k * 3);
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i;
        const b = (j + 1) * n + i;
        const c = (j + 1) * n + i + 1;
        const d = j * n + i + 1;
        idx.push(a, b, d, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  private vertexColor(i: number, j: number, x: number, y: number, z: number, out: THREE.Color): void {
    const h = (ii: number, jj: number) => this.heights[Math.min(this.n - 1, Math.max(0, jj)) * this.n + Math.min(this.n - 1, Math.max(0, ii))];
    const slope = Math.hypot(h(i + 1, j) - h(i - 1, j), h(i, j + 1) - h(i, j - 1)) / (2 * this.cell);
    const v = fbm(x * 0.06, z * 0.06, 3, 3);
    if (y < -0.6) out.copy(COLORS.lakebed);
    else if (y < 0.45) out.copy(COLORS.shore);
    else if (distToPath(x, z) < 3.2) out.copy(COLORS.earth);
    else if (slope > 0.75) out.copy(COLORS.rock[v > 0.5 ? 0 : 1]);
    else {
      out.copy(COLORS.grass[Math.min(3, Math.floor(v * 4.2))]);
      if (fbm(x * 0.15, z * 0.15, 2, 9) > 0.66) out.lerp(COLORS.moss, 0.6);
    }
  }

  /** Height of the rendered surface at (x, z), interpolated exactly like the triangles. */
  getHeight(x: number, z: number): number {
    const fx = (x + this.half) / this.cell;
    const fz = (z + this.half) / this.cell;
    const max = this.n - 1.0001;
    const gx = Math.min(max, Math.max(0, fx));
    const gz = Math.min(max, Math.max(0, fz));
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const u = gx - i;
    const w = gz - j;
    const h = (ii: number, jj: number) => this.heights[jj * this.n + ii];
    // triangle split matches buildGeometry: (a=i,j  b=i,j+1  d=i+1,j) and (b, c=i+1,j+1, d)
    if (u + w <= 1) {
      return h(i, j) + (h(i + 1, j) - h(i, j)) * u + (h(i, j + 1) - h(i, j)) * w;
    }
    return h(i + 1, j + 1) + (h(i, j + 1) - h(i + 1, j + 1)) * (1 - u) + (h(i + 1, j) - h(i + 1, j + 1)) * (1 - w);
  }
}
