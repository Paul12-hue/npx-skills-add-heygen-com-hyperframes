import * as THREE from 'three';
import { LAYOUT, Terrain, distToPath, distToRiver, hushFactor, lakeFactor } from './terrain';
import { rng } from './noise';
import * as P from './props';
import { Sky } from './Sky';
import { GrassField } from './GrassField';
import { groundAt, type Collider, type Platform, type World as PhysicsWorld } from '../player/movement';
import { createTextures, flowerSprite, glowSprite, grassSprite, mistSprite, type TexPair, type TextureSet } from '../render/textures';

export type { Collider } from '../player/movement';

export interface InteractableDef {
  id: string;
  x: number;
  z: number;
  radius: number;
  verb: string;
  dialogue: string;
}

/** Glow colours are pushed above 1.0 so the bloom pass makes them radiate. */
const GLOW: Partial<Record<P.MatKey, number>> = {
  glowWarm: 1.7, glowViolet: 1.9, glowGreen: 1.5, glowCyan: 1.6, glowMagenta: 1.7,
};

/**
 * Stylised water: turquoise in the shallows, deep blue-green in the middle,
 * animated waves with moonlight glints, a soft fresnel sheen and foam along the
 * shore. The depth comes from the terrain height texture, so the shore line is
 * exact for the lake, the rivers and the marsh pools.
 */
const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vec4 mvPosition = viewMatrix * wp;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }`;
const WATER_FRAG = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uHeight;
  uniform vec4 uHMeta;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uMoonDir;
  uniform vec3 uMoonColor;
  uniform float uDetail;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  float hAt(vec2 p) {
    vec2 g = clamp((p - uHMeta.x) / uHMeta.y, vec2(0.0), vec2(uHMeta.z - 1.001));
    ivec2 i = ivec2(floor(g));
    vec2 f = fract(g);
    float a = texelFetch(uHeight, i, 0).r;
    float b = texelFetch(uHeight, i + ivec2(1, 0), 0).r;
    float c = texelFetch(uHeight, i + ivec2(0, 1), 0).r;
    float d = texelFetch(uHeight, i + ivec2(1, 1), 0).r;
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float waves(vec2 p) {
    float t = uTime;
    float w = noise(p * 0.35 + vec2(t * 0.08, t * 0.05)) * 0.6;
    w += noise(p * 0.9 - vec2(t * 0.12, -t * 0.07)) * 0.3;
    w += noise(p * 2.3 + vec2(-t * 0.2, t * 0.15)) * 0.15 * uDetail;
    return w;
  }
  void main() {
    float depth = -hAt(vWorld.xz); // water level is y = 0
    if (depth < -0.05) discard;
    vec2 p = vWorld.xz;
    float e = 0.12;
    float h0 = waves(p);
    vec3 n = normalize(vec3(h0 - waves(p + vec2(e, 0.0)), e * 1.6, h0 - waves(p + vec2(0.0, e))));
    vec3 v = normalize(cameraPosition - vWorld);
    float shallow = 1.0 - smoothstep(0.0, 2.2, depth);
    vec3 col = mix(uDeep, uShallow, shallow * 0.45);
    // soft sky sheen at grazing angles
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
    col = mix(col, uSky, fres * 0.25);
    // moon glints on the wave crests
    vec3 r = reflect(-normalize(uMoonDir), n);
    float spec = pow(max(dot(r, v), 0.0), 60.0);
    col += uMoonColor * spec * 0.9;
    // light ripple streaks and foam along the shore
    float rn = noise(p * 0.8 + vec2(uTime * 0.06, -uTime * 0.04));
    float streak = pow(1.0 - abs(rn - 0.5) * 2.0, 14.0) * 0.07;
    // a thin, broken line of foam right at the water's edge
    float foamN = noise(p * 4.0 + vec2(uTime * 0.3, uTime * 0.2));
    float edge = 1.0 - smoothstep(0.0, 0.1, depth);
    float foam = edge * smoothstep(0.55, 0.8, foamN) * 0.35;
    col = mix(col + vec3(streak), mix(uShallow, vec3(0.75, 0.82, 0.8), 0.5), clamp(foam, 0.0, 1.0));
    float alpha = mix(0.62, 0.94, smoothstep(0.0, 1.2, depth));
    alpha = max(alpha, clamp(foam, 0.0, 1.0));
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }`;

