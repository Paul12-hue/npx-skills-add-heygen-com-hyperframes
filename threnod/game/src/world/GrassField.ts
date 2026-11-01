import * as THREE from 'three';
import { rng } from './noise';
import type { Terrain } from './terrain';

/**
 * A dense carpet of grass (or flowers) around the player. A fixed set of tufts
 * lives in a square tile that wraps around the player in the vertex shader, so
 * there is always grass underfoot without placing millions of instances. The
 * ground height comes from a small float texture of the terrain.
 */
export class GrassField {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(terrain: Terrain, tex: THREE.Texture, opts: { count: number; tile: number; size: number; seed: number; hue: number; light: number }) {
    const r = rng(opts.seed);
    const a = new THREE.PlaneGeometry(1, 0.65, 1, 2);
    a.translate(0, 0.325, 0);
    const b = a.clone().rotateY(Math.PI / 2);
    const base = new THREE.BufferGeometry();
    const merge = (g: THREE.BufferGeometry[]) => {
      const pos: number[] = [];
      const nor: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let off = 0;
      for (const x of g) {
        const p = x.getAttribute('position');
        const n = x.getAttribute('normal');
        const u = x.getAttribute('uv');
        for (let i = 0; i < p.count; i++) {
          pos.push(p.getX(i), p.getY(i), p.getZ(i));
          nor.push(0, 1, 0); // light the blades like the ground below them
          uv.push(u.getX(i), u.getY(i));
          void n;
        }
        const ix = x.getIndex()!;
        for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
        off += p.count;
      }
      base.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      base.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      base.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      base.setIndex(idx);
    };
    merge([a, b]);

    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    for (const k of ['position', 'normal', 'uv']) geo.setAttribute(k, base.getAttribute(k));
    const offsets = new Float32Array(opts.count * 4); // x, z, scale, rotation
    const tints = new Float32Array(opts.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < opts.count; i++) {
      offsets.set([r() * opts.tile, r() * opts.tile, opts.size * (0.6 + r() * 0.8), r() * Math.PI], i * 4);
      c.setHSL(opts.hue + (r() - 0.5) * 0.08, 0.45, opts.light * (0.8 + r() * 0.4));
      tints.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    geo.instanceCount = opts.count;

    const hm = terrain.heightTexture();
    this.uniforms = {
      uCenter: { value: new THREE.Vector2() },
      uTile: { value: opts.tile },
      uTime: { value: 0 },
      uHeight: { value: hm.texture },
      uHMeta: { value: new THREE.Vector4(hm.origin, hm.cell, hm.n, 0) },
    };
    const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec4 aOffset;
          attribute vec3 aTint;
          uniform vec2 uCenter;
          uniform float uTile;
          uniform float uTime;
          uniform sampler2D uHeight;
          uniform vec4 uHMeta;
          varying vec3 vTint;
          float hAt(vec2 p) {
            vec2 g = clamp((p - uHMeta.x) / uHMeta.y, vec2(0.0), vec2(uHMeta.z - 1.001));
            ivec2 i = ivec2(floor(g));
            vec2 f = fract(g);
            float a = texelFetch(uHeight, i, 0).r;
            float b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
            float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r;
            float d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
            return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
          }`,
        )
        .replace(
          '#include <begin_vertex>',
          `vec2 rel = mod(aOffset.xy - uCenter + uTile * 0.5, uTile) - uTile * 0.5;
          vec2 wp = uCenter + rel;
          float ground = hAt(wp);
          float fade = 1.0 - smoothstep(uTile * 0.38, uTile * 0.5, length(rel));
          float wet = step(0.35, ground); // no grass in the lake
          float s = aOffset.z * fade * wet;
          float cr = cos(aOffset.w), sr = sin(aOffset.w);
          vec3 transformed = vec3(position.x * cr - position.z * sr, position.y, position.x * sr + position.z * cr) * s;
          transformed.x += sin(uTime * 1.7 + wp.x * 0.7 + wp.y * 0.4) * 0.08 * position.y * s;
          transformed += vec3(wp.x, ground - 0.04, wp.y);
          vTint = aTint;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
        .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= vTint;');
    };
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.name = 'grass-field';
  }

  private max = 0;
  /** 0..1 – fewer tufts on weaker devices / lower quality. */
  setDensity(f: number): void {
    const g = this.mesh.geometry as THREE.InstancedBufferGeometry;
    if (!this.max) this.max = g.instanceCount;
    g.instanceCount = Math.max(1, Math.round(this.max * f));
  }

  update(dt: number, center: THREE.Vector3): void {
    (this.uniforms.uCenter.value as THREE.Vector2).set(center.x, center.z);
    this.uniforms.uTime.value = (this.uniforms.uTime.value as number) + dt;
  }
}
