import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural low-poly props. Every prop is built from a handful of primitive
 * shapes, painted with flat vertex colours and merged into a single geometry,
 * so a whole village costs only a few draw calls.
 */

type Part = { geo: THREE.BufferGeometry; color: string };

function paint(geo: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color('#' + hex);
  const count = g.getAttribute('position').count;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g;
}

function at(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(1, 1, 1),
  );
  return geo.applyMatrix4(m);
}

export function build(parts: Part[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts.map((p) => paint(p.geo, p.color)), false);
  if (!merged) throw new Error('mergeGeometries failed');
  merged.computeVertexNormals();
  return merged;
}

/** Transforms a prop geometry into world space (for merging many props). */
export function place(geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0, scale = 1): THREE.BufferGeometry {
  const g = geo.clone();
  g.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(scale, scale, scale),
    ),
  );
  return g;
}

export function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(geos, false);
  if (!m) throw new Error('mergeGeometries failed');
  return m;
}

// ------------------------------------------------------------------ nature
export function pineGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.CylinderGeometry(0.18, 0.28, 2, 5), 0, 1, 0), color: '4a3220' },
    { geo: at(new THREE.ConeGeometry(1.9, 2.8, 6), 0, 2.6, 0), color: '27301a' },
    { geo: at(new THREE.ConeGeometry(1.45, 2.4, 6), 0, 3.9, 0, 0.5), color: '3f4a27' },
    { geo: at(new THREE.ConeGeometry(0.95, 2.0, 6), 0, 5.1, 0), color: '3f4a27' },
  ]);
}

export function deadTreeGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.CylinderGeometry(0.15, 0.3, 3.6, 5), 0, 1.8, 0), color: '403d47' },
    { geo: at(new THREE.CylinderGeometry(0.06, 0.12, 1.6, 4), 0.5, 3.1, 0, 0, 0, -0.8), color: '403d47' },
    { geo: at(new THREE.CylinderGeometry(0.05, 0.1, 1.3, 4), -0.45, 2.6, 0.1, 0, 0.3, 0.9), color: '403d47' },
  ]);
}

export function rockGeometry(): THREE.BufferGeometry {
  return build([{ geo: at(new THREE.DodecahedronGeometry(1, 0), 0, 0.3, 0), color: '7c7883' }]);
}

// ------------------------------------------------------------------ village
export function cottageGeometry(): THREE.BufferGeometry {
  const roof = new THREE.CylinderGeometry(3.4, 3.4, 7.2, 3, 1);
  roof.rotateZ(Math.PI / 2);
  roof.rotateX(Math.PI / 6);
  roof.scale(1, 0.75, 1);
  return build([
    { geo: at(new THREE.BoxGeometry(6.6, 0.6, 5.2), 0, 0.3, 0), color: '5f5b66' }, // stone base
    { geo: at(new THREE.BoxGeometry(6.4, 3, 5), 0, 2.1, 0), color: 'c8aa78' }, // plaster walls
    { geo: at(new THREE.BoxGeometry(6.5, 0.25, 5.1), 0, 3.5, 0), color: '4a3220' }, // timber beam
    { geo: at(new THREE.BoxGeometry(0.25, 3, 0.25), 3.1, 2.1, 2.45), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.25, 3, 0.25), -3.1, 2.1, 2.45), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.25, 3, 0.25), 0, 2.1, 2.45), color: '4a3220' },
    { geo: at(roof, 0, 4.9, 0), color: '5a2a14' }, // roof
    { geo: at(new THREE.BoxGeometry(0.9, 2.6, 0.9), 2, 5.6, -1), color: '5f5b66' }, // chimney
    { geo: at(new THREE.BoxGeometry(1.1, 2, 0.15), -1.5, 1.6, 2.55), color: '2a160b' }, // door
  ]);
}

/** Glowing windows are a separate (emissive) mesh so they can brighten at night. */
export function cottageWindowsGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.9, 0.8, 0.1), 1.4, 2.3, 2.56), color: 'f5c060' },
    { geo: at(new THREE.BoxGeometry(0.1, 0.8, 0.9), 3.26, 2.3, 0), color: 'f5c060' },
    { geo: at(new THREE.BoxGeometry(0.1, 0.8, 0.9), -3.26, 2.3, -0.8), color: 'e0902c' },
  ]);
}