/**
 * Hollowmere Vale: the lake and two rivers with bridges, Candlewick with its
 * fences and clutter, the cemetery of Saint Ebba, farm fields and a windmill,
 * a stone circle on a hill, a ruined watch tower, a forest camp, the old mine,
 * a mixed forest – with solid collisions everywhere.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly textures: TextureSet;
  readonly terrain: Terrain;
  readonly sky = new Sky();
  readonly fog = new THREE.FogExp2(0x0c1a20, 0.0095);
  readonly colliders: Collider[] = [];
  readonly platforms: Platform[] = [];
  readonly interactables: InteractableDef[] = [];
  readonly spawn = new THREE.Vector3(LAYOUT.cemetery.x + 2.6, 0, LAYOUT.cemetery.z + 1.5);
  readonly spawnYaw = Math.PI * 0.75;
  readonly physics: PhysicsWorld;
  private mats = new Map<P.MatKey, THREE.Material>();
  private glowMats: [THREE.MeshBasicMaterial, number][] = [];
  private flickerLights: { light: LightSource; base: number; phase: number }[] = [];
  private lakeGlow!: LightSource;
  /** Every lamp, fire and glow in the world; only the nearest few get a real light. */
  private lightSources: LightSource[] = [];
  private lightPool: THREE.PointLight[] = [];
  private lakeGlowMesh!: THREE.Mesh;
  private fireflies!: THREE.Points;
  private fireflyOffsets!: Float32Array;
  private mist: THREE.Sprite[] = [];
  private fields: GrassField[] = [];
  private sails = new THREE.Group();
  private water!: THREE.Mesh;
  private waterMat!: THREE.ShaderMaterial;
  private time = 0;
  private bellLights = new Map<string, { light: LightSource; glow: THREE.Mesh }>();
  private baseFog = new THREE.Color();

  constructor() {
    this.textures = createTextures();
    this.scene.fog = this.fog;
    this.terrain = new Terrain(this.groundMaterial());
    this.scene.add(this.terrain.mesh, this.sky.group);
    this.sky.addLightsTo(this.scene);
    this.physics = { colliders: this.colliders, platforms: this.platforms, terrain: (x, z) => this.terrain.getHeight(x, z) };
    this.buildMaterials();
    const batch = new P.PropBatch();
    this.buildWater(batch);
    this.buildRoadsAndBridges(batch);
    this.buildCemetery(batch);
    this.buildVillage(batch);
    this.buildFarm(batch);
    this.buildOldSites(batch);
    this.buildMine(batch);
    this.buildOuterLands(batch);
    this.buildSettlements(batch);
    this.buildForest(batch); // last: trees avoid everything placed before
    this.flush(batch);
    this.terrain.bakeOcclusion((x, z) => this.groundOcclusion(x, z));
    this.buildAtmosphere();
    this.buildGrass();
    this.spawn.y = this.terrain.getHeight(this.spawn.x, this.spawn.z);
  }

  /** Terrain height (no platforms). */
  height(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
  }

  /** Walkable ground for something at height y (bridges count when you are on/above them). */
  groundHeight(x: number, z: number, y: number): number {
    return groundAt(this.physics, x, z, y);
  }

  private y(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
  }

  /** Lowest ground under a rectangular footprint – buildings sit on it and their plinth fills the rest. */
  private footY(x: number, z: number, hx: number, hz: number, rot: number): number {
    let m = Infinity;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    for (const [a, b] of [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz], [0, 0]]) m = Math.min(m, this.y(x + a * c - b * s, z + a * s + b * c));
    return m;
  }

  private box(x: number, z: number, hx: number, hz: number, rot: number): void {
    this.addCollider({ x, z, hx, hz, rot });
  }

  private circle(x: number, z: number, r: number): void {
    this.addCollider({ x, z, r });
  }

  // a coarse grid so that physics and placement only look at nearby obstacles
  private static readonly CELL = 16;
  private grid = new Map<number, Collider[]>();
  private key(i: number, j: number): number {
    return (i + 1000) * 4096 + (j + 1000);
  }

  addCollider(c: Collider): void {
    this.colliders.push(c);
    const reach = c.r ?? Math.max(c.hx!, c.hz!) * 1.42;
    const C = World.CELL;
    for (let i = Math.floor((c.x - reach) / C); i <= Math.floor((c.x + reach) / C); i++) {
      for (let j = Math.floor((c.z - reach) / C); j <= Math.floor((c.z + reach) / C); j++) {
        const k = this.key(i, j);
        const list = this.grid.get(k);
        if (list) list.push(c);
        else this.grid.set(k, [c]);
      }
    }
  }

  /** Colliders in the 3×3 grid cells around a point. */
  nearby(x: number, z: number): Collider[] {
    const C = World.CELL;
    const ci = Math.floor(x / C);
    const cj = Math.floor(z / C);
    const out = new Set<Collider>();
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const c of this.grid.get(this.key(i, j)) ?? []) out.add(c);
    return [...out];
  }

  /** How much the things standing around darken the ground at (x, z) – soft contact shadows. */
  private groundOcclusion(x: number, z: number): number {
    let f = 1;
    for (const c of this.nearby(x, z)) {
      let d: number;
      let reach: number;
      if (c.r !== undefined) {
        d = Math.hypot(x - c.x, z - c.z) - c.r;
        reach = 1.2 + c.r * 2.2; // tree trunks shade a canopy-sized patch
      } else {
        const cs = Math.cos(c.rot);
        const sn = Math.sin(c.rot);
        // same local frame as the physics (movement.ts toLocal)
        const lx = (x - c.x) * cs + (z - c.z) * sn;
        const lz = -(x - c.x) * sn + (z - c.z) * cs;
        const qx = Math.abs(lx) - c.hx;
        const qz = Math.abs(lz) - c.hz;
        d = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
        reach = 1.6 + Math.min(c.hx, c.hz) * 0.6;
      }
      if (d < reach) {
        const t = Math.max(0, d) / reach;
        f *= 1 - 0.42 * (1 - t) * (1 - t);
      }
    }
    return Math.max(0.42, f);
  }

  /** Is the spot free of obstacles (public: animals and villagers choose where to go with it). */
  isFree(x: number, z: number, margin: number): boolean {
    return this.free(x, z, margin);
  }

  /** Is the spot free of obstacles (for scattering trees and clutter)? */
  private free(x: number, z: number, margin: number): boolean {
    for (const c of this.nearby(x, z)) {
      const reach = (c.r ?? Math.max(c.hx!, c.hz!) * 1.42) + margin;
      if (Math.abs(c.x - x) < reach && Math.abs(c.z - z) < reach && Math.hypot(c.x - x, c.z - z) < reach) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- materials
  private textured(t: TexPair, o: { shininess: number; bump: number; repeat?: number; specular?: number; emissive?: number; emissiveIntensity?: number }): THREE.MeshPhongMaterial {
    const map = t.map.clone();
    const bump = t.bump.clone();
    const rep = o.repeat ?? 1;
    for (const tex of [map, bump]) {
      tex.repeat.set(rep, rep);
      tex.needsUpdate = true;
    }
    return new THREE.MeshPhongMaterial({
      vertexColors: true,
      map,
      bumpMap: bump,
      bumpScale: o.bump,
      shininess: o.shininess,
      specular: new THREE.Color(o.specular ?? 0x202028),
      emissive: new THREE.Color(o.emissive ?? 0x000000),
      emissiveIntensity: o.emissiveIntensity ?? 1,
    });
  }

  /**
   * The ground: earth texture plus a finer second layer (so it never looks
   * smooth up close or tiled from afar) and rock on steep slopes.
   */
  private groundMaterial(): THREE.MeshPhongMaterial {
    const m = this.textured(this.textures.ground, { shininess: 6, bump: 3.2, repeat: 1 });
    const rock = this.textures.stone.map.clone();
    rock.needsUpdate = true;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRock = { value: rock };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vSlope;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSlope = 1.0 - normal.y;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSlope;\nuniform sampler2D uRock;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          float detail = texture2D(map, vMapUv * 5.3 + 0.37).g;
          float broad = texture2D(map, vMapUv * 0.21).g;
          diffuseColor.rgb *= (0.62 + 0.7 * detail) * (0.8 + 0.4 * broad);
          float rk = smoothstep(0.12, 0.3, vSlope);
          vec3 rockCol = texture2D(uRock, vMapUv * 0.9).rgb * 1.25;
          diffuseColor.rgb = mix(diffuseColor.rgb, rockCol, rk * 0.85);`,
        );
    };
    return m;
  }

  private buildMaterials(): void {
    const t = this.textures;
    const m = this.mats;
    m.set('stone', this.textured(t.stone, { shininess: 30, bump: 4.5, specular: 0x30303a }));
    m.set('wood', this.textured(t.wood, { shininess: 20, bump: 3 }));
    m.set('darkwood', this.textured(t.wood, { shininess: 25, bump: 3.2 }));
    m.set('shingle', this.textured(t.shingle, { shininess: 45, bump: 5.5, specular: 0x404050 }));
    m.set('plaster', this.textured(t.plaster, { shininess: 10, bump: 2.6 }));
    m.set('organic', this.textured(t.organic, { shininess: 15, bump: 3.5 }));
    m.set('foliage', this.textured(t.organic, { shininess: 18, bump: 2.4, specular: 0x163a2a }));
    m.set('metal', this.textured(t.stone, { shininess: 100, bump: 0.6, specular: 0x9090a0 }));
    m.set('mushCap', this.textured(t.plaster, { shininess: 120, bump: 1.5, specular: 0xd0a0ff, emissive: 0x2a0a50 }));
    m.set('mushStem', this.textured(t.organic, { shininess: 60, bump: 1.5, specular: 0x80ff80, emissive: 0x3aa020, emissiveIntensity: 0.7 }));
    m.set('lily', this.textured(t.organic, { shininess: 90, bump: 1, specular: 0x9aff9a, emissive: 0x1a8a1a, emissiveIntensity: 0.9 }));
    m.set('void', new THREE.MeshBasicMaterial({ color: 0x000000 }));
    for (const [k, mult] of Object.entries(GLOW) as [P.MatKey, number][]) {
      const g = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(mult, mult, mult) });
      this.glowMats.push([g, mult]);
      m.set(k, g);
    }
  }

  private texScale(k: P.MatKey): number {
    switch (k) {
      case 'shingle': return 0.35;
      case 'stone': return 0.32;
      case 'wood': case 'darkwood': return 0.42;
      case 'organic': case 'foliage': return 0.45;
      default: return 0.3;
    }
  }

  /** Merge everything collected in the batch into one mesh per material. */
  private flush(batch: P.PropBatch): void {
    for (const [k, geo] of batch.merged()) {
      P.applyBoxUV(geo, this.texScale(k));
      const mesh = new THREE.Mesh(geo, this.mats.get(k));
      mesh.name = 'props-' + k;
      const glow = k.startsWith('glow') || k === 'void';
      mesh.castShadow = !glow;
      mesh.receiveShadow = !glow;
      this.scene.add(mesh);
    }
  }

  private light(color: number, intensity: number, distance: number, x: number, y: number, z: number, flicker = true): LightSource {
    const l: LightSource = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance };
    this.lightSources.push(l);
    if (flicker) this.flickerLights.push({ light: l, base: intensity, phase: Math.random() * 10 });
    return l;
  }

  // ---------------------------------------------------------------- water
  private buildWater(batch: P.PropBatch): void {
    const { lake, waterLevel, size } = LAYOUT;
    // one water surface for the lake, the rivers and the marsh pools
    const hm = this.terrain.heightTexture();
    this.waterMat = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uHeight: { value: null },
          uHMeta: { value: new THREE.Vector4(hm.origin, hm.cell, hm.n, 0) },
          uDeep: { value: new THREE.Color(0x0a2a38) },
          uShallow: { value: new THREE.Color(0x24685e) },
          uSky: { value: new THREE.Color(0x3a5a7a) },
          uMoonDir: { value: new THREE.Vector3(0.3, 0.5, -0.8) },
          uMoonColor: { value: new THREE.Color(0xe8eeff) },
          uDetail: { value: 1 },
        },
      ]),
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.waterMat.uniforms.uHeight.value = hm.texture;
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.waterMat);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = waterLevel;
    this.water.renderOrder = 1;
    this.water.name = 'water';
    this.scene.add(this.water);

    // "The Lantern Under the Lake"
    this.lakeGlowMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.8) }));
    this.lakeGlowMesh.position.set(lake.x + 4, -2.6, lake.z - 3);
    this.lakeGlow = this.light(0xffb040, 8, 18, lake.x + 4, -1.4, lake.z - 3, false);
    this.scene.add(this.lakeGlowMesh);

    const r = rng(23);
    const pad = P.lilyPadGeometry();
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = lake.radius * (0.55 + r() * 0.42);
      const x = lake.x + Math.cos(a) * d;
      const z = lake.z + Math.sin(a) * d;
      if (lakeFactor(x, z) > 0.98) continue;
      batch.add(P.place(pad, x, waterLevel + 0.01, z, r() * 6, 0.6 + r() * 0.9));
    }
    this.interactables.push({ id: 'lake_shore', x: lake.x + 4, z: lake.z - lake.radius + 1, radius: 4, verb: 'Look', dialogue: 'lake_shore' });
  }

  /** Finer wave detail on medium/high quality. */
  setReflections(on: boolean): void {
    this.waterMat.uniforms.uDetail.value = on ? 1 : 0;
  }

  // ---------------------------------------------------------------- roads & bridges
  private buildRoadsAndBridges(batch: P.PropBatch): void {
    const mat = this.textured(this.textures.cobble, { shininess: 110, bump: 4, specular: 0x8a8070, repeat: 1 });
    const lantern = P.violetLanternGeometry();
    let lamp = 0;
    let lit = 0;
    const W = LAYOUT.riverWidth;
    for (const path of LAYOUT.paths) {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        const [ax, az] = path[i];
        const [bx, bz] = path[i + 1];
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 1.2);
        for (let s = 0; s < steps; s++) pts.push(new THREE.Vector2(ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps));
      }
      pts.push(new THREE.Vector2(...path[path.length - 1]));
      const pos: number[] = [];
      const uv: number[] = [];
      const idx: number[] = [];
      let along = 0;
      const width = 1.7;
      let prevValid = false;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dir = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
        const nx = -dir.y;
        const nz = dir.x;
        if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
        const overWater = distToRiver(pts[i].x, pts[i].y) < W * 1.5;
        const base = pos.length / 3;
        for (const side of [-1, 1]) {
          const x = pts[i].x + nx * width * side;
          const z = pts[i].y + nz * width * side;
          pos.push(x, this.y(x, z) + 0.07, z);
          uv.push((side + 1) * 0.5 * 0.8, along * 0.4);
        }
        if (i > 0 && prevValid && !overWater) idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
        prevValid = !overWater;
        if (i % 11 === 5 && !overWater) {
          const side = lamp++ % 2 ? 1 : -1;
          const lx = pts[i].x + nx * (width + 0.8) * side;
          const lz = pts[i].y + nz * (width + 0.8) * side;
          if (distToRiver(lx, lz) < W * 1.8) continue;
          const ly = this.y(lx, lz);
          batch.add(P.place(lantern, lx, ly, lz, Math.atan2(nx * side, nz * side) - Math.PI / 2));
          this.circle(lx, lz, 0.22);
          if (lamp % 2 === 1) {
            this.light(0xffb040, 4, 13, lx, ly + 2.6, lz);
            lit++;
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => [0.62, 0.58, 0.55][i % 3]), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const road = new THREE.Mesh(g, mat);
      road.receiveShadow = true;
      road.name = 'road';
      this.scene.add(road);

      // a bridge wherever a road crosses a river
      for (let i = 0; i < path.length - 1; i++) {
        for (const river of LAYOUT.rivers) {
          for (let j = 0; j < river.length - 1; j++) {
            const hit = segmentIntersection(path[i], path[i + 1], river[j], river[j + 1]);
            if (hit) this.addBridge(batch, hit[0], hit[1], Math.atan2(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]));
          }
        }
      }
    }
  }

  private addBridge(batch: P.PropBatch, x: number, z: number, ry: number): void {
    const len = LAYOUT.riverWidth * 2 + 8;
    const width = 3.4;
    // deck runs from the road height on one bank to the other (a gentle slope)
    const [a, b] = [-1, 1].map((s) => this.y(x + Math.sin(ry) * s * (len / 2 - 0.3), z + Math.cos(ry) * s * (len / 2 - 0.3)) + 0.08);
    const mid = (a + b) / 2;
    const slope = (b - a) / (len - 0.6);
    const prop = P.bridgeGeometry(len, width, 0);
    for (const g of Object.values(prop)) g!.rotateX(-Math.atan(slope));
    batch.add(P.place(prop, x, mid, z, ry));
    const rot = -ry;
    this.platforms.push({ x, z, hx: width / 2, hz: len / 2, rot, y: mid, slope });
    for (const s of [-1, 1]) {
      const ox = Math.cos(ry) * s * (width / 2 - 0.05);
      const oz = -Math.sin(ry) * s * (width / 2 - 0.05);
      this.box(x + ox, z + oz, 0.1, len / 2 - 0.2, rot);
    }
    this.interactables.push({ id: 'bridge', x, z, radius: 3, verb: 'Look', dialogue: 'bridge' });
  }

  // ---------------------------------------------------------------- cemetery
  private buildCemetery(batch: P.PropBatch): void {
    const c = LAYOUT.cemetery;
    let v = 0;
    for (let row = -2; row <= 2; row++) {
      for (let col = -3; col <= 3; col++) {
        const x = c.x + col * 2.6 + (row % 2) * 0.6;
        const z = c.z + row * 3.4;
        if (Math.abs(col) <= 1 && row === 0) continue;
        if ((row * 7 + col * 3) % 5 === 0) continue;
        const ry = (v % 3) * 0.06 - 0.06;
        batch.add(P.place(P.graveGeometry(v++), x, this.y(x, z), z, ry));
        this.box(x, z, 0.45, 0.14, -ry);
      }
    }
    batch.add(P.place(P.openGraveGeometry(), c.x, this.y(c.x, c.z) + 0.02, c.z, 0));
    this.box(c.x, c.z - 1.45, 0.45, 0.12, 0);
    this.box(c.x + 1.9, c.z + 0.6, 0.7, 0.7, 0);
    this.interactables.push({ id: 'open_grave', x: c.x, z: c.z, radius: 2.6, verb: 'Look', dialogue: 'grave_open' });
    this.interactables.push({ id: 'headstone', x: c.x, z: c.z - 1.4, radius: 2.2, verb: 'Read', dialogue: 'grave_headstone' });

    const chX = c.x - 6;
    const chZ = c.z - 14;
    batch.add(P.place(P.chapelGeometry(), chX, this.footY(chX, chZ, 5.2, 2.8, 0), chZ, 0));
    this.box(chX, chZ, 5.05, 2.85, 0);
    this.box(chX - 5.2, chZ, 1.55, 1.55, 0);
    this.light(0x80a0ff, 2, 14, chX, this.y(chX, chZ) + 3, chZ + 4.5);

    // a low stone wall around the graveyard, open towards the road
    const wall = P.fenceGeometry();
    for (let a = 0; a < Math.PI * 2; a += 0.19) {
      const x = c.x + Math.cos(a) * (c.radius + 4);
      const z = c.z + Math.sin(a) * (c.radius + 4);
      if (distToPath(x, z) < 3.5) continue;
      const ry = -a + Math.PI / 2;
      batch.add(P.place(wall, x, this.y(x, z), z, ry));
      this.box(x, z, 1.55, 0.12, -ry);
    }

    const sx = -24 + 2.4;
    const sz = -30 + 1.6;
    batch.add(P.place(P.signpostGeometry(), sx, this.y(sx, sz), sz, 0.4));
    this.circle(sx, sz, 0.25);
    this.interactables.push({ id: 'signpost', x: sx, z: sz, radius: 2.4, verb: 'Read', dialogue: 'signpost' });
  }

  // ---------------------------------------------------------------- Candlewick
  private buildVillage(batch: P.PropBatch): void {
    const v = LAYOUT.village;
    const spots: [number, number][] = [[-14, -8], [-4, -16], [11, -13], [15, 5], [3, 15], [-14, 9], [22, -4]];
    const { hx, hz } = P.HOUSE_HALF;
    spots.forEach(([dx, dz], i) => {
      const x = v.x + dx;
      const z = v.z + dz;
      // turn the door (+z) towards the square, snapped to 45° so houses line up
      const ry = Math.round((Math.atan2(-dx, -dz)) / (Math.PI / 4)) * (Math.PI / 4);
      const y = this.footY(x, z, hx, hz, -ry);
      batch.add(P.place(P.houseGeometry(i), x, y, z, ry));
      this.box(x, z, hx, hz, -ry);
    });
    this.light(0xffa040, 5, 18, v.x - 6, this.y(v.x - 6, v.z - 4) + 3, v.z - 4);
    this.light(0xffa040, 4, 16, v.x + 6, this.y(v.x + 6, v.z + 6) + 3, v.z + 6);

    const wx = v.x + 3;
    const wz = v.z + 2;
    batch.add(P.place(P.wellGeometry(), wx, this.y(wx, wz), wz));
    this.circle(wx, wz, 1.35);
    this.interactables.push({ id: 'well', x: wx, z: wz, radius: 2.6, verb: 'Look', dialogue: 'well' });

    const cx = v.x - 4;
    const cz = v.z - 3;
    batch.add(P.place(P.candleShrineGeometry(), cx, this.y(cx, cz), cz, 0.6));
    this.box(cx, cz, 1.35, 0.7, -0.6);
    this.interactables.push({ id: 'candle_shrine', x: cx, z: cz, radius: 2.8, verb: 'Look', dialogue: 'candle_shrine' });

    const bx = v.x + 8;
    const bz = v.z - 5;
    batch.add(P.place(P.bellTowerGeometry(), bx, this.y(bx, bz), bz, 0.2));
    this.box(bx, bz, 1.35, 1.35, -0.2);
    this.interactables.push({ id: 'bell_tower', x: bx, z: bz, radius: 3, verb: 'Look', dialogue: 'bell_tower' });

    // everyday clutter: barrels, crates, a cart and hay
    const clutter: [() => P.Prop, number, number, number, 'c' | 'b', number, number][] = [
      [P.barrelGeometry, -9.5, -5, 0, 'c', 0.45, 0],
      [P.barrelGeometry, -10.4, -4.4, 0, 'c', 0.45, 0],
      [P.crateGeometry, -9.6, -3.6, 0.3, 'b', 0.55, 0.55],
      [P.crateGeometry, 7.5, 9, 0.8, 'b', 0.55, 0.55],
      [P.barrelGeometry, 8.6, 9.6, 0, 'c', 0.45, 0],
      [P.cartGeometry, -3, 9, 0.5, 'b', 1.0, 1.9],
      [P.hayBaleGeometry, 16, -9, 0.4, 'b', 0.7, 0.8],
      [P.hayBaleGeometry, 17.4, -8, 1.1, 'b', 0.7, 0.8],
    ];
    for (const [make, dx, dz, ry, kind, a, b] of clutter) {
      const x = v.x + dx;
      const z = v.z + dz;
      batch.add(P.place(make(), x, this.y(x, z), z, ry));
      if (kind === 'c') this.circle(x, z, a);
      else this.box(x, z, a, b, -ry);
    }

    // a fence around the village, open where the roads come in
    const fence = P.fenceGeometry();
    for (let a = 0; a < Math.PI * 2; a += 0.098) {
      const x = v.x + Math.cos(a) * (v.radius + 6);
      const z = v.z + Math.sin(a) * (v.radius + 6);
      if (distToPath(x, z) < 3.6 || distToRiver(x, z) < LAYOUT.riverWidth * 2) continue;
      const ry = -a + Math.PI / 2;
      batch.add(P.place(fence, x, this.y(x, z), z, ry));
      this.box(x, z, 1.55, 0.1, -ry);
    }
  }

  /** Named spots where villagers work, sit or stand (filled while building). */
  readonly spots = new Map<string, { x: number; z: number; yaw: number }>();

  private spot(name: string, x: number, z: number, faceX?: number, faceZ?: number, yaw = 0): void {
    const y = faceX !== undefined && faceZ !== undefined ? Math.atan2(-(faceX - x), -(faceZ - z)) : yaw;
    this.spots.set(name, { x, z, yaw: y });
  }

  /** A building turned with its door (+z) towards (cx, cz), snapped to 45°. */
  private building(make: P.Prop, half: { hx: number; hz: number }, x: number, z: number, cx: number, cz: number): number {
    const ry = Math.round(Math.atan2(cx - x, cz - z) / (Math.PI / 4)) * (Math.PI / 4);
    const y = this.footY(x, z, half.hx, half.hz, -ry);
    this.batchRef!.add(P.place(make, x, y, z, ry));
    this.box(x, z, half.hx, half.hz, -ry);
    return ry;
  }
  private batchRef: P.PropBatch | null = null;

  private prop(make: P.Prop, x: number, z: number, ry: number, col: { r?: number; hx?: number; hz?: number }): void {
    this.batchRef!.add(P.place(make, x, this.y(x, z), z, ry));
    if (col.r) this.circle(x, z, col.r);
    else if (col.hx) this.box(x, z, col.hx, col.hz!, -ry);
  }

  private lamp(x: number, z: number, ry = 0): void {
    this.prop(P.lanternPostGeometry(), x, z, ry, { r: 0.2 });
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    this.light(0xffb040, 4, 14, x + 0.5 * c, this.y(x, z) + 2.3, z - 0.5 * s);
  }

  // ---------------------------------------------------------------- the smaller settlements
  private buildSettlements(batch: P.PropBatch): void {
    this.batchRef = batch;
    const L = LAYOUT;
    const r = rng(77);

    // --- Candlewick: market stalls on the square and a smithy
    const v = L.village;
    const stallCols = ['8a2c18', '3a5a8a', '5a7a3a'];
    [[-8, 4, 0.3], [-6, 8.5, 0.9], [0, 9.5, 1.6]].forEach(([dx, dz, ry], i) => {
      const x = v.x + dx;
      const z = v.z + dz;
      this.prop(P.marketStallGeometry(stallCols[i]), x, z, ry, { hx: 1.35, hz: 0.65 });
      const l = (lx: number, lz: number): [number, number] => [x + lx * Math.cos(ry) + lz * Math.sin(ry), z - lx * Math.sin(ry) + lz * Math.cos(ry)];
      const [sx2, sz2] = l(1.9, -0.2);
      const [lookX, lookZ] = l(1.9, -4);
      this.spot('stall' + i, sx2, sz2, lookX, lookZ);
      const [bx2, bz2] = l(-0.3, -1.75);
      this.spot('buyer' + i, bx2, bz2, x, z);
    });
    const fx = v.x + 17;
    const fz = v.z + 12;
    const fry = -0.6;
    // local (prop) coordinates → world, matching P.place's rotation about y
    const loc = (lx: number, lz: number): [number, number] => [fx + lx * Math.cos(fry) + lz * Math.sin(fry), fz - lx * Math.sin(fry) + lz * Math.cos(fry)];
    this.prop(P.forgeGeometry(), fx, fz, fry, { hx: 0.95, hz: 0.75 });
    const [ax, az] = loc(1.8, -0.4);
    this.box(ax, az, 0.4, 0.3, -fry);
    this.light(0xff6a20, 6, 12, fx, this.y(fx, fz) + 1.6, fz);
    const [smx, smz] = loc(1.8, -1.25);
    this.spot('smith', smx, smz, ax, az);
    this.spot('square', v.x + 1, v.z + 4);

    // --- Reedwater: a fishing hamlet on the western shore of Hollowmere
    const rw = L.reedwater;
    [[-9, 3], [-4, -8], [6, 9], [-10, -5]].forEach(([dx, dz], i) => this.building(P.houseGeometry(i + 2), P.HOUSE_HALF, rw.x + dx, rw.z + dz, rw.x, rw.z));
    // the jetty runs from the shore out into the lake
    const dir = new THREE.Vector2(L.lake.x - rw.x, L.lake.z - rw.z).normalize();
    let sx = rw.x;
    let sz = rw.z;
    for (let k = 0; k < 60 && this.y(sx, sz) > 0.6; k++) {
      sx += dir.x;
      sz += dir.y;
    }
    const jLen = 12;
    const jry = Math.atan2(-dir.x, -dir.y);
    const deck = 0.9;
    batch.add(P.place(P.jettyGeometry(jLen, deck), sx - dir.x * 1.5, 0, sz - dir.y * 1.5, jry));
    const jcx = sx + dir.x * (jLen / 2 - 1.5);
    const jcz = sz + dir.y * (jLen / 2 - 1.5);
    this.platforms.push({ x: jcx, z: jcz, hx: 1.1, hz: jLen / 2, rot: -jry, y: deck });
    const endX = sx + dir.x * (jLen - 2.5);
    const endZ = sz + dir.y * (jLen - 2.5);
    this.spot('fisher0', endX, endZ, endX + dir.x * 5, endZ + dir.y * 5);
    this.spot('fisher1', sx + dir.x * 5 + dir.y * 0.7, sz + dir.y * 5 - dir.x * 0.7, sx + dir.x * 5 + dir.y * 6, sz + dir.y * 5 - dir.x * 6);
    this.light(0xffb040, 4, 12, endX, deck + 2, endZ);
    for (let i = 0; i < 2; i++) {
      const bx = sx + dir.x * (4 + i * 4) + dir.y * (2.6 + i * 0.4);
      const bz = sz + dir.y * (4 + i * 4) - dir.x * (2.6 + i * 0.4);
      batch.add(P.place(P.boatGeometry(), bx, -0.15, bz, jry + 0.2 * i));
    }
    this.prop(P.boatGeometry(), rw.x + 3, rw.z - 3, 1.1, { hx: 0.6, hz: 1.7 });
    this.prop(P.dryingRackGeometry(), rw.x - 2, rw.z + 5, 0.4, { hx: 1.4, hz: 0.2 });
    this.prop(P.dryingRackGeometry(), rw.x + 4, rw.z + 2, -0.5, { hx: 1.4, hz: 0.2 });
    this.prop(P.barrelGeometry(), rw.x + 1.5, rw.z - 6, 0, { r: 0.45 });
    this.prop(P.crateGeometry(), rw.x + 2.6, rw.z - 6.4, 0.4, { hx: 0.55, hz: 0.55 });
    this.prop(P.campfireGeometry(), rw.x - 3, rw.z - 1, 0, { r: 1.1 });
    this.light(0xff9030, 7, 14, rw.x - 3, this.y(rw.x - 3, rw.z - 1) + 1.2, rw.z - 1);
    this.spot('rw_fire0', rw.x - 3, rw.z + 1.2, rw.x - 3, rw.z - 1);
    this.spot('rw_fire1', rw.x - 5.1, rw.z - 1.6, rw.x - 3, rw.z - 1);
    this.spot('rw_rack', rw.x - 2, rw.z + 6.2, rw.x - 2, rw.z + 5);
    this.lamp(rw.x + 7, rw.z - 2, 0.5);

    // --- Fellstead: woodcutters at the edge of the Whisperwood
    const fs = L.fellstead;
    [[-10, -4], [-3, 10], [9, 6]].forEach(([dx, dz], i) => this.building(P.logCabinGeometry(i), P.CABIN_HALF, fs.x + dx, fs.z + dz, fs.x, fs.z));
    this.prop(P.logPileGeometry(), fs.x + 6, fs.z - 7, 0.3, { hx: 1.6, hz: 0.9 });
    this.prop(P.logPileGeometry(), fs.x + 9, fs.z - 3, 1.2, { hx: 1.6, hz: 0.9 });
    this.prop(P.sawhorseGeometry(), fs.x - 2, fs.z - 6, 0.8, { hx: 0.9, hz: 0.3 });
    for (let i = 0; i < 3; i++) {
      const cx = fs.x + [2, -5, 5][i];
      const cz = fs.z + [-3, 3, 2][i];
      this.prop(P.chopBlockGeometry(), cx, cz, i, { r: 0.45 });
      this.spot('chop' + i, cx + 0.9, cz + 0.4, cx, cz);
    }
    this.prop(P.campfireGeometry(), fs.x, fs.z + 4, 0, { r: 1.1 });
    this.light(0xff9030, 7, 14, fs.x, this.y(fs.x, fs.z + 4) + 1.2, fs.z + 4);
    this.spot('fs_fire0', fs.x, fs.z + 6.2, fs.x, fs.z + 4);
    this.spot('fs_fire1', fs.x - 2.1, fs.z + 3.4, fs.x, fs.z + 4);
    this.spot('saw', fs.x - 2, fs.z - 7.1, fs.x - 2, fs.z - 6);
    this.lamp(fs.x - 7, fs.z + 3);
    // tree stumps all around
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = 12 + r() * 10;
      const x = fs.x + Math.cos(a) * d;
      const z = fs.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3 || !this.free(x, z, 1)) continue;
      this.prop(P.chopBlockGeometry(), x, z, a, { r: 0.45 });
    }

    // --- Stiltwick: marsh folk in huts on stilts, reeds drying in bundles
    const sw = L.stiltwick;
    [[-9, -2], [-2, 9], [8, 5], [6, -8]].forEach(([dx, dz]) => {
      const x = sw.x + dx;
      const z = sw.z + dz;
      const ry = Math.atan2(sw.x - x, sw.z - z);
      batch.add(P.place(P.stiltHutGeometry(), x, this.y(x, z), z, ry));
      this.box(x, z, 2.2, 1.9, -ry);
    });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const x = sw.x + Math.cos(a) * 4.5;
      const z = sw.z + Math.sin(a) * 4.5;
      if (distToPath(x, z) < 2.2) continue;
      this.prop(P.reedBundleGeometry(), x, z, a, { r: 0.35 });
    }
    this.prop(P.dryingRackGeometry(), sw.x + 1, sw.z - 2, 1.2, { hx: 1.4, hz: 0.2 });
    this.spot('reeds0', sw.x + 12, sw.z - 2, sw.x + 18, sw.z - 4);
    this.spot('reeds1', sw.x - 13, sw.z + 6, sw.x - 18, sw.z + 9);
    this.spot('sw_rack', sw.x + 1 - Math.sin(1.2) * 1.2, sw.z - 2 - Math.cos(1.2) * 1.2, sw.x + 1, sw.z - 2);
    this.lamp(sw.x - 3, sw.z - 6, 1);
    this.lamp(sw.x + 4, sw.z + 3);

    // --- Cairnfold: shepherds on the High Moor
    const cf = L.cairnfold;
    [[-8, -3], [6, -7]].forEach(([dx, dz], i) => this.building(P.stoneCottageGeometry(i), P.COTTAGE_HALF, cf.x + dx, cf.z + dz, cf.x, cf.z));
    // the sheep pen
    const pen = { x: cf.x + 4, z: cf.z + 9 };
    const fence = P.fenceGeometry();
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 6) {
      if (Math.abs(a - Math.PI * 1.5) < 0.1) continue; // the gate
      const x = pen.x + Math.cos(a) * 6;
      const z = pen.z + Math.sin(a) * 6;
      const ry = -a + Math.PI / 2;
      batch.add(P.place(fence, x, this.y(x, z), z, ry));
      this.box(x, z, 1.55, 0.1, -ry);
    }
    this.spots.set('pen', { x: pen.x, z: pen.z, yaw: 0 });
    for (let i = 0; i < 5; i++) {
      const a = r() * Math.PI * 2;
      const x = cf.x + Math.cos(a) * (16 + r() * 8);
      const z = cf.z + Math.sin(a) * (16 + r() * 8);
      if (distToPath(x, z) < 3 || !this.free(x, z, 1.5)) continue;
      this.prop(P.cairnGeometry(), x, z, a, { r: 0.7 });
    }
    this.prop(P.wellGeometry(), cf.x - 1, cf.z + 1, 0, { r: 1.35 });
    this.spot('shepherd', pen.x - 7.5, pen.z - 2, pen.x, pen.z);
    this.spot('cf_well', cf.x - 1, cf.z + 3, cf.x - 1, cf.z + 1);
    this.lamp(cf.x + 2, cf.z - 2);
    this.batchRef = null;
  }

  // ---------------------------------------------------------------- farm & windmill
  private buildFarm(batch: P.PropBatch): void {
    const f = LAYOUT.farm;
    const colors = ['5a8a3a', '8a8a3a', '4a7a40'];
    for (let field = 0; field < 3; field++) {
      const fx = f.x - 14 + field * 13;
      const fz = f.z + 2;
      const row = P.cropRowGeometry(16, colors[field]);
      for (let i = 0; i < 9; i++) {
        const x = fx - 4.8 + i * 1.2;
        if (distToPath(x, fz) < 3) continue;
        batch.add(P.place(row, x, this.y(x, fz), fz, 0));
      }
    }
    const fence = P.fenceGeometry();
    for (let i = 0; i < 14; i++) {
      for (const [x, z, ry] of [[f.x - 21 + i * 3, f.z - 8, 0], [f.x - 21 + i * 3, f.z + 12, 0]] as [number, number, number][]) {
        if (distToPath(x, z) < 3.4) continue;
        batch.add(P.place(fence, x, this.y(x, z), z, ry));
        this.box(x, z, 1.55, 0.1, 0);
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = f.x + 20;
      const z = f.z - 4 + i * 4;
      batch.add(P.place(P.hayBaleGeometry(), x, this.y(x, z), z, 0.2 * i));
      this.box(x, z, 0.7, 0.8, -0.2 * i);
    }

    const w = LAYOUT.windmill;
    const wy = this.y(w.x, w.z);
    batch.add(P.place(P.windmillGeometry(), w.x, wy, w.z, 0.4));
    this.circle(w.x, w.z, 2.7);
    // the sails turn slowly – a separate mesh so it can rotate
    const sails = P.windmillSailsGeometry();
    for (const [k, geo] of Object.entries(sails) as [P.MatKey, THREE.BufferGeometry][]) {
      P.applyBoxUV(geo, this.texScale(k));
      const m = new THREE.Mesh(geo, this.mats.get(k));
      m.castShadow = true;
      this.sails.add(m);
    }
    const hub = new THREE.Group();
    hub.position.set(w.x - Math.sin(0.4) * 2.9, wy + 8.4, w.z - Math.cos(0.4) * 2.9);
    hub.rotation.y = 0.4;
    hub.add(this.sails);
    this.scene.add(hub);
    this.interactables.push({ id: 'windmill', x: w.x - Math.sin(0.4) * 3.4, z: w.z - Math.cos(0.4) * 3.4, radius: 3, verb: 'Look', dialogue: 'windmill' });
  }

  // ---------------------------------------------------------------- old places
  private buildOldSites(batch: P.PropBatch): void {
    const r = rng(9);
    // the stone circle: nine places, but only eight stones – one was never raised
    const s = LAYOUT.stones;
    for (let i = 0; i < 9; i++) {
      if (i === 6) continue;
      const a = (i / 9) * Math.PI * 2;
      const x = s.x + Math.cos(a) * 7;
      const z = s.z + Math.sin(a) * 7;
      const h = 2.8 + r() * 1.2;
      batch.add(P.place(P.standingStoneGeometry(h), x, this.y(x, z), z, -a));
      this.box(x, z, 0.55, 0.35, a);
    }
    this.interactables.push({ id: 'stone_circle', x: s.x, z: s.z, radius: 4, verb: 'Look', dialogue: 'stone_circle' });
    this.light(0x9ab0ff, 3, 14, s.x, this.y(s.x, s.z) + 2, s.z);

    // the ruined watch tower on the northern hill
    const t = LAYOUT.ruin;
    batch.add(P.place(P.ruinTowerGeometry(), t.x, this.y(t.x, t.z), t.z, 0));
    for (let i = 0; i < 14; i++) {
      if (i === 3 || i === 4) continue;
      const a = (i / 14) * Math.PI * 2;
      this.box(t.x + Math.cos(a) * 4, t.z + Math.sin(a) * 4, 0.95, 0.45, a - Math.PI / 2);
    }
    this.interactables.push({ id: 'ruin_tower', x: t.x, z: t.z, radius: 3.5, verb: 'Look', dialogue: 'ruin_tower' });

    // a forest camp with a fire
    const c = LAYOUT.camp;
    const cy = this.y(c.x, c.z);
    batch.add(P.place(P.campfireGeometry(), c.x, cy, c.z, 0));
    batch.add(P.place(P.tentGeometry(), c.x + 3.5, this.y(c.x + 3.5, c.z - 2), c.z - 2, 0.6));
    this.circle(c.x, c.z, 1.1);
    this.box(c.x + 3.5, c.z - 2, 1.4, 1.3, -0.6);
    this.light(0xff9030, 9, 16, c.x, cy + 1.2, c.z);
    this.interactables.push({ id: 'campfire', x: c.x, z: c.z, radius: 3, verb: 'Rest', dialogue: 'campfire' });
  }

  private buildMine(batch: P.PropBatch): void {
    const { x, z } = LAYOUT.mine;
    batch.add(P.place(P.mineEntranceGeometry(), x, this.y(x, z) - 0.3, z, Math.PI * 0.85));
    this.circle(x, z, 2.6);
    this.circle(x - 3.4, z + 2, 2.6);
    this.circle(x + 3.4, z - 2, 2.6);
    this.light(0x40ff40, 4, 14, x - 0.5, this.y(x, z) + 2, z - 1.5);
    this.interactables.push({ id: 'mine', x, z: z - 3, radius: 3.4, verb: 'Look', dialogue: 'mine_entrance' });
  }

  // ---------------------------------------------------------------- the outer lands
  private buildOuterLands(batch: P.PropBatch): void {
    const r = rng(1234);
    // forgotten bell towers – ring them and the vale remembers
    for (const b of LAYOUT.bells) {
      const y = this.footY(b.x, b.z, 1.7, 1.7, 0);
      batch.add(P.place(P.forgottenBellTowerGeometry(), b.x, y, b.z, 0));
      this.box(b.x, b.z, 1.7, 1.7, 0);
      const glow = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.22, 0.2) }));
      glow.position.set(b.x, y + 10, b.z);
      const light = this.light(0xffb040, 0, 26, b.x, y + 10, b.z, false);
      this.scene.add(glow);
      this.bellLights.set(b.id, { light, glow });
      this.interactables.push({ id: 'bell_' + b.id, x: b.x, z: b.z + 2.6, radius: 3.2, verb: 'Ring', dialogue: 'bell_' + b.id });
    }

    // the Sallow Marsh: a stilt hut, dead trees, glowing lily pads on the pools
    const hx = -232;
    const hz = 206;
    batch.add(P.place(P.stiltHutGeometry(), hx, this.y(hx, hz), hz, 0.3));
    this.box(hx, hz, 2.3, 2.0, -0.3);
    this.light(0xffa040, 4, 14, hx + 1, this.y(hx, hz) + 3.6, hz + 2);
    this.interactables.push({ id: 'marsh_hut', x: hx - 0.5, z: hz + 3.4, radius: 3, verb: 'Knock', dialogue: 'marsh_hut' });
    const pad = P.lilyPadGeometry();
    const dead = P.deadTreeGeometry();
    const shroom = P.mushroomGeometry();
    const m = LAYOUT.marsh;
    for (let i = 0; i < 900; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * m.radius;
      const x = m.x + Math.cos(a) * d;
      const z = m.z + Math.sin(a) * d;
      const y = this.y(x, z);
      if (y < -0.25 && r() < 0.25) batch.add(P.place(pad, x, 0.01, z, r() * 6, 0.6 + r() * 0.8));
      else if (y > 0.2 && r() < 0.03 && this.free(x, z, 1)) {
        batch.add(P.place(dead, x, y - 0.1, z, r() * 6, 1 + r() * 0.8));
        this.circle(x, z, 0.35);
      } else if (y > 0.2 && r() < 0.008 && this.free(x, z, 2)) {
        const s = 0.8 + r() * 1.2;
        batch.add(P.place(shroom, x, y - 0.1, z, r() * 6, s));
        this.circle(x, z, 0.55 * s);
      }
    }
    this.light(0x60ff60, 4, 18, m.x + 20, 3, m.z - 10);
    this.light(0x60ff60, 4, 18, m.x - 30, 3, m.z + 25);

    // Aldersey: the first village the world forgot – grey, silent, half gone
    const al = LAYOUT.aldersey;
    const grey = new P.PropBatch();
    const spots: [number, number][] = [[-10, -6], [0, -12], [11, -5], [8, 9], [-8, 8]];
    spots.forEach(([dx, dz], i) => {
      const x = al.x + dx;
      const z = al.z + dz;
      const ry = Math.round(Math.atan2(-dx, -dz) / (Math.PI / 4)) * (Math.PI / 4);
      grey.add(P.place(P.houseGeometry(i + 3), x, this.footY(x, z, P.HOUSE_HALF.hx, P.HOUSE_HALF.hz, -ry), z, ry));
      this.box(x, z, P.HOUSE_HALF.hx, P.HOUSE_HALF.hz, -ry);
    });
    grey.add(P.place(P.wellGeometry(), al.x, this.y(al.x, al.z), al.z));
    this.circle(al.x, al.z, 1.35);
    const greyMat = new THREE.MeshLambertMaterial({ color: 0xb0aebb, transparent: true, opacity: 0.8 });
    for (const [, geo] of grey.merged()) {
      const mesh = new THREE.Mesh(geo, greyMat);
      mesh.castShadow = true;
      this.scene.add(mesh);
    }
    this.interactables.push({ id: 'aldersey', x: al.x, z: al.z + 2, radius: 4, verb: 'Look', dialogue: 'aldersey' });
    for (let i = 0; i < 40; i++) {
      const x = LAYOUT.hush.x + (r() - 0.5) * 160;
      const z = LAYOUT.hush.z + (r() - 0.5) * 160;
      if (hushFactor(x, z) < 0.4 || !this.free(x, z, 1.5) || distToPath(x, z) < 3) continue;
      batch.add(P.place(dead, x, this.y(x, z) - 0.1, z, r() * 6, 1 + r() * 0.8));
      this.circle(x, z, 0.35);
    }
  }

  /** Light the lamp of a rung bell tower. */
  lightBell(id: string): void {
    const b = this.bellLights.get(id);
    if (!b) return;
    b.light.intensity = 10;
    (b.glow.material as THREE.MeshBasicMaterial).color.setRGB(3, 2, 0.7);
  }

  /** 0..1 – how deep in the Hush a point is. */
  hushAt(x: number, z: number): number {
    return hushFactor(x, z);
  }

  // ---------------------------------------------------------------- forest
  private sitesClear(x: number, z: number, m: number): boolean {
    for (const s of [LAYOUT.village, LAYOUT.cemetery, LAYOUT.farm, LAYOUT.stones, LAYOUT.ruin, LAYOUT.aldersey, LAYOUT.reedwater, LAYOUT.fellstead, LAYOUT.stiltwick, LAYOUT.cairnfold]) {
      if (Math.hypot(x - s.x, z - s.z) < s.radius + 6 + m) return false;
    }
    for (const b of LAYOUT.bells) if (Math.hypot(x - b.x, z - b.z) < 6 + m) return false;
    for (const p of [LAYOUT.mine, LAYOUT.camp, LAYOUT.windmill]) if (Math.hypot(x - p.x, z - p.z) < 8 + m) return false;
    return true;
  }

  private scatterInstanced(prop: P.Prop, max: number, place: (r: () => number) => [number, number, number] | null, trunk: number, seed: number): void {
    const r = rng(seed);
    const parts = (Object.entries(prop) as [P.MatKey, THREE.BufferGeometry][]).map(([k, geo]) => {
      P.applyBoxUV(geo, this.texScale(k));
      return [k, geo] as const;
    });
    // collect the instances per 96 m tile so each tile can be culled when it is off screen
    const TILE = 96;
    const tiles = new Map<string, { m: THREE.Matrix4; c: number }[]>();
    const q = new THREE.Quaternion();
    let count = 0;
    for (let tries = 0; count < max && tries < max * 20; tries++) {
      const spot = place(r);
      if (!spot) continue;
      const [x, z, s] = spot;
      if (trunk > 0 && !this.free(x, z, trunk * s + 0.4)) continue;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, this.y(x, z) - 0.15, z), q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
      const key = Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
      const list = tiles.get(key) ?? [];
      list.push({ m, c: 0.75 + r() * 0.4 });
      tiles.set(key, list);
      if (trunk > 0) this.circle(x, z, trunk * s);
      count++;
    }
    const tint = new THREE.Color();
    for (const list of tiles.values()) {
      for (const [k, geo] of parts) {
        const mesh = new THREE.InstancedMesh(geo, this.mats.get(k), list.length);
        list.forEach((it, i) => {
          mesh.setMatrixAt(i, it.m);
          mesh.setColorAt(i, tint.setScalar(it.c));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    }
  }

  private buildForest(batch: P.PropBatch): void {
    const half = LAYOUT.size / 2;
    const W = LAYOUT.riverWidth;
    const okGround = (x: number, z: number, m: number) =>
      Math.hypot(x, z) < 378 && lakeFactor(x, z) > 1.25 && distToRiver(x, z) > W * 1.9 && distToPath(x, z) > 4.5 &&
      this.sitesClear(x, z, m) && hushFactor(x, z) < 0.25 && this.y(x, z) > 0.3;
    const ww = LAYOUT.whisperwood;
    const moor = LAYOUT.moor;
    // pines: the Whisperwood is dense and dark, the valley walls wooded, the moor almost bare
    this.scatterInstanced(P.pineGeometry(), 3200, (r) => {
      const x = (r() - 0.5) * 2 * half;
      const z = (r() - 0.5) * 2 * half;
      if (!okGround(x, z, 4)) return null;
      const rad = Math.hypot(x, z);
      const inWood = 1 - Math.min(1, Math.hypot(x - ww.x, z - ww.z) / ww.radius);
      const onMoor = Math.hypot(x - moor.x, z - moor.z) < moor.radius;
      const dense = onMoor ? 0.02 : 0.06 + inWood * 1.4 + (rad > 300 ? 0.5 : 0) + (x > 70 && z < 0 ? 0.15 : 0);
      if (r() > dense) return null;
      return [x, z, 0.8 + r() * 0.9 + inWood * 0.5];
    }, 0.45, 412);
    // broadleaf trees in groups around the meadows
    for (let v = 0; v < 2; v++) {
      this.scatterInstanced(P.oakGeometry(v), 380, (r) => {
        const x = (r() - 0.5) * 2 * 330;
        const z = (r() - 0.5) * 2 * 330;
        if (!okGround(x, z, 5)) return null;
        if (Math.sin(x * 0.04) * Math.cos(z * 0.05) < 0.1) return null; // clustered groves
        return [x, z, 0.8 + r() * 0.5];
      }, 0.5, 700 + v);
    }
    this.scatterInstanced(P.bushGeometry(), 900, (r) => {
      const x = (r() - 0.5) * 2 * 340;
      const z = (r() - 0.5) * 2 * 340;
      if (!okGround(x, z, 2)) return null;
      return [x, z, 0.7 + r() * 0.8];
    }, 0.6, 801);

    const r = rng(77);
    // rocks along the lake shore and the river banks
    const rock = P.rockGeometry();
    for (let i = 0; i < 360; i++) {
      let x: number;
      let z: number;
      if (i < 40) {
        const a = r() * Math.PI * 2;
        const d = LAYOUT.lake.radius * (1.05 + r() * 0.35);
        x = LAYOUT.lake.x + Math.cos(a) * d;
        z = LAYOUT.lake.z + Math.sin(a) * d;
      } else {
        x = (r() - 0.5) * 700;
        z = (r() - 0.5) * 700;
        const rd = distToRiver(x, z);
        if (rd < W * 1.2 || rd > W * 2.6) continue;
      }
      if (distToPath(x, z) < 3 || !this.sitesClear(x, z, 1)) continue;
      const s = 0.4 + r() * 1.0;
      batch.add(P.place(rock, x, this.y(x, z) - 0.1, z, r() * 6, s));
      if (s > 0.55) this.circle(x, z, s * 0.85);
    }

    const shroom = P.mushroomGeometry();
    const spots: [number, number, number][] = [[-22, 30, 1.4], [-28, 22, 0.9], [18, 34, 1.7], [24, 28, 1.0], [-30, -4, 1.2], [70, 30, 1.5], [62, 38, 0.8], [-58, -52, 1.1], [150, -40, 1.6], [-80, 70, 1.3], [190, -170, 2.0], [230, -230, 1.6], [250, -180, 1.2], [176, -232, 1.8]];
    for (const [x, z, s] of spots) {
      batch.add(P.place(shroom, x, this.y(x, z) - 0.1, z, r() * 6, s));
      this.circle(x, z, 0.55 * s);
    }
    this.light(0x60ff60, 4, 16, 21, this.y(21, 31) + 2.5, 31);
    this.light(0x60ff60, 3, 14, -25, this.y(-25, 26) + 2.5, 26);

    const dead = P.deadTreeGeometry();
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.cemetery.radius + 6 + r() * 8;
      const x = LAYOUT.cemetery.x + Math.cos(a) * d;
      const z = LAYOUT.cemetery.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3 || !this.free(x, z, 0.6)) continue;
      batch.add(P.place(dead, x, this.y(x, z) - 0.1, z, r() * 6, 0.9 + r() * 0.7));
      this.circle(x, z, 0.35);
    }
  }

  // ---------------------------------------------------------------- grass & flowers
  private buildGrass(): void {
    const grass = new GrassField(this.terrain, grassSprite(), { count: 16000, tile: 56, size: 0.9, seed: 314, hue: 0.33, light: 0.42 });
    const flowers = new GrassField(this.terrain, flowerSprite(), { count: 1400, tile: 56, size: 0.55, seed: 315, hue: 0.33, light: 0.75 });
    grass.mesh.receiveShadow = true;
    flowers.mesh.receiveShadow = true;
    this.fields.push(grass, flowers);
    this.scene.add(grass.mesh, flowers.mesh);
  }

  setGrassDensity(f: number): void {
    for (const g of this.fields) g.setDensity(f);
  }

  // ---------------------------------------------------------------- atmosphere
  private buildAtmosphere(): void {
    const r = rng(99);
    // fireflies drift around wherever the player is
    const n = 260;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.fireflyOffsets = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.fireflyOffsets.set([r() * 70, 0.5 + r() * 2.4, r() * 70], i * 3);
      col.set(r() > 0.3 ? [1.4, 1.3, 0.6] : [0.7, 1.4, 0.5], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fireflies = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.32, vertexColors: true, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);

    const tex = mistSprite();
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) spots.push([(r() - 0.5) * 640, (r() - 0.5) * 640, 0x6a8a9a]);
    for (let i = 0; i < 18; i++) spots.push([LAYOUT.marsh.x + (r() - 0.5) * 180, LAYOUT.marsh.z + (r() - 0.5) * 180, 0x5a8a6a]);
    for (let i = 0; i < 24; i++) spots.push([LAYOUT.hush.x + (r() - 0.5) * 180, LAYOUT.hush.z + (r() - 0.5) * 180, 0xc0bec8]);
    for (const [x, z, color] of spots) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.26, depthWrite: false, fog: true }));
      s.scale.set(30, 7, 1);
      s.position.set(x, Math.max(0, this.y(x, z)) + 1.6, z);
      s.userData.base = s.position.clone();
      s.userData.phase = r() * 10;
      this.mist.push(s);
      this.scene.add(s);
    }
  }

  /** How strongly the Hush is felt at the player's position (smoothed). */
  hushHere = 0;

  /** Per-frame animation: sky, flickering lights, fireflies, mist, windmill, water. */
  update(dt: number, hour: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.fields) f.update(dt, focus);
    this.sky.update(dt, hour, focus, camera, this.fog);
    // in the Hush the world turns grey and the fog closes in
    this.hushHere += (hushFactor(focus.x, focus.z) - this.hushHere) * Math.min(1, dt * 1.5);
    this.baseFog.copy(this.fog.color);
    this.fog.color.lerp(new THREE.Color(0x8a8892), this.hushHere * 0.8);
    this.fog.density = 0.0095 + this.hushHere * 0.03;
    const night = this.sky.state.night;
    for (const [m, mult] of this.glowMats) m.color.setScalar(mult * (0.75 + night * 0.35));
    for (const f of this.flickerLights) {
      f.light.intensity = f.base * (0.75 + night * 0.4) * (0.9 + Math.sin(t * 8.3 + f.phase) * 0.05 + Math.sin(t * 21.7 + f.phase) * 0.05);
    }
    const pulse = Math.max(0, Math.sin(t * 0.45)) ** 3;
    this.lakeGlow.intensity = 2 + pulse * 8;
    (this.lakeGlowMesh.material as THREE.MeshBasicMaterial).color.setRGB(1 + pulse * 3, 0.6 + pulse * 2, 0.2 + pulse * 0.6);
    this.sails.rotation.z = t * 0.35;
    const wu = this.waterMat.uniforms;
    wu.uTime.value = t;
    wu.uSky.value.copy(this.sky.state.horizon).lerp(this.sky.state.top, 0.4).multiplyScalar(1.1);
    wu.uMoonDir.value.copy(this.sky.moonLight.position).sub(focus).normalize();
    wu.uMoonColor.value.copy(this.sky.moonLight.color);

    const pos = this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute;
    const o = this.fireflyOffsets;
    for (let i = 0; i < pos.count; i++) {
      const b = i * 3;
      const x = focus.x + (((o[b] - focus.x + 35) % 70) + 70) % 70 - 35 + Math.sin(t * 0.6 + i) * 0.8;
      const z = focus.z + (((o[b + 2] - focus.z + 35) % 70) + 70) % 70 - 35 + Math.cos(t * 0.5 + i * 0.7) * 0.8;
      pos.setXYZ(i, x, Math.max(0, this.y(x, z)) + o[b + 1] + Math.sin(t * 1.3 + i * 1.7) * 0.35, z);
    }
    pos.needsUpdate = true;
    (this.fireflies.material as THREE.PointsMaterial).opacity = 0.35 + night * 0.65;

    for (const s of this.mist) {
      const base = s.userData.base as THREE.Vector3;
      s.position.x = base.x + Math.sin(t * 0.05 + s.userData.phase) * 6;
      s.position.z = base.z + Math.cos(t * 0.04 + s.userData.phase) * 4;
    }
    this.assignLights(focus);
  }

  /**
   * A fixed number of real point lights (so the shaders never change and every
   * pixel only pays for a few lights) is handed to the nearest light sources.
   */
  private assignLights(focus: THREE.Vector3): void {
    if (!this.lightPool.length) {
      for (let i = 0; i < LIGHT_POOL; i++) {
        const l = new THREE.PointLight(0xffffff, 0, 10, 1.6);
        this.lightPool.push(l);
        this.scene.add(l);
      }
    }
    const ranked = this.lightSources
      .filter((l) => l.intensity > 0.01)
      .map((l) => ({ l, d: l.position.distanceTo(focus) - l.distance }))
      .filter((r) => r.d < 30)
      .sort((a, b) => a.d - b.d);
    for (let i = 0; i < LIGHT_POOL; i++) {
      const p = this.lightPool[i];
      const r = ranked[i];
      if (!r) {
        p.intensity = 0;
        continue;
      }
      // fade in/out near the edge of the pool's reach so lights do not pop
      const fade = Math.min(1, Math.max(0, (30 - r.d) / 10));
      p.position.copy(r.l.position);
      p.color.copy(r.l.color);
      p.distance = r.l.distance;
      p.intensity = r.l.intensity * fade;
    }
  }
}

/** A lamp or fire. Not a real light – see World.assignLights. */
export interface LightSource {
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
}
const LIGHT_POOL = 6;

/** Intersection point of two 2D segments, or null. */
function segmentIntersection(a: number[], b: number[], c: number[], d: number[]): [number, number] | null {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}
