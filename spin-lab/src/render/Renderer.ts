// Renderer, post-processing and adaptive quality.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Quality = 'auto' | 'high' | 'medium' | 'low';
type Level = Exclude<Quality, 'auto'>;

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uDim: { value: 0 },
    uAberration: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uDim; uniform float uAberration;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      vec2 off = c * uAberration * 0.012;
      vec4 col = texture2D(tDiffuse, vUv);
      if (uAberration > 0.001) {
        col.r = texture2D(tDiffuse, vUv + off).r;
        col.b = texture2D(tDiffuse, vUv - off).b;
      }
      float v = smoothstep(0.85, 0.2, length(c) * uVignette);
      col.rgb *= mix(0.55, 1.0, v);
      col.rgb *= 1.0 - uDim;
      col.rgb += (hash(vUv * 900.0 + uTime) - 0.5) * 0.018;
      gl_FragColor = col;
    }`,
};

export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private level: Level = 'high';
  private setting: Quality = 'auto';
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lowStreak = 0;
  private dprScale = 1;
  onQualityChange?: (l: Level) => void;

  constructor(container: HTMLElement) {
    const touch = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(0x040609);
    this.scene.fog = new THREE.FogExp2(0x05080d, 0.055);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.03, 60);

    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.38, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());

    this.level = touch ? 'medium' : 'high';
    this.applyLevel();
    this.resize();
  }

  get qualityLevel() { return this.level; }

  setQuality(q: Quality) {
    this.setting = q;
    const touch = matchMedia('(pointer: coarse)').matches;
    this.level = q === 'auto' ? (touch ? 'medium' : 'high') : q;
    this.lowStreak = 0;
    this.applyLevel();
  }

  private applyLevel() {
    const dpr = window.devicePixelRatio || 1;
    const cap = this.level === 'high' ? 2 : this.level === 'medium' ? 1.5 : 1;
    this.dprScale = Math.min(dpr, cap);
    this.renderer.setPixelRatio(this.dprScale);
    this.bloom.enabled = this.level !== 'low';
    this.renderer.shadowMap.enabled = true;
    this.resize();
    this.onQualityChange?.(this.level);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.composer.setPixelRatio(this.dprScale);
    this.composer.setSize(w, h);
    // bloom at reduced resolution is plenty and saves a lot of fill rate
    const bs = this.level === 'high' ? 0.5 : 0.35;
    this.bloom.resolution.set(Math.max(64, w * bs), Math.max(64, h * bs));
    this.camera.aspect = w / h;
    // portrait: widen the field of view so the whole table stays visible
    this.camera.fov = w / h < 0.62 ? 64 : w / h < 1 ? 58 : w / h < 1.4 ? 48 : 42;
    this.camera.updateProjectionMatrix();
  }

  get viewportHeight() { return window.innerHeight * this.dprScale; }

  /** Feed frame times; drops quality when the device struggles (only in auto). */
  track(dt: number) {
    if (this.setting !== 'auto') return;
    this.fpsAcc += dt; this.fpsFrames++;
    if (this.fpsAcc < 2) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0; this.fpsFrames = 0;
    if (fps < 42) this.lowStreak++; else this.lowStreak = 0;
    if (this.lowStreak >= 2 && this.level !== 'low') {
      this.level = this.level === 'high' ? 'medium' : 'low';
      this.lowStreak = 0;
      this.applyLevel();
    }
  }

  render(time: number) {
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render();
  }
}
