import * as THREE from 'three';
import { rng } from './noise';
import { glowSprite, moonTexture } from '../render/textures';

/** One keyframe of the day. */
interface SkyKey {
  hour: number;
  top: string;
  horizon: string;
  cloud: string;
  moon: string; // colour of the main directional light
  moonIntensity: number;
  ambient: number;
  night: number; // 0 = "day", 1 = full night (stars, strong glows)
}

// The Long Vesper: even "noon" is a deep, saturated twilight. Nights are violet,
// with a huge orange moon – the look of the reference renders.
const KEYS: SkyKey[] = [
  { hour: 0, top: '0a0420', horizon: '3a1270', cloud: '7a3ad0', moon: 'b0c0ff', moonIntensity: 1.3, ambient: 0.55, night: 1 },
  { hour: 5, top: '120838', horizon: '6a2a90', cloud: 'b05ad0', moon: 'b8b8ff', moonIntensity: 1.2, ambient: 0.6, night: 0.9 },
  { hour: 7, top: '2a2a80', horizon: 'e0704a', cloud: 'ff9a6a', moon: 'ffb080', moonIntensity: 1.6, ambient: 0.75, night: 0.35 },
  { hour: 11, top: '2c3c9a', horizon: '9a7ad0', cloud: 'd8b0ff', moon: 'e8d8ff', moonIntensity: 2.0, ambient: 0.95, night: 0 },
  { hour: 15, top: '2c3c9a', horizon: 'b08ad8', cloud: 'e0b8ff', moon: 'f0d8ff', moonIntensity: 2.0, ambient: 0.95, night: 0 },
  { hour: 18, top: '2a1a70', horizon: 'ff6a3a', cloud: 'ff8a5a', moon: 'ff9a5a', moonIntensity: 1.7, ambient: 0.75, night: 0.35 },
  { hour: 20, top: '140a40', horizon: '7a1a8a', cloud: 'c040c0', moon: 'c0b0ff', moonIntensity: 1.4, ambient: 0.62, night: 0.8 },
  { hour: 24, top: '0a0420', horizon: '3a1270', cloud: '7a3ad0', moon: 'b0c0ff', moonIntensity: 1.3, ambient: 0.55, night: 1 },
];

export interface SkyState {
  top: THREE.Color;
  horizon: THREE.Color;
  cloud: THREE.Color;
  moon: THREE.Color;
  moonIntensity: number;
  ambient: number;
  night: number;
}

/** Interpolated sky state for an hour in [0, 24). Pure function – unit tested. */
export function skyStateAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].hour <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.hour) / (b.hour - a.hour);
  const mix = (x: string, y: string) => new THREE.Color('#' + x).lerp(new THREE.Color('#' + y), t);
  return {
    top: mix(a.top, b.top),
    horizon: mix(a.horizon, b.horizon),
    cloud: mix(a.cloud, b.cloud),
    moon: mix(a.moon, b.moon),
    moonIntensity: a.moonIntensity + (b.moonIntensity - a.moonIntensity) * t,
    ambient: a.ambient + (b.ambient - a.ambient) * t,
    night: a.night + (b.night - a.night) * t,
  };
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

