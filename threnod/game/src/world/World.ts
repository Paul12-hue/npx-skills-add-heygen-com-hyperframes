import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { LAYOUT, Terrain, distToPath, distToRiver, lakeFactor } from './terrain';
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

/** Water shader: the mirrored scene, darkened, tinted and gently rippling. */
const WaterShader = {
  name: 'ThrenodWater',
  uniforms: {
    color: { value: new THREE.Color(0x4a6a78) },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 color;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec4 vUv;
    varying vec3 vWorld;
    #include <logdepthbuf_pars_fragment>
    void main() {
      #include <logdepthbuf_fragment>
      vec2 w = vWorld.xz;
      vec2 ripple = vec2(
        sin(w.x * 0.9 + uTime * 1.3) + sin(w.y * 1.7 - uTime * 0.9),
        cos(w.y * 1.1 + uTime * 1.1) + sin(w.x * 1.3 + uTime * 0.7)
      ) * 0.006;
      vec4 uv = vUv;
      uv.xy += ripple * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 deep = vec3(0.02, 0.05, 0.07);
      gl_FragColor = vec4(mix(deep, refl * color * 1.6, 0.75), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

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
  private flickerLights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private lakeGlow!: THREE.PointLight;
  private lakeGlowMesh!: THREE.Mesh;
  private fireflies!: THREE.Points;
  private fireflyOffsets!: Float32Array;
  private mist: THREE.Sprite[] = [];
  private fields: GrassField[] = [];
  private sails = new THREE.Group();
  private mirror!: Reflector;
  private plainWater!: THREE.Mesh;
  private time = 0;

  constructor() {
    this.textures = createTextures();
    this.scene.fog = this.fog;
    this.terrain = new Terrain(this.textured(this.textures.ground, { shininess: 8, bump: 1.2, repeat: 1 }));
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
    this.buildForest(batch); // last: trees avoid everything placed before
    this.flush(batch);
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
    this.colliders.push({ x, z, hx, hz, rot });
  }

  private circle(x: number, z: number, r: number): void {
    this.colliders.push({ x, z, r });
  }

  /** Is the spot free of obstacles (for scattering trees and clutter)? */
  private free(x: number, z: number, margin: number): boolean {
    for (const c of this.colliders) {
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

  private buildMaterials(): void {
    const t = this.textures;
    const m = this.mats;
    m.set('stone', this.textured(t.stone, { shininess: 30, bump: 2.5, specular: 0x30303a }));
    m.set('wood', this.textured(t.wood, { shininess: 20, bump: 1.5 }));
    m.set('darkwood', this.textured(t.wood, { shininess: 25, bump: 1.8 }));
    m.set('shingle', this.textured(t.shingle, { shininess: 45, bump: 3, specular: 0x404050 }));
    m.set('plaster', this.textured(t.plaster, { shininess: 10, bump: 1.2 }));
    m.set('organic', this.textured(t.organic, { shininess: 15, bump: 2 }));
    m.set('foliage', this.textured(t.organic, { shininess: 18, bump: 0.6, specular: 0x163a2a }));
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

  private light(color: number, intensity: number, distance: number, x: number, y: number, z: number, flicker = true): THREE.PointLight {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    this.scene.add(l);
    if (flicker) this.flickerLights.push({ light: l, base: intensity, phase: Math.random() * 10 });
    return l;
  }

  // ---------------------------------------------------------------- water
  private buildWater(batch: P.PropBatch): void {
    const { lake, waterLevel, size } = LAYOUT;
    // one water surface for the lake and both rivers; the terrain covers it everywhere else
    const geo = new THREE.PlaneGeometry(size, size);
    this.mirror = new Reflector(geo, { clipBias: 0.003, textureWidth: 512, textureHeight: 512, shader: WaterShader });
    this.mirror.rotation.x = -Math.PI / 2;
    this.mirror.position.y = waterLevel;
    this.mirror.name = 'water-mirror';
    this.plainWater = new THREE.Mesh(
      geo,
      new THREE.MeshPhongMaterial({ color: 0x0a1820, specular: 0x8aa0b0, shininess: 140, emissive: 0x02060a }),
    );
    this.plainWater.rotation.x = -Math.PI / 2;
    this.plainWater.position.y = waterLevel;
    this.plainWater.receiveShadow = true;
    this.plainWater.visible = false;
    this.scene.add(this.mirror, this.plainWater);

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

  /** Mirror reflections are expensive: only on medium/high quality. */
  setReflections(on: boolean): void {
    this.mirror.visible = on;
    this.plainWater.visible = !on;
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
          if (lit < 6 && lamp % 2 === 1) {
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

  // ---------------------------------------------------------------- forest
  private sitesClear(x: number, z: number, m: number): boolean {
    for (const s of [LAYOUT.village, LAYOUT.cemetery, LAYOUT.farm, LAYOUT.stones, LAYOUT.ruin]) {
      if (Math.hypot(x - s.x, z - s.z) < s.radius + m) return false;
    }
    for (const p of [LAYOUT.mine, LAYOUT.camp, LAYOUT.windmill]) if (Math.hypot(x - p.x, z - p.z) < 8 + m) return false;
    return true;
  }

  private scatterInstanced(prop: P.Prop, max: number, place: (r: () => number) => [number, number, number] | null, trunk: number, seed: number): void {
    const r = rng(seed);
    const meshes = (Object.entries(prop) as [P.MatKey, THREE.BufferGeometry][]).map(([k, geo]) => {
      P.applyBoxUV(geo, this.texScale(k));
      const m = new THREE.InstancedMesh(geo, this.mats.get(k), max);
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    });
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tint = new THREE.Color();
    let count = 0;
    for (let tries = 0; count < max && tries < max * 20; tries++) {
      const spot = place(r);
      if (!spot) continue;
      const [x, z, s] = spot;
      if (trunk > 0 && !this.free(x, z, trunk * s + 0.4)) continue;
      mtx.compose(new THREE.Vector3(x, this.y(x, z) - 0.15, z), q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
      tint.setScalar(0.75 + r() * 0.4);
      for (const m of meshes) {
        m.setMatrixAt(count, mtx);
        m.setColorAt(count, tint);
      }
      if (trunk > 0) this.circle(x, z, trunk * s);
      count++;
    }
    for (const m of meshes) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
    }
  }

  private buildForest(batch: P.PropBatch): void {
    const half = LAYOUT.size / 2;
    const W = LAYOUT.riverWidth;
    const okGround = (x: number, z: number, m: number) =>
      Math.hypot(x, z) < 212 && lakeFactor(x, z) > 1.25 && distToRiver(x, z) > W * 1.9 && distToPath(x, z) > 4.5 && this.sitesClear(x, z, m);
    // dense pine woods in the east and on the valley walls, open meadows elsewhere
    this.scatterInstanced(P.pineGeometry(), 1500, (r) => {
      const x = (r() - 0.5) * 2 * half;
      const z = (r() - 0.5) * 2 * half;
      if (!okGround(x, z, 4)) return null;
      const rad = Math.hypot(x, z);
      const dense = 0.12 + (x > 70 ? 0.4 : 0) + (rad > 140 ? 0.5 : 0) + (z < -90 ? 0.25 : 0);
      if (r() > dense) return null;
      return [x, z, 0.8 + r() * 0.8];
    }, 0.45, 412);
    // broadleaf trees in groups around the meadows
    for (let v = 0; v < 2; v++) {
      this.scatterInstanced(P.oakGeometry(v), 160, (r) => {
        const x = (r() - 0.5) * 2 * 170;
        const z = (r() - 0.5) * 2 * 170;
        if (!okGround(x, z, 5)) return null;
        if (Math.sin(x * 0.04) * Math.cos(z * 0.05) < 0.1) return null; // clustered groves
        return [x, z, 0.8 + r() * 0.5];
      }, 0.5, 700 + v);
    }
    this.scatterInstanced(P.bushGeometry(), 420, (r) => {
      const x = (r() - 0.5) * 2 * 190;
      const z = (r() - 0.5) * 2 * 190;
      if (!okGround(x, z, 2)) return null;
      return [x, z, 0.7 + r() * 0.8];
    }, 0.6, 801);

    const r = rng(77);
    // rocks along the lake shore and the river banks
    const rock = P.rockGeometry();
    for (let i = 0; i < 160; i++) {
      let x: number;
      let z: number;
      if (i < 40) {
        const a = r() * Math.PI * 2;
        const d = LAYOUT.lake.radius * (1.05 + r() * 0.35);
        x = LAYOUT.lake.x + Math.cos(a) * d;
        z = LAYOUT.lake.z + Math.sin(a) * d;
      } else {
        x = (r() - 0.5) * 380;
        z = (r() - 0.5) * 380;
        const rd = distToRiver(x, z);
        if (rd < W * 1.2 || rd > W * 2.6) continue;
      }
      if (distToPath(x, z) < 3 || !this.sitesClear(x, z, 1)) continue;
      const s = 0.4 + r() * 1.0;
      batch.add(P.place(rock, x, this.y(x, z) - 0.1, z, r() * 6, s));
      if (s > 0.55) this.circle(x, z, s * 0.85);
    }

    const shroom = P.mushroomGeometry();
    const spots: [number, number, number][] = [[-22, 30, 1.4], [-28, 22, 0.9], [18, 34, 1.7], [24, 28, 1.0], [-30, -4, 1.2], [70, 30, 1.5], [62, 38, 0.8], [-58, -52, 1.1], [150, -40, 1.6], [-80, 70, 1.3]];
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
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 320;
      const z = (r() - 0.5) * 320;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0x6a8a9a, transparent: true, opacity: 0.22, depthWrite: false, fog: true }));
      s.scale.set(30, 7, 1);
      s.position.set(x, Math.max(0, this.y(x, z)) + 1.6, z);
      s.userData.base = s.position.clone();
      s.userData.phase = r() * 10;
      this.mist.push(s);
      this.scene.add(s);
    }
  }

  /** Per-frame animation: sky, flickering lights, fireflies, mist, windmill, water. */
  update(dt: number, hour: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    const t = this.time;
    for (const f of this.fields) f.update(dt, focus);
    this.sky.update(dt, hour, focus, camera, this.fog);
    const night = this.sky.state.night;
    for (const [m, mult] of this.glowMats) m.color.setScalar(mult * (0.75 + night * 0.35));
    for (const f of this.flickerLights) {
      f.light.intensity = f.base * (0.75 + night * 0.4) * (0.9 + Math.sin(t * 8.3 + f.phase) * 0.05 + Math.sin(t * 21.7 + f.phase) * 0.05);
    }
    const pulse = Math.max(0, Math.sin(t * 0.45)) ** 3;
    this.lakeGlow.intensity = 2 + pulse * 8;
    (this.lakeGlowMesh.material as THREE.MeshBasicMaterial).color.setRGB(1 + pulse * 3, 0.6 + pulse * 2, 0.2 + pulse * 0.6);
    this.sails.rotation.z = t * 0.35;
    (this.mirror.material as THREE.ShaderMaterial).uniforms.uTime.value = t;

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
  }
}

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
