import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

export type Quality = 'low' | 'medium' | 'high';

export interface RenderOptions {
  quality: Quality;
  bloom: boolean;
  grain: boolean;
  /** Old-game look: low resolution with hard pixels, colour steps + dithering, scanlines. */
  retro: boolean;
}

/**
 * Per quality level: the internal picture height in retro mode (it is scaled up with
 * hard pixels, like the 270p pass of the dark-fantasy videos), the pixel ratio in
 * smooth mode, and shadows.
 */
export const QUALITY: Record<Quality, { retroHeight: number; pixelRatio: number; shadows: boolean; shadowSize: number }> = {
  low: { retroHeight: 240, pixelRatio: 0.6, shadows: false, shadowSize: 512 },
  medium: { retroHeight: 300, pixelRatio: 0.85, shadows: true, shadowSize: 1024 },
  high: { retroHeight: 380, pixelRatio: 1.25, shadows: true, shadowSize: 2048 },
};

/**
 * Final colour grade in the style of the CD-ROM era renders: punchy saturation,
 * deep violet shadows, a vignette and a hint of film grain.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 1 },
    uSaturation: { value: 1.28 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uRetro: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uSaturation;
    uniform vec2 uResolution;
    uniform float uRetro;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer4(vec2 p) {
      vec2 q = mod(floor(p), 4.0);
      float i = q.x + q.y * 4.0;
      // 4x4 Bayer matrix as a lookup by index
      float m = 0.0;
      if (i < 0.5) m = 0.0; else if (i < 1.5) m = 8.0; else if (i < 2.5) m = 2.0; else if (i < 3.5) m = 10.0;
      else if (i < 4.5) m = 12.0; else if (i < 5.5) m = 4.0; else if (i < 6.5) m = 14.0; else if (i < 7.5) m = 6.0;
      else if (i < 8.5) m = 3.0; else if (i < 9.5) m = 11.0; else if (i < 10.5) m = 1.0; else if (i < 11.5) m = 9.0;
      else if (i < 12.5) m = 15.0; else if (i < 13.5) m = 7.0; else if (i < 14.5) m = 13.0; else m = 5.0;
      return m / 16.0 - 0.5;
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uRetro > 0.5) {
        // slight horizontal colour bleed, like an old video signal
        vec3 left = texture2D(tDiffuse, vUv - vec2(1.0 / uResolution.x, 0.0)).rgb;
        float y0 = dot(c, vec3(0.299, 0.587, 0.114));
        vec3 chroma = mix(c - y0, left - dot(left, vec3(0.299, 0.587, 0.114)), 0.45);
        c = y0 + chroma;
      }
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      // tint the shadows violet, keep highlights warm
      c += vec3(0.02, 0.0, 0.045) * (1.0 - smoothstep(0.0, 0.35, l));
      c = (c - 0.5) * 1.08 + 0.5;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 1.15;
      c += (hash(vUv * uResolution + uTime) - 0.5) * 0.045 * uGrain;
      if (uRetro > 0.5) {
        // 18 colour steps per channel with ordered dithering, and faint scanlines
        vec2 px = vUv * uResolution;
        c = floor(clamp(c, 0.0, 1.0) * 17.0 + 0.5 + bayer4(px)) / 17.0;
        c *= 0.92 + 0.08 * step(0.5, fract(px.y * 0.5));
      }
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/**
 * WebGL renderer with ACES tone mapping, bloom (the glow of lanterns, windows,
 * eyes and crystals) and the colour grade above.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private grade: ShaderPass;
  private opts: RenderOptions;
  width = 1;
  height = 1;

  constructor(canvas: HTMLCanvasElement, scene: THREE.Scene, camera: THREE.Camera, opts: RenderOptions) {
    this.opts = { ...opts };
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.composer = new EffectComposer(this.renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.45, 0.92);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.composer.addPass(this.grade);
    this.setOptions(opts);
  }

  get shadowsEnabled(): boolean {
    return QUALITY[this.opts.quality].shadows;
  }

  get shadowSize(): number {
    return QUALITY[this.opts.quality].shadowSize;
  }

  setOptions(opts: Partial<RenderOptions>): void {
    Object.assign(this.opts, opts);
    this.bloom.enabled = this.opts.bloom;
    this.grade.uniforms.uGrain.value = this.opts.grain ? 1 : 0;
    this.grade.uniforms.uRetro.value = this.opts.retro ? 1 : 0;
    this.renderer.domElement.classList.toggle('retro', this.opts.retro);
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(w: number, h: number): void {
    const q = QUALITY[this.opts.quality];
    const ratio = this.opts.retro ? q.retroHeight / Math.max(1, h) : Math.min(q.pixelRatio, window.devicePixelRatio || 1);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.width = Math.round(w * ratio);
    this.height = Math.round(h * ratio);
    this.grade.uniforms.uResolution.value.set(this.width, this.height);
  }

  render(dt: number): void {
    this.grade.uniforms.uTime.value = (this.grade.uniforms.uTime.value + dt) % 100;
    this.composer.render(dt);
  }
}
