import * as THREE from 'three';
import { fbm, rng, valueNoise } from '../world/noise';

/**
 * Procedural textures in the style of 90s pre-rendered CGI: every surface gets a
 * grey detail map (tinted by vertex colours) and a matching bump map, so lights
 * catch the relief and glossy materials shine like early ray-traced renders.
 * Generated once at start-up on a canvas – no image files to download.
 */

export interface TexPair {
  map: THREE.Texture;
  bump: THREE.Texture;
}

const SIZE = 128;

function canvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

function toTexture(c: HTMLCanvasElement, color: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // hard texels like an old game: no smoothing when magnified
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Fill a canvas pixel by pixel. fn returns [luminance 0..1, bump 0..1]. */
function paint(fn: (u: number, v: number) => [number, number]): TexPair {
  const [cm, xm] = canvas();
  const [cb, xb] = canvas();
  const im = xm.createImageData(SIZE, SIZE);
  const ib = xb.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [l, b] = fn(x / SIZE, y / SIZE);
      const i = (y * SIZE + x) * 4;
      const lv = Math.max(0, Math.min(255, l * 255));
      const bv = Math.max(0, Math.min(255, b * 255));
      im.data[i] = im.data[i + 1] = im.data[i + 2] = lv;
      ib.data[i] = ib.data[i + 1] = ib.data[i + 2] = bv;
      im.data[i + 3] = ib.data[i + 3] = 255;
    }
  }
  xm.putImageData(im, 0, 0);
  xb.putImageData(ib, 0, 0);
  return { map: toTexture(cm, true), bump: toTexture(cb, false) };
}

/** Tileable fbm: blends four shifted samples so edges match. */
function tfbm(u: number, v: number, scale: number, oct: number, seed: number): number {
  const s = (a: number, b: number) => fbm(a * scale, b * scale, oct, seed);
  const a = s(u, v);
  const b = s(u - 1, v);
  const c = s(u, v - 1);
  const d = s(u - 1, v - 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** Wet cobblestones: rounded stones with dark gaps. */
export function cobbleTexture(): TexPair {
  const cells = 6;
  const r = rng(77);
  const pts: [number, number][] = [];
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + r() * 0.6) / cells, (j + 0.2 + r() * 0.6) / cells]);
  return paint((u, v) => {
    let d1 = 9;
    let d2 = 9;
    let id = 0;
    for (let k = 0; k < pts.length; k++) {
      for (const ox of [-1, 0, 1]) {
        for (const oy of [-1, 0, 1]) {
          const dx = u - (pts[k][0] + ox);
          const dy = v - (pts[k][1] + oy);
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = k;
          } else if (d < d2) d2 = d;
        }
      }
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1);
    const dome = Math.min(1, edge * 14);
    const n = tfbm(u, v, 18, 3, 3);
    const tone = 0.55 + ((id * 37) % 10) / 30;
    return [edge < 0.02 ? 0.12 : tone * (0.75 + n * 0.4), Math.sqrt(dome) * 0.85 + n * 0.15];
  });
}

/** Rough cut stone with cracks (walls, graves, chapel, rocks). */
export function stoneTexture(): TexPair {
  return paint((u, v) => {
    const n = tfbm(u, v, 8, 5, 11);
    const crack = Math.abs(tfbm(u, v, 3, 3, 5) - 0.5) < 0.012 ? 1 : 0;
    const blocks = (Math.abs(((v * 4) % 1) - 0.5) > 0.47 ? 1 : 0) || (Math.abs((((u * 3 + Math.floor(v * 4) * 0.5) % 1)) - 0.5) > 0.48 ? 1 : 0);
    const l = 0.55 + n * 0.5 - crack * 0.35 - blocks * 0.3;
    return [l, n * 0.8 + 0.2 - blocks * 0.5 - crack * 0.4];
  });
}

/** Wooden planks with grain (timber, doors, boats, signposts). */
export function woodTexture(): TexPair {
  return paint((u, v) => {
    const plank = Math.floor(u * 5);
    const gap = ((u * 5) % 1) < 0.05 ? 1 : 0;
    const grain = Math.sin((v * 40 + valueNoise(u * 30, v * 4, plank) * 6) * 1.0) * 0.5 + 0.5;
    const n = tfbm(u, v, 10, 3, 2 + plank);
    return [0.5 + grain * 0.25 + n * 0.2 - gap * 0.35, grain * 0.4 + n * 0.4 + 0.2 - gap * 0.6];
  });
}

