// Procedural canvas textures — no image files, everything is drawn at startup.

import * as THREE from 'three';

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, g: c.getContext('2d')! };
}

/** Deterministic PRNG so textures look identical on every start. */
export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Polished dark resin floor with large tiles, scuffs and inset guide lines. */
export function floorTextures(size = 1024) {
  const r = rng(7);
  const { c, g } = canvas(size);
  g.fillStyle = '#0d1117';
  g.fillRect(0, 0, size, size);
  // mottled resin
  for (let i = 0; i < 2600; i++) {
    const x = r() * size, y = r() * size, rad = 4 + r() * 40;
    const a = 0.015 + r() * 0.03;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const tone = r() > 0.5 ? '40,52,66' : '6,8,12';
    grd.addColorStop(0, `rgba(${tone},${a})`);
    grd.addColorStop(1, `rgba(${tone},0)`);
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // tile seams (4 tiles per texture)
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= 4; i++) {
    const p = (i * size) / 4;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  g.strokeStyle = 'rgba(120,150,170,0.035)';
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const p = (i * size) / 4 + 2;
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
    g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
  }
  // scratches
  g.strokeStyle = 'rgba(150,170,190,0.035)';
  for (let i = 0; i < 220; i++) {
    const x = r() * size, y = r() * size, a = r() * Math.PI, l = 10 + r() * 60;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;

  // roughness: seams rough, polished areas smooth, smudges
  const { c: rc, g: rg } = canvas(size / 2);
  const s2 = size / 2;
  rg.fillStyle = 'rgb(70,70,70)';
  rg.fillRect(0, 0, s2, s2);
  for (let i = 0; i < 500; i++) {
    const x = r() * s2, y = r() * s2, rad = 8 + r() * 50;
    const v = Math.floor(40 + r() * 110);
    const grd = rg.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, `rgba(${v},${v},${v},0.25)`);
    grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
    rg.fillStyle = grd;
    rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  rg.strokeStyle = 'rgb(150,150,150)';
  rg.lineWidth = 2;
  for (let i = 0; i <= 4; i++) {
    const p = (i * s2) / 4;
    rg.beginPath(); rg.moveTo(p, 0); rg.lineTo(p, s2); rg.stroke();
    rg.beginPath(); rg.moveTo(0, p); rg.lineTo(s2, p); rg.stroke();
  }
  const rough = new THREE.CanvasTexture(rc);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

/** Table top: deep blue with fine grain so specular highlights break up nicely. */
export function tableTexture(size = 512) {
  const r = rng(11);
  const { c, g } = canvas(size);
  g.fillStyle = '#123049';
  g.fillRect(0, 0, size, size);
  const img = g.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 9;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Net mesh: alpha grid. */
export function netTexture() {
  const { c, g } = canvas(256, 64);
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = 'rgba(235,240,245,0.9)';
  g.lineWidth = 1.2;
  for (let x = 0; x <= 256; x += 6.4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 6.4) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(7, 1);
  t.anisotropy = 4;
  return t;
}

/** Ball surface: off-white with the moulded seam and a small printed logo, so spin is readable. */
export function ballTexture() {
  const { c, g } = canvas(512, 256);
  g.fillStyle = '#f4f2ec';
  g.fillRect(0, 0, 512, 256);
  // seam at the equator
  g.fillStyle = 'rgba(160,160,150,0.55)';
  g.fillRect(0, 126, 512, 4);
  // logo on two sides
  for (const cx of [128, 384]) {
    g.save();
    g.translate(cx, 72);
    g.fillStyle = '#ff7a1a';
    g.font = 'bold 44px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('SL', 0, 0);
    g.fillStyle = '#1b2733';
    g.font = 'bold 15px sans-serif';
    g.fillText('★★★  40+', 0, 34);
    g.restore();
  }
  // dark band marks for spin readability on the other hemisphere
  g.fillStyle = 'rgba(20,30,40,0.55)';
  g.fillRect(250, 150, 12, 70);
  g.fillRect(0, 150, 6, 70);
  g.fillRect(506, 150, 6, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Wall panels: brushed dark metal with rivets and engraved panel codes. */
export function panelTexture() {
  const r = rng(23);
  const { c, g } = canvas(512, 1024);
  g.fillStyle = '#151b23';
  g.fillRect(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y += 2) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.012 + r() * 0.02})`;
    g.fillRect(0, y, 512, 1);
  }
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 4;
  g.strokeRect(6, 6, 500, 1012);
  g.strokeStyle = 'rgba(140,170,190,0.08)';
  g.lineWidth = 2;
  g.strokeRect(14, 14, 484, 996);
  g.beginPath(); g.moveTo(14, 640); g.lineTo(498, 640); g.stroke();
  g.fillStyle = 'rgba(160,180,200,0.18)';
  for (const [x, y] of [[30, 30], [482, 30], [30, 994], [482, 994], [30, 620], [482, 620]]) {
    g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = 'rgba(160,190,210,0.22)';
  g.font = '500 22px monospace';
  g.fillText(`SL-${Math.floor(r() * 90 + 10)}/${Math.floor(r() * 9)}`, 40, 690);
  g.fillText('▲ HV', 40, 720);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Soft radial blob used for contact shadows and glows. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const { c, g } = canvas(size);
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  return t;
}

/** Hazard stripe band for obstacle bases. */
export function hazardTexture() {
  const { c, g } = canvas(256, 32);
  g.fillStyle = '#121418';
  g.fillRect(0, 0, 256, 32);
  g.fillStyle = '#ff7a1a';
  for (let x = -32; x < 288; x += 32) {
    g.beginPath(); g.moveTo(x, 32); g.lineTo(x + 16, 32); g.lineTo(x + 32, 0); g.lineTo(x + 16, 0); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
