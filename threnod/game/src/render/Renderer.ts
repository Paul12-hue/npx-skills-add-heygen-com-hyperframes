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
}

/** Pixel ratio and shadow settings per quality level. */
export const QUALITY: Record<Quality, { pixelRatio: number; shadows: boolean; shadowSize: number }> = {
  low: { pixelRatio: 0.6, shadows: false, shadowSize: 512 },
  medium: { pixelRatio: 0.85, shadows: true, shadowSize: 1024 },
  high: { pixelRatio: 1.25, shadows: true, shadowSize: 2048 },
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
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, uSaturation);
      // tint the shadows violet, keep highlights warm
      c += vec3(0.02, 0.0, 0.045) * (1.0 - smoothstep(0.0, 0.35, l));
      c = (c - 0.5) * 1.08 + 0.5;
      vec2 d = vUv - 0.5;
      c *= 1.0 - dot(d, d) * 1.15;
      c += (hash(vUv * uResolution + uTime) - 0.5) * 0.045 * uGrain;
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
    this.renderer.shadowMap.enabled = this.shadowsEnabled;
    this.renderer.shadowMap.needsUpdate = true;
  }

  resize(w: number, h: number): void {
    const ratio = Math.min(QUALITY[this.opts.quality].pixelRatio, (window.devicePixelRatio || 1) * 1.0);
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
