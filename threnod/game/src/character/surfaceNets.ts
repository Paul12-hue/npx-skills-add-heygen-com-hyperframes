/**
 * Naive Surface Nets: turns a signed distance field into a smooth triangle mesh.
 * One vertex per grid cell that the surface passes through (placed at the
 * average of the edge crossings), one quad per grid edge with a sign change.
 */

export interface SdfMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export function surfaceNets(
  f: (x: number, y: number, z: number) => number,
  min: [number, number, number],
  max: [number, number, number],
  cell: number,
): SdfMesh {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const field = new Float32Array(nx * ny * nz);
  const idx = (i: number, j: number, k: number) => i + nx * (j + ny * k);

  // Two-level evaluation: sample a coarse grid first and only evaluate the exact
  // distance near the surface. Far away the coarse value is good enough for the sign.
  const S = 4;
  const cx = Math.ceil((nx - 1) / S) + 1;
  const cy = Math.ceil((ny - 1) / S) + 1;
  const cz = Math.ceil((nz - 1) / S) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  const cid = (i: number, j: number, k: number) => i + cx * (j + cy * k);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    coarse[cid(i, j, k)] = f(min[0] + i * S * cell, min[1] + j * S * cell, min[2] + k * S * cell);
  }
  const far = S * cell * 1.8;
  for (let k = 0; k < nz; k++) {
    const z = min[2] + k * cell;
    const ck = Math.min(cz - 1, Math.round(k / S));
    for (let j = 0; j < ny; j++) {
      const y = min[1] + j * cell;
      const cj = Math.min(cy - 1, Math.round(j / S));
      for (let i = 0; i < nx; i++) {
        const c = coarse[cid(Math.min(cx - 1, Math.round(i / S)), cj, ck)];
        field[idx(i, j, k)] = Math.abs(c) > far ? c : f(min[0] + i * cell, y, z);
      }
    }
  }

  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos: number[] = [];
  const corners = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          v[c] = field[idx(i + corners[c][0], j + corners[c][1], k + corners[c][2])];
          if (v[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (const [a, b] of edges) {
          if (v[a] < 0 === v[b] < 0) continue;
          const t = v[a] / (v[a] - v[b]);
          sx += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          sy += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          sz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + sx / n) * cell, min[1] + (j + sy / n) * cell, min[2] + (k + sz / n) * cell);
      }
    }
  }

  const tris: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) tris.push(a, c, b, a, d, c);
    else tris.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const inside = field[idx(i, j, k)] < 0;
        // edge along x from (i,j,k)
        if (i < nx - 1 && inside !== field[idx(i + 1, j, k)] < 0) {
          quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], inside);
        }
        // edge along y
        if (j < ny - 1 && inside !== field[idx(i, j + 1, k)] < 0) {
          quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], inside);
        }
        // edge along z
        if (k < nz - 1 && inside !== field[idx(i, j, k + 1)] < 0) {
          quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], inside);
        }
      }
    }
  }
  return { positions: new Float32Array(pos), indices: new Uint32Array(tris) };
}
