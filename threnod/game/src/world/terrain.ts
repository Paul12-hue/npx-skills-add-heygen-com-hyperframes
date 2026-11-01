import * as THREE from 'three';
import { fbm } from './noise';

/** Layout of Hollowmere Vale (world units ≈ metres). */
export const LAYOUT = {
  size: 440,
  segments: 200,
  waterLevel: 0,
  lake: { x: 0, z: 6, radius: 27 },
  village: { x: 54, z: 0, radius: 24, height: 2.2 },
  cemetery: { x: -44, z: -40, radius: 16, height: 3.4 },
  mine: { x: 36, z: 58 },
  farm: { x: 98, z: 44, radius: 26, height: 3.0 },
  windmill: { x: 122, z: 70 },
  stones: { x: -112, z: -64, radius: 12, height: 9 },
  ruin: { x: -18, z: -142, radius: 10, height: 7 },
  camp: { x: 132, z: -30 },
  /** Old roads as polylines (x, z). */
  paths: [
    [[-44, -40], [-24, -32], [0, -30], [26, -18], [54, 0]],
    [[54, 0], [46, 26], [36, 52]],
    [[-24, -32], [-46, -6], [-40, 20], [-52, 60]],
    [[54, 0], [90, 30], [118, 62]],
    [[54, 0], [96, -8], [128, -26]],
    [[-46, -6], [-84, -36], [-106, -58]],
    [[-24, -32], [-30, -90], [-20, -134]],
  ] as [number, number][][],
  /** Rivers as polylines: one flows into the lake, one out of it to the west. */
  rivers: [
    [[176, -160], [124, -108], [76, -72], [40, -46], [14, -24], [4, -12]],
    [[-24, 10], [-60, 20], [-110, 8], [-160, 28], [-215, 20]],
  ] as [number, number][][],
  riverWidth: 4.2,
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

/** Distance from a point to the nearest river centre line. */
export function distToRiver(x: number, z: number): number {
  let best = Infinity;
  for (const p of LAYOUT.rivers) {
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
  // gentle rolling meadows with a few broad hills
  let h = 1.2 + fbm(x * 0.02, z * 0.02, 4, 11) * 3.2 + Math.max(0, fbm(x * 0.007, z * 0.007, 3, 21) - 0.45) * 22;
  // valley walls – the vale is enclosed by hills
  const r = Math.hypot(x, z);
  h += smoothstep(150, 214, r) * (26 + fbm(x * 0.02, z * 0.02, 3, 5) * 18);
  // flattened ground for the settlements, raised hill tops for the old sites
  for (const s of [LAYOUT.village, LAYOUT.cemetery, LAYOUT.farm, LAYOUT.stones, LAYOUT.ruin]) {
    const d = Math.hypot(x - s.x, z - s.z);
    h = lerp(s.height, h, smoothstep(s.radius * 0.6, s.radius * 1.5, d));
  }
  // roads are smoother
  const pd = distToPath(x, z);
  if (pd < 4) h = lerp(1.2 + fbm(x * 0.02, z * 0.02, 2, 11) * 3.2, h, smoothstep(1, 4, pd) * 0.6 + 0.4);
  // the lake basin and the river channels
  const lf = lakeFactor(x, z);
  if (lf < 1.4) h = lerp(-3.2, h, smoothstep(0.55, 1.35, lf));
  const rd = distToRiver(x, z);
  const w = LAYOUT.riverWidth;
  if (rd < w * 2.2) h = lerp(-2.0, Math.min(h, 1.4 + (rd - w) * 0.6), smoothstep(w * 0.55, w * 1.5, rd));
  return h;
}

const C = (hex: string) => new THREE.Color('#' + hex);
const COLORS = {
  lakebed: C('0c1a2a'),
  shore: C('5a4a48'),
  earth: C('6a5a50'),
  grass: [C('3a7a46'), C('44884e'), C('34703e'), C('4e9454')],
  moss: C('5a8a3a'),
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
    else if (distToPath(x, z) < 3.2 && distToRiver(x, z) > LAYOUT.riverWidth) out.copy(COLORS.earth);
    else if (slope > 0.75) out.copy(COLORS.rock[v > 0.5 ? 0 : 1]);
    else {
      out.copy(COLORS.grass[Math.min(3, Math.floor(v * 4.2))]);
      if (fbm(x * 0.15, z * 0.15, 2, 9) > 0.66) out.lerp(COLORS.moss, 0.6);
    }
  }

  /** The height grid as a float texture (for shaders that need the ground height). */
  heightTexture(): { texture: THREE.DataTexture; origin: number; cell: number; n: number } {
    const tex = new THREE.DataTexture(this.heights, this.n, this.n, THREE.RedFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return { texture: tex, origin: -this.half, cell: this.cell, n: this.n };
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
