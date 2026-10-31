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
  lakebed: C('45605f'),
  shore: C('8e6e45'),
  path: C('6a4e30'),
  pathLight: C('8e6e45'),
  grass: [C('5d6b3a'), C('3f4a27'), C('7f8c4a'), C('4f5c31')],
  rock: [C('7c7883'), C('5f5b66')],
  hill: C('3f4a27'),
};

export class Terrain {
  readonly mesh: THREE.Mesh;
  private heights: Float32Array;
  private n: number;
  private cell: number;
  private half: number;

  constructor() {
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
    this.mesh = new THREE.Mesh(this.buildGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    this.mesh.name = 'terrain';
  }

  private vertex(i: number, j: number): THREE.Vector3 {
    return new THREE.Vector3(i * this.cell - this.half, this.heights[j * this.n + i], j * this.cell - this.half);
  }

  /** Non-indexed geometry with one flat colour per triangle (PS1-style facets). */
  private buildGeometry(): THREE.BufferGeometry {
    const seg = this.n - 1;
    const pos = new Float32Array(seg * seg * 6 * 3);
    const col = new Float32Array(seg * seg * 6 * 3);
    let k = 0;
    const tmp = new THREE.Color();
    const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
      this.faceColor(a, b, c, tmp);
      for (const v of [a, b, c]) {
        pos[k] = v.x; pos[k + 1] = v.y; pos[k + 2] = v.z;
        col[k] = tmp.r; col[k + 1] = tmp.g; col[k + 2] = tmp.b;
        k += 3;
      }
    };
    for (let j = 0; j < seg; j++) {
      for (let i = 0; i < seg; i++) {
        const a = this.vertex(i, j);
        const b = this.vertex(i, j + 1);
        const c = this.vertex(i + 1, j + 1);
        const d = this.vertex(i + 1, j);
        pushTri(a, b, d);
        pushTri(b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  private faceColor(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Color): void {
    const cx = (a.x + b.x + c.x) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    const cy = (a.y + b.y + c.y) / 3;
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    const slope = 1 - Math.abs(n.y);
    const v = fbm(cx * 0.08, cz * 0.08, 2, 3);
    if (cy < -0.4) out.copy(COLORS.lakebed);
    else if (cy < 0.5) out.copy(COLORS.shore);
    else if (distToPath(cx, cz) < 1.8 + v) out.copy(v > 0.55 ? COLORS.pathLight : COLORS.path);
    else if (slope > 0.42) out.copy(COLORS.rock[v > 0.5 ? 0 : 1]);
    else if (cy > 14) out.copy(v > 0.5 ? COLORS.hill : COLORS.rock[1]);
    else out.copy(COLORS.grass[Math.min(3, Math.floor(v * 4.2))]);
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
