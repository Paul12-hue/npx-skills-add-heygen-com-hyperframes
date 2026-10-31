import * as THREE from 'three';
import { PALETTE_SIZE, paletteRgb } from './palette';

export interface RetroOptions {
  /** Internal vertical resolution in pixels (e.g. 360). The canvas is upscaled by CSS. */
  internalHeight: number;
  /** Snap every pixel to the 32-colour palette. */
  palette: boolean;
  /** Ordered (Bayer) dithering before the palette snap. */
  dither: boolean;
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAG = /* glsl */ `
precision mediump float;
uniform sampler2D tScene;
uniform vec3 uPalette[${PALETTE_SIZE}];
uniform float uUsePalette;
uniform float uDither;
varying vec2 vUv;

float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0));
  int y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  // 4x4 Bayer matrix, flattened
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
  m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int k = 0; k < 16; k++) { if (k == i) v = m[k]; }
  return v / 16.0 - 0.5;
}

void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  // the scene target is linear; convert to sRGB for palette matching / display
  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  if (uUsePalette > 0.5) {
    c += bayer4(gl_FragCoord.xy) * uDither * 0.11;
    vec3 best = uPalette[0];
    float bestD = 1e9;
    for (int i = 0; i < ${PALETTE_SIZE}; i++) {
      vec3 d = c - uPalette[i];
      float dd = dot(d, d);
      if (dd < bestD) { bestD = dd; best = uPalette[i]; }
    }
    c = best;
  }
  gl_FragColor = vec4(c, 1.0);
}
`;

/**
 * Renders the scene into a small render target (e.g. 640x360) and then draws it
 * through a palette/dither shader onto a canvas of the same small size. The canvas
 * is stretched to the screen with `image-rendering: pixelated`, which gives the
 * crisp, chunky late-90s look and keeps the GPU cost very low on an iPad.
 */
export class RetroRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private target: THREE.WebGLRenderTarget;
  private postScene = new THREE.Scene();
  private postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;
  private opts: RetroOptions;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement, opts: RetroOptions) {
    this.opts = { ...opts };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    // We do the sRGB conversion ourselves in the post shader.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
    });
    const pal = paletteRgb().map(([r, g, b]) => new THREE.Vector3(r, g, b));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        tScene: { value: this.target.texture },
        uPalette: { value: pal },
        uUsePalette: { value: opts.palette ? 1 : 0 },
        uDither: { value: opts.dither ? 1 : 0 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
  }

  setOptions(opts: Partial<RetroOptions>): void {
    Object.assign(this.opts, opts);
    this.material.uniforms.uUsePalette.value = this.opts.palette ? 1 : 0;
    this.material.uniforms.uDither.value = this.opts.dither ? 1 : 0;
  }

  /** Recompute the internal resolution from the screen aspect ratio. */
  resize(screenW: number, screenH: number): void {
    const aspect = Math.max(0.3, screenW / Math.max(1, screenH));
    this.height = Math.round(this.opts.internalHeight);
    this.width = Math.max(1, Math.round(this.height * aspect));
    this.renderer.setSize(this.width, this.height, false);
    this.target.setSize(this.width, this.height);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCamera);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}