export function chapelGeometry(): THREE.BufferGeometry {
  const roof = new THREE.CylinderGeometry(3, 3, 9, 3, 1);
  roof.rotateZ(Math.PI / 2);
  roof.rotateX(Math.PI / 6);
  roof.scale(1, 0.9, 1);
  return build([
    { geo: at(new THREE.BoxGeometry(9, 4.5, 5.4), 0, 2.25, 0), color: '7c7883' },
    { geo: at(roof, 0, 5.6, 0), color: '403d47' },
    { geo: at(new THREE.BoxGeometry(2.6, 8, 2.6), -4.6, 4, 0), color: '7c7883' }, // tower
    { geo: at(new THREE.ConeGeometry(2.1, 3.6, 4), -4.6, 9.8, 0, Math.PI / 4), color: '403d47' },
    { geo: at(new THREE.BoxGeometry(1.4, 2.6, 0.2), 4.55, 1.3, 0, Math.PI / 2), color: '2a160b' },
  ]);
}

export function chapelWindowsGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.6, 1.6, 0.1), -1.5, 2.6, 2.75), color: 'a596c4' },
    { geo: at(new THREE.BoxGeometry(0.6, 1.6, 0.1), 1.5, 2.6, 2.75), color: 'a596c4' },
    { geo: at(new THREE.BoxGeometry(0.8, 0.8, 0.1), -4.6, 6.6, 1.35), color: 'f5c060' },
  ]);
}

export function bellTowerGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.4, 7, 0.4), -1.1, 3.5, -1.1), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.4, 7, 0.4), 1.1, 3.5, -1.1), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.4, 7, 0.4), -1.1, 3.5, 1.1), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.4, 7, 0.4), 1.1, 3.5, 1.1), color: '4a3220' },
    { geo: at(new THREE.ConeGeometry(2.2, 2.2, 4), 0, 8.1, 0, Math.PI / 4), color: '5a2a14' },
    { geo: at(new THREE.CylinderGeometry(0.35, 0.8, 1.1, 7), 0, 6.2, 0), color: 'a8541c' }, // the bell
  ]);
}

export function wellGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.CylinderGeometry(1.2, 1.3, 1, 8), 0, 0.5, 0), color: '7c7883' },
    { geo: at(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 8), 0, 0.9, 0), color: '120a05' },
    { geo: at(new THREE.BoxGeometry(0.2, 2.4, 0.2), -1, 1.6, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.2, 2.4, 0.2), 1, 1.6, 0), color: '4a3220' },
    { geo: at(new THREE.ConeGeometry(1.6, 0.9, 4), 0, 3.1, 0, Math.PI / 4), color: '5a2a14' },
  ]);
}

/** A shrine of name-candles (Candlewick). Flames are separate emissive geometry. */
export function candleShrineGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: at(new THREE.BoxGeometry(2.4, 1, 1.2), 0, 0.5, 0), color: '5f5b66' },
    { geo: at(new THREE.BoxGeometry(2, 1.4, 0.3), 0, 1.6, -0.45), color: '7c7883' },
  ];
  for (let i = 0; i < 9; i++) {
    const x = -0.9 + (i % 5) * 0.45;
    const z = i < 5 ? 0.25 : -0.1;
    parts.push({ geo: at(new THREE.CylinderGeometry(0.07, 0.07, 0.3 + (i % 3) * 0.1, 5), x, 1.15, z), color: 'f2e6c8' });
  }
  return build(parts);
}

export function candleFlamesGeometry(): THREE.BufferGeometry {
  const parts: Part[] = [];
  for (let i = 0; i < 9; i++) {
    if (i === 8) continue; // one candle is never lit
    const x = -0.9 + (i % 5) * 0.45;
    const z = i < 5 ? 0.25 : -0.1;
    const h = 0.3 + (i % 3) * 0.1;
    parts.push({ geo: at(new THREE.OctahedronGeometry(0.07, 0), x, 1.0 + h + 0.12, z), color: 'f5c060' });
  }
  return build(parts);
}