/** Overlapping roof shingles. */
export function shingleTexture(): TexPair {
  return paint((u, v) => {
    const rows = 8;
    const row = Math.floor(v * rows);
    const fu = (u * 6 + (row % 2) * 0.5) % 1;
    const fv = (v * rows) % 1;
    const curve = 1 - Math.abs(fu - 0.5) * 2;
    const edge = fv > 0.85 + curve * 0.08 ? 1 : 0;
    const n = tfbm(u, v, 14, 3, 21);
    const tone = 0.6 + (((row * 13 + Math.floor(u * 6)) % 7) / 7) * 0.25;
    return [tone * (0.8 + n * 0.3) - edge * 0.4, fv * 0.7 + n * 0.3 - edge * 0.6];
  });
}

/** Lumpy plaster between the timber frames. */
export function plasterTexture(): TexPair {
  return paint((u, v) => {
    const n = tfbm(u, v, 6, 5, 31);
    const stain = tfbm(u, v, 2, 3, 8);
    return [0.75 + n * 0.25 - stain * 0.25, n];
  });
}

/** Bark / pine needles / moss – organic noise. */
export function organicTexture(): TexPair {
  return paint((u, v) => {
    const streak = tfbm(u * 0.3, v * 2.5, 12, 3, 41);
    const n = tfbm(u, v, 20, 3, 42);
    return [0.55 + streak * 0.35 + n * 0.15, streak * 0.6 + n * 0.4];
  });
}

/** Ground: grass tufts, earth and moss for the terrain. */
export function groundTexture(): TexPair {
  return paint((u, v) => {
    const n = tfbm(u, v, 24, 4, 51);
    const big = tfbm(u, v, 4, 3, 52);
    return [0.6 + n * 0.35 + big * 0.15, n * 0.8 + big * 0.2];
  });
}

/** Soft round sprite (fireflies, glows). */
export function glowSprite(): THREE.Texture {
  const [c, x] = canvas();
  const g = x.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, SIZE / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, SIZE, SIZE);
  return toTexture(c, true);
}

/** Soft fog puff for drifting ground mist. */
export function mistSprite(): THREE.Texture {
  const [c, x] = canvas();
  const im = x.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let xx = 0; xx < SIZE; xx++) {
      const dx = xx / SIZE - 0.5;
      const dy = y / SIZE - 0.5;
      const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
      const n = fbm(xx / 40, y / 40, 4, 61);
      const a = fall * fall * (0.4 + n * 0.8);
      const i = (y * SIZE + xx) * 4;
      im.data[i] = im.data[i + 1] = im.data[i + 2] = 255;
      im.data[i + 3] = Math.min(255, a * 255);
    }
  }
  x.putImageData(im, 0, 0);
  return toTexture(c, true);
}

/** The huge orange moon from the reference art. */
export function moonTexture(): THREE.Texture {
  const [c, x] = canvas();
  const im = x.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let xx = 0; xx < SIZE; xx++) {
      const dx = xx / SIZE - 0.5;
      const dy = y / SIZE - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const i = (y * SIZE + xx) * 4;
      if (d > 1) {
        im.data[i + 3] = 0;
        continue;
      }
      const n = fbm(xx / 28, y / 28, 5, 71);
      const crater = fbm(xx / 12, y / 12, 3, 72) > 0.62 ? 0.75 : 1;
      const limb = Math.pow(1 - d * d, 0.25);
      const k = (0.55 + n * 0.6) * crater * limb;
      im.data[i] = Math.min(255, 255 * k * 1.1);
      im.data[i + 1] = Math.min(255, 120 * k);
      im.data[i + 2] = Math.min(255, 30 * k);
      im.data[i + 3] = d > 0.97 ? (1 - d) * 33 * 255 : 255;
    }
  }
  x.putImageData(im, 0, 0);
  return toTexture(c, true);
}

export interface TextureSet {
  cobble: TexPair;
  stone: TexPair;
  wood: TexPair;
  shingle: TexPair;
  plaster: TexPair;
  organic: TexPair;
  ground: TexPair;
}

export function createTextures(): TextureSet {
  return {
    cobble: cobbleTexture(),
    stone: stoneTexture(),
    wood: woodTexture(),
    shingle: shingleTexture(),
    plaster: plasterTexture(),
    organic: organicTexture(),
    ground: groundTexture(),
  };
}
