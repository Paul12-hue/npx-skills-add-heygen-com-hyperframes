import * as THREE from 'three';
import { rng } from './noise';

/** One keyframe of the day. Colours are hex strings from (or near) the palette. */
interface SkyKey {
  hour: number;
  top: string;
  horizon: string;
  sun: string;
  sunIntensity: number;
  ambient: number;
  night: number; // 0 = day, 1 = full night (window lights, stars)
}

// The Long Vesper: the sun rises, but it never gets truly bright.
const KEYS: SkyKey[] = [
  { hour: 0, top: '120a1f', horizon: '2b2540', sun: '7d6aa3', sunIntensity: 0.25, ambient: 0.35, night: 1 },
  { hour: 5, top: '1d1830', horizon: '4f4170', sun: '7d6aa3', sunIntensity: 0.3, ambient: 0.4, night: 0.9 },
  { hour: 7, top: '4f4170', horizon: 'c8aa78', sun: 'e0902c', sunIntensity: 0.9, ambient: 0.55, night: 0.35 },
  { hour: 10, top: '7c7883', horizon: 'b9b5bd', sun: 'f2e6c8', sunIntensity: 1.3, ambient: 0.75, night: 0 },
  { hour: 14, top: '7c7883', horizon: 'd9c095', sun: 'f2e6c8', sunIntensity: 1.35, ambient: 0.75, night: 0 },
  { hour: 17, top: '7d6aa3', horizon: 'e0902c', sun: 'e0902c', sunIntensity: 1.0, ambient: 0.72, night: 0.2 },
  { hour: 19, top: '4f4170', horizon: 'a8541c', sun: 'a8541c', sunIntensity: 0.7, ambient: 0.62, night: 0.6 },
  { hour: 21, top: '1d1830', horizon: '4f4170', sun: '7d6aa3', sunIntensity: 0.3, ambient: 0.45, night: 0.95 },
  { hour: 24, top: '120a1f', horizon: '2b2540', sun: '7d6aa3', sunIntensity: 0.25, ambient: 0.35, night: 1 },
];

export interface SkyState {
  top: THREE.Color;
  horizon: THREE.Color;
  sun: THREE.Color;
  sunIntensity: number;
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
    sun: mix(a.sun, b.sun),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * t,
    ambient: a.ambient + (b.ambient - a.ambient) * t,
    night: a.night + (b.night - a.night) * t,
  };
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float y = clamp(vDir.y, -1.0, 1.0);
  vec3 c = mix(uHorizon, uTop, smoothstep(-0.02, 0.55, y));
  c = mix(c, uHorizon * 0.6, smoothstep(0.0, -0.3, y));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  readonly group = new THREE.Group();
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  private skyMat: THREE.ShaderMaterial;
  private stars: THREE.Points;
  private starMat: THREE.PointsMaterial;
  private hesper: THREE.Mesh;
  state: SkyState = skyStateAt(18.5);

  constructor() {
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 24, 12), this.skyMat);
    dome.renderOrder = -10;
    this.group.add(dome);

    const r = rng(9);
    const pts: number[] = [];
    for (let i = 0; i < 260; i++) {
      const a = r() * Math.PI * 2;
      const y = 0.08 + r() * 0.92;
      const s = Math.sqrt(1 - y * y);
      pts.push(Math.cos(a) * s * 480, y * 480, Math.sin(a) * s * 480);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xfbf7ec, size: 1.5, sizeAttenuation: false, transparent: true, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.group.add(this.stars);

    // Hesper, the Evening Star – the one star that never sets.
    this.hesper = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.2, 0),
      new THREE.MeshBasicMaterial({ color: 0xfbf7ec, fog: false }),
    );
    this.hesper.position.set(-300, 210, -320);
    this.group.add(this.hesper);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x2a160b, 0.6);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.group.add(this.hemi, this.sun, this.sun.target);
  }

  update(hour: number, focus: THREE.Vector3, fog: THREE.Fog): void {
    const s = (this.state = skyStateAt(hour));
    this.skyMat.uniforms.uTop.value.copy(s.top);
    this.skyMat.uniforms.uHorizon.value.copy(s.horizon);
    this.starMat.opacity = Math.max(0, s.night - 0.2) * 1.2;
    this.stars.visible = this.starMat.opacity > 0.02;
    this.hemi.color.copy(s.top).lerp(new THREE.Color(1, 1, 1), 0.35);
    this.hemi.intensity = s.ambient * 1.6;
    this.sun.color.copy(s.sun);
    this.sun.intensity = s.sunIntensity * 1.6;
    // a low sun (or moon) that crosses the sky; it never climbs high in the Long Vesper
    const ang = ((hour - 6) / 24) * Math.PI * 2;
    this.sun.position.set(focus.x + Math.cos(ang) * 80, 25 + Math.abs(Math.sin(ang)) * 45, focus.z + 40);
    this.sun.target.position.copy(focus);
    fog.color.copy(s.horizon);
    this.group.position.set(focus.x, 0, focus.z);
  }
}
