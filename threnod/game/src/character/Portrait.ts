import * as THREE from 'three';
import { Humanoid } from './Humanoid';
import { tildeSpec, unsungSpec, type FigureSpec } from './figures';

/** Who can appear in a dialogue portrait. Keys match the dialogue "speaker" names. */
const SPECS: Record<string, () => FigureSpec> = {
  Unsung: unsungSpec,
  Tilde: tildeSpec,
};

/**
 * Live dialogue portraits rendered from the same 3D characters that walk around
 * in the world – they breathe, blink and glance around while they talk.
 */
export class PortraitRenderer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(24, 1, 0.05, 10);
  private figures = new Map<string, { h: Humanoid; face: THREE.Vector3 }>();
  private current: string | null = null;
  private time = 0;

  constructor(size = 240) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = size;
    this.canvas.className = 'portrait';

    // background: a soft violet vignette like the world at night
    const bg = document.createElement('canvas');
    bg.width = bg.height = 64;
    const x = bg.getContext('2d')!;
    const g = x.createRadialGradient(28, 24, 4, 32, 32, 46);
    g.addColorStop(0, '#5a3a8a');
    g.addColorStop(0.6, '#2a1a4a');
    g.addColorStop(1, '#0c0618');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(bg);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = tex;

    const key = new THREE.DirectionalLight(0xffe0c8, 1.6);
    key.position.set(-1, 1.2, -1.6);
    const rim = new THREE.DirectionalLight(0x9a6aff, 2.4);
    rim.position.set(1.4, 0.8, 1.2);
    const fill = new THREE.HemisphereLight(0xb8b0e0, 0x3a2a30, 1.3);
    this.scene.add(key, rim, fill);
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer) return this.renderer;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: false });
      this.renderer.setPixelRatio(1);
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.05;
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    } catch {
      this.renderer = null; // portraits are optional – dialogue still works without them
    }
    return this.renderer;
  }

  has(name: string): boolean {
    return name in SPECS;
  }

  /** Show a character (or nothing). Characters are built on first use. */
  show(name: string | null): void {
    this.current = name && this.has(name) ? name : null;
    if (!this.current) return;
    if (!this.figures.has(this.current)) {
      const spec = SPECS[this.current]();
      const h = new Humanoid(spec, { cell: 0.0075 }); // finer sculpt for close-ups
      const head = spec.joints.head;
      const face = new THREE.Vector3(head[0], head[1] + 0.07, head[2] - 0.02);
      this.scene.add(h.root);
      this.figures.set(this.current, { h, face });
    }
    for (const [k, f] of this.figures) f.h.root.visible = k === this.current;
    const f = this.figures.get(this.current)!;
    // a slight three-quarter view of the face
    this.camera.position.set(f.face.x - 0.2, f.face.y + 0.03, f.face.z - 0.85);
    this.camera.lookAt(f.face.x, f.face.y - 0.03, f.face.z);
  }

  render(dt: number): void {
    if (!this.current) return;
    const r = this.ensureRenderer();
    if (!r) return;
    this.time += dt;
    this.figures.get(this.current)!.h.animate(dt, 0, this.time);
    r.render(this.scene, this.camera);
  }
}