export function signpostGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.22, 2.6, 0.22), 0, 1.3, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(1.6, 0.35, 0.08), 0.6, 2.2, 0, 0.3), color: '8e6e45' },
    { geo: at(new THREE.BoxGeometry(1.4, 0.35, 0.08), -0.5, 1.8, 0, -0.6), color: '8e6e45' },
    { geo: at(new THREE.BoxGeometry(1.2, 0.35, 0.08), 0.3, 1.4, 0, 1.6), color: '8e6e45' },
  ]);
}

export function lanternPostGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.16, 2.6, 0.16), 0, 1.3, 0), color: '2a160b' },
    { geo: at(new THREE.BoxGeometry(0.6, 0.1, 0.1), 0.25, 2.55, 0), color: '2a160b' },
  ]);
}

export function lanternGlowGeometry(): THREE.BufferGeometry {
  return build([{ geo: at(new THREE.BoxGeometry(0.28, 0.36, 0.28), 0.5, 2.3, 0), color: 'f5c060' }]);
}

// ------------------------------------------------------------------ cemetery
export function graveGeometry(variant: number): THREE.BufferGeometry {
  if (variant % 3 === 0) {
    return build([
      { geo: at(new THREE.BoxGeometry(0.16, 1.4, 0.16), 0, 0.7, 0), color: '5f5b66' },
      { geo: at(new THREE.BoxGeometry(0.8, 0.16, 0.16), 0, 1.05, 0), color: '5f5b66' },
    ]);
  }
  return build([
    { geo: at(new THREE.BoxGeometry(0.8, 1.0 + (variant % 2) * 0.3, 0.18), 0, 0.5, 0, 0, 0, (variant % 5) * 0.04 - 0.08), color: '7c7883' },
    { geo: at(new THREE.CylinderGeometry(0.4, 0.4, 0.18, 6, 1, false, 0, Math.PI), 0, 1.0 + (variant % 2) * 0.3, 0, 0, Math.PI / 2), color: '7c7883' },
    { geo: at(new THREE.BoxGeometry(0.9, 0.12, 1.9), 0, 0.06, 1), color: '5d6b3a' },
  ]);
}

/** The opened, unmarked grave the Unsung climbs out of. */
export function openGraveGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(1.3, 0.05, 2.3), 0, 0.03, 0), color: '120a05' }, // the hole
    { geo: at(new THREE.BoxGeometry(0.4, 0.5, 2.6), 0.95, 0.2, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.4, 0.5, 2.6), -0.95, 0.2, 0), color: '4a3220' },
    { geo: at(new THREE.DodecahedronGeometry(0.9, 0), 1.8, 0.2, 0.6), color: '6a4e30' }, // dirt mound
    { geo: at(new THREE.BoxGeometry(0.9, 1.2, 0.2), 0, 0.6, -1.4, 0, 0, 0.12), color: '9a96a0' }, // headstone
    { geo: at(new THREE.BoxGeometry(0.08, 1.1, 0.08), 2.1, 0.7, -0.4, 0, 0, 0.5), color: '4a3220' }, // shovel
  ]);
}

export function mineEntranceGeometry(): THREE.BufferGeometry {
  return build([
    { geo: at(new THREE.BoxGeometry(0.5, 4, 0.5), -2, 2, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(0.5, 4, 0.5), 2, 2, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(5, 0.6, 0.6), 0, 4.1, 0), color: '4a3220' },
    { geo: at(new THREE.BoxGeometry(3.6, 3.8, 0.2), 0, 1.9, -0.4), color: '120a05' },
    { geo: at(new THREE.DodecahedronGeometry(3, 0), -3.6, 1.5, -1.5), color: '5f5b66' },
    { geo: at(new THREE.DodecahedronGeometry(3.2, 0), 3.8, 1.6, -1.6), color: '5f5b66' },
    { geo: at(new THREE.DodecahedronGeometry(3.4, 0), 0, 5.4, -2.4), color: '7c7883' },
  ]);
}
