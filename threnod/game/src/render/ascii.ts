import * as THREE from 'three';

/**
 * ASCII look: the finished picture is cut into small cells; every cell becomes a
 * text character whose shape follows the brightness of the scene there
 * (dark → " . : ", bright → " o 8 @ ") and whose colour is the scene's colour.
 * The painted scene still shimmers through between the glyphs.
 */

/** From dark to bright. Characters are chosen so the ramp reads evenly. */
export const GLYPH_RAMP = ' .,:;~-=+*oxaO8%#@';

/** Draws the glyph ramp into one row of a texture (white on transparent). */
export function createGlyphAtlas(cell = 48): THREE.Texture {
  const n = GLYPH_RAMP.length;
  const c = document.createElement('canvas');
  c.width = cell * n;
  c.height = cell;
  const x = c.getContext('2d')!;
  x.clearRect(0, 0, c.width, c.height);
  x.fillStyle = '#ffffff';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = `bold ${Math.round(cell * 0.9)}px "Courier New", ui-monospace, Menlo, monospace`;
  for (let i = 0; i < n; i++) x.fillText(GLYPH_RAMP[i], i * cell + cell / 2, cell * 0.54);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

export const AsciiShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tGlyphs: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uCell: { value: new THREE.Vector2(7, 11) },
    uCount: { value: GLYPH_RAMP.length },
    /** how much of the plain scene shows between the glyphs (0 = pure text) */
    uBase: { value: 0.62 },
    uGain: { value: 1.05 },
    uEnabled: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tGlyphs;
    uniform vec2 uResolution;
    uniform vec2 uCell;
    uniform float uCount;
    uniform float uBase;
    uniform float uGain;
    uniform float uEnabled;
    varying vec2 vUv;
    void main() {
      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      if (uEnabled < 0.5) { gl_FragColor = vec4(scene, 1.0); return; }
      vec2 px = vUv * uResolution;
      vec2 cellId = floor(px / uCell);
      vec2 c0 = (cellId + 0.5) * uCell / uResolution;
      vec2 o = uCell / uResolution * 0.25;
      // average colour of the cell (5 taps)
      vec3 col = texture2D(tDiffuse, c0).rgb * 0.4
        + texture2D(tDiffuse, c0 + vec2(o.x, o.y)).rgb * 0.15
        + texture2D(tDiffuse, c0 + vec2(-o.x, o.y)).rgb * 0.15
        + texture2D(tDiffuse, c0 + vec2(o.x, -o.y)).rgb * 0.15
        + texture2D(tDiffuse, c0 + vec2(-o.x, -o.y)).rgb * 0.15;
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      float idx = floor(clamp(pow(lum, 0.6) * 1.35, 0.0, 0.999) * uCount);
      vec2 local = fract(px / uCell);
      local.y = 1.0 - local.y;
      float g = texture2D(tGlyphs, vec2((idx + local.x) / uCount, local.y)).a;
      vec3 bright = col / max(0.25, max(col.r, max(col.g, col.b))) * (0.35 + lum * 1.3);
      // glyphs fade in with brightness: dark areas stay calm, lit areas sparkle with text
      float k = smoothstep(0.04, 0.3, lum);
      vec3 outc = scene * uBase + mix(col, bright, 0.55) * g * uGain * (0.35 + 0.65 * k);
      gl_FragColor = vec4(clamp(outc, 0.0, 1.0), 1.0);
    }`,
};