// Gradient sky with swirling, glowing storm clouds (fbm noise, slowly turning).
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uCloud;
uniform float uTime;
varying vec3 vDir;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += noise(p) * a; p = p * 2.03 + 7.1; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 c = mix(uHorizon, uTop, smoothstep(-0.05, 0.6, y));
  // clouds projected on a dome, with a slow swirl
  vec2 p = d.xz / (0.25 + max(y, 0.0)) * 1.6;
  float ang = uTime * 0.01;
  p = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
  float w = fbm(p + vec2(uTime * 0.02, 0.0));
  float n = fbm(p * 1.3 + w * 2.2 - vec2(0.0, uTime * 0.015));
  float cloud = smoothstep(0.42, 0.78, n) * smoothstep(-0.02, 0.18, y);
  float rim = smoothstep(0.5, 0.6, n) - smoothstep(0.6, 0.82, n);
  c = mix(c, uCloud * 0.55, cloud * 0.75);
  c += uCloud * rim * 0.45 * smoothstep(0.0, 0.2, y);
  c = mix(c, uHorizon * 0.35, smoothstep(0.0, -0.35, y));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  readonly group = new THREE.Group();
  readonly hemi: THREE.HemisphereLight;
  readonly moonLight: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private moon: THREE.Mesh;
  private moonGlow: THREE.Sprite;
  private time = 0;
  state: SkyState = skyStateAt(21);

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uCloud: { value: new THREE.Color() },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMat);
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);

    const r = rng(9);
    const pts: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = r() * Math.PI * 2;
      const y = 0.1 + r() * 0.9;
      const s = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * s * 470, y * 470, Math.sin(a) * s * 470);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xe8e0ff, size: 2.2, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false, map: glowSprite(), blending: THREE.AdditiveBlending });
    this.stars = new THREE.Points(sg, this.starMat);
    this.group.add(this.stars);

    // the huge orange moon (and the light it casts)
    this.moon = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshBasicMaterial({ map: moonTexture(), transparent: true, fog: false, depthWrite: false, color: new THREE.Color(2.2, 2.2, 2.2) }),
    );
    this.moonGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowSprite(), color: 0xff7a30, transparent: true, opacity: 0.55, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.moonGlow.scale.setScalar(260);
    this.group.add(this.moonGlow, this.moon);

    this.hemi = new THREE.HemisphereLight(0x8a6aff, 0x1a0a20, 0.8);
    this.moonLight = new THREE.DirectionalLight(0xb08aff, 1.4);
    this.moonLight.castShadow = true;
    this.moonLight.shadow.camera.left = -45;
    this.moonLight.shadow.camera.right = 45;
    this.moonLight.shadow.camera.top = 45;
    this.moonLight.shadow.camera.bottom = -45;
    this.moonLight.shadow.camera.near = 1;
    this.moonLight.shadow.camera.far = 220;
    this.moonLight.shadow.bias = -0.0008;
    this.moonLight.shadow.normalBias = 0.04;
    this.group.add(this.hemi);
  }

  /** The moon light is added to the scene directly so its shadow follows the player. */
  addLightsTo(scene: THREE.Scene): void {
    scene.add(this.moonLight, this.moonLight.target);
  }

  setShadowSize(size: number): void {
    if (this.moonLight.shadow.mapSize.x === size) return;
    this.moonLight.shadow.mapSize.set(size, size);
    this.moonLight.shadow.map?.dispose();
    this.moonLight.shadow.map = null;
  }

  update(dt: number, hour: number, focus: THREE.Vector3, camera: THREE.Camera, fog: THREE.FogExp2): void {
    this.time += dt;
    const s = (this.state = skyStateAt(hour));
    const u = this.skyMat.uniforms;
    u.uTop.value.copy(s.top);
    u.uHorizon.value.copy(s.horizon);
    u.uCloud.value.copy(s.cloud);
    u.uTime.value = this.time;
    this.starMat.opacity = Math.max(0, s.night - 0.15);
    this.stars.visible = this.starMat.opacity > 0.02;

    this.hemi.color.copy(s.top).lerp(new THREE.Color(0x7a8aff), 0.6);
    this.hemi.groundColor.set(0x3a2010);
    this.hemi.intensity = s.ambient * 2.2;
    this.moonLight.color.copy(s.moon);
    this.moonLight.intensity = s.moonIntensity * 1.5;

    // the moon hangs low in the north-east; it crosses slowly through the night
    const ang = -0.9 + ((hour + 6) % 24) * 0.04;
    const dir = new THREE.Vector3(Math.sin(ang), 0.32, -Math.cos(ang)).normalize();
    this.moon.position.copy(dir).multiplyScalar(420);
    this.moon.lookAt(0, 0, 0);
    this.moonGlow.position.copy(dir).multiplyScalar(430);
    const moonVis = 0.25 + s.night * 0.75;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = moonVis;
    this.moonGlow.material.opacity = 0.55 * moonVis;

    this.moonLight.position.copy(focus).addScaledVector(dir, 120);
    this.moonLight.target.position.copy(focus);
    fog.color.copy(s.horizon).lerp(s.top, 0.55).multiplyScalar(0.8);
    this.group.position.set(camera.position.x, 0, camera.position.z);
  }
}
