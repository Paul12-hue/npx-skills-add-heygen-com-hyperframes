import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { LAYOUT, Terrain, distToPath, lakeFactor } from './terrain';
import { rng } from './noise';
import * as P from './props';
import { Sky } from './Sky';
import { createTextures, flowerSprite, glowSprite, grassSprite, mistSprite, type TexPair, type TextureSet } from '../render/textures';

export interface Collider {
  x: number;
  z: number;
  r: number;
}

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
 * Builds the test slice of Hollowmere Vale in the "pre-rendered CGI" style:
 * glossy bump-mapped surfaces, violet lantern road, glowing windows, giant
 * toadstools, fireflies, drifting mist and a huge orange moon.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly textures: TextureSet;
  readonly terrain: Terrain;
  readonly sky = new Sky();
  readonly fog = new THREE.FogExp2(0x2a2470, 0.0062);
  readonly colliders: Collider[] = [];
  readonly interactables: InteractableDef[] = [];
  readonly spawn = new THREE.Vector3(LAYOUT.cemetery.x + 2.6, 0, LAYOUT.cemetery.z + 1.5);
  readonly spawnYaw = Math.PI * 0.75;
  private mats = new Map<P.MatKey, THREE.Material>();
  private glowMats: [THREE.MeshBasicMaterial, number][] = [];
  private flickerLights: { light: THREE.PointLight; base: number; phase: number }[] = [];
  private lakeGlow!: THREE.PointLight;
  private lakeGlowMesh!: THREE.Mesh;
  private fireflies!: THREE.Points;
  private fireflyBase!: Float32Array;
  private mist: THREE.Sprite[] = [];
  private time = 0;

  constructor() {
    this.textures = createTextures();
    this.scene.fog = this.fog;
    this.terrain = new Terrain(this.textured(this.textures.ground, { shininess: 8, bump: 1.2, repeat: 1 }));
    this.scene.add(this.terrain.mesh, this.sky.group);
    this.sky.addLightsTo(this.scene);
    this.buildMaterials();
    const batch = new P.PropBatch();
    this.buildWater(batch);
    this.buildRoads(batch);
    this.buildForest(batch);
    this.buildCemetery(batch);
    this.buildVillage(batch);
    this.buildMine(batch);
    this.flush(batch);
    this.buildAtmosphere();
    this.buildGrass();
    this.spawn.y = this.terrain.getHeight(this.spawn.x, this.spawn.z);
  }

  height(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
  }

  private y(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
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
      specular: new THREE.Color(o.specular ?? 0x2a2040),
      emissive: new THREE.Color(o.emissive ?? 0x000000),
      emissiveIntensity: o.emissiveIntensity ?? 1,
      flatShading: true, // faceted surfaces like an old 3D game
    });
  }

  private buildMaterials(): void {
    const t = this.textures;
    const m = this.mats;
    m.set('stone', this.textured(t.stone, { shininess: 35, bump: 2.5, specular: 0x3a2a5a }));
    m.set('wood', this.textured(t.wood, { shininess: 25, bump: 1.5 }));
    m.set('darkwood', this.textured(t.wood, { shininess: 30, bump: 1.8, specular: 0x2a1a30 }));
    m.set('shingle', this.textured(t.shingle, { shininess: 70, bump: 3, specular: 0x5a4a8a }));
    m.set('plaster', this.textured(t.plaster, { shininess: 12, bump: 1.2 }));
    m.set('organic', this.textured(t.organic, { shininess: 20, bump: 2 }));
    m.set('foliage', this.textured(t.organic, { shininess: 20, bump: 0.4, specular: 0x1a4a3a }));
    m.set('metal', this.textured(t.stone, { shininess: 110, bump: 0.6, specular: 0xb090ff }));
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
    const { lake, waterLevel } = LAYOUT;
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(lake.radius * 1.5, 48),
      new THREE.MeshPhongMaterial({ color: 0x06101e, specular: 0xa080ff, shininess: 160, transparent: true, opacity: 0.88, emissive: 0x050818 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(lake.x, waterLevel, lake.z);
    water.name = 'water';
    water.receiveShadow = true;
    this.scene.add(water);

    // "The Lantern Under the Lake"
    this.lakeGlowMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 0.8) }));
    this.lakeGlowMesh.position.set(lake.x + 4, -2.6, lake.z - 3);
    this.lakeGlow = this.light(0xffb040, 8, 18, lake.x + 4, -1.4, lake.z - 3, false);
    this.scene.add(this.lakeGlowMesh);

    // glowing lily pads along the shore
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

  // ---------------------------------------------------------------- roads
  /** Wet cobblestone ribbons that follow the old roads, lit by violet lanterns. */
  private buildRoads(batch: P.PropBatch): void {
    const mat = this.textured(this.textures.cobble, { shininess: 140, bump: 4, specular: 0x9a6aff, repeat: 1 });
    const lantern = P.violetLanternGeometry();
    let lamp = 0;
    let lit = 0;
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
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)];
        const b = pts[Math.min(pts.length - 1, i + 1)];
        const dir = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
        const nx = -dir.y;
        const nz = dir.x;
        if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
        for (const side of [-1, 1]) {
          const x = pts[i].x + nx * width * side;
          const z = pts[i].y + nz * width * side;
          pos.push(x, this.y(x, z) + 0.07, z);
          uv.push((side + 1) * 0.5 * 0.8, along * 0.4);
        }
        if (i > 0) {
          const k = i * 2;
          idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
        }
        // a lantern every ~13 m on alternating sides
        if (i % 11 === 5) {
          const side = lamp++ % 2 ? 1 : -1;
          const lx = pts[i].x + nx * (width + 0.8) * side;
          const lz = pts[i].y + nz * (width + 0.8) * side;
          const ly = this.y(lx, lz);
          const ry = Math.atan2(nx * side, nz * side) - Math.PI / 2;
          batch.add(P.place(lantern, lx, ly, lz, ry));
          this.colliders.push({ x: lx, z: lz, r: 0.3 });
          // only some lanterns cast real light (keeps the iPad fast); all of them glow
          if (lit < 5 && lamp % 2 === 1) {
            this.light(0xb050ff, 4, 13, lx, ly + 2.6, lz);
            lit++;
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 3).fill(0).map((_, i) => [0.62, 0.5, 0.78][i % 3]), 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const road = new THREE.Mesh(g, mat);
      road.receiveShadow = true;
      road.name = 'road';
      this.scene.add(road);
    }
  }

  // ---------------------------------------------------------------- forest
  private buildForest(batch: P.PropBatch): void {
    const r = rng(412);
    const pine = P.pineGeometry();
    const max = 480;
    const parts = Object.entries(pine) as [P.MatKey, THREE.BufferGeometry][];
    const meshes = parts.map(([k, geo]) => {
      P.applyBoxUV(geo, this.texScale(k));
      const m = new THREE.InstancedMesh(geo, this.mats.get(k), max);
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = 'pines-' + k;
      return m;
    });
    const mtx = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const tint = new THREE.Color();
    let count = 0;
    let tries = 0;
    while (count < max && tries < 9000) {
      tries++;
      const x = (r() - 0.5) * LAYOUT.size * 0.95;
      const z = (r() - 0.5) * LAYOUT.size * 0.95;
      const rad = Math.hypot(x, z);
      if (rad > 114) continue;
      if (lakeFactor(x, z) < 1.25) continue;
      if (distToPath(x, z) < 4.5) continue;
      if (Math.hypot(x - LAYOUT.village.x, z - LAYOUT.village.z) < LAYOUT.village.radius + 4) continue;
      if (Math.hypot(x - LAYOUT.cemetery.x, z - LAYOUT.cemetery.z) < LAYOUT.cemetery.radius + 3) continue;
      if (Math.hypot(x - LAYOUT.mine.x, z - LAYOUT.mine.z) < 9) continue;
      const density = 0.25 + (x > 20 ? 0.35 : 0) + (rad > 70 ? 0.4 : 0);
      if (r() > density) continue;
      const s = 0.8 + r() * 0.8;
      mtx.compose(new THREE.Vector3(x, this.y(x, z) - 0.2, z), q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.4), s));
      tint.setScalar(0.75 + r() * 0.4);
      for (const m of meshes) {
        m.setMatrixAt(count, mtx);
        m.setColorAt(count, tint);
      }
      if (rad < 100) this.colliders.push({ x, z, r: 0.55 * s });
      count++;
    }
    for (const m of meshes) {
      m.count = count;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      this.scene.add(m);
    }

    // shore rocks
    const rock = P.rockGeometry();
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.lake.radius * (1.05 + r() * 0.35);
      const x = LAYOUT.lake.x + Math.cos(a) * d;
      const z = LAYOUT.lake.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3) continue;
      const s = 0.4 + r() * 1.0;
      batch.add(P.place(rock, x, this.y(x, z) - 0.1, z, r() * 6, s));
      if (s > 0.8) this.colliders.push({ x, z, r: s * 0.8 });
    }

    // giant glowing toadstools on the far shore and the forest edge
    const shroom = P.mushroomGeometry();
    const spots: [number, number, number][] = [[-22, 30, 1.4], [-28, 22, 0.9], [18, 34, 1.7], [24, 28, 1.0], [-30, -4, 1.2], [70, 30, 1.5], [62, 38, 0.8], [-58, -52, 1.1]];
    for (const [x, z, s] of spots) {
      batch.add(P.place(shroom, x, this.y(x, z) - 0.1, z, r() * 6, s));
      this.colliders.push({ x, z, r: 0.6 * s });
    }
    this.light(0x60ff60, 4, 16, 21, this.y(21, 31) + 2.5, 31);
    this.light(0x60ff60, 3, 14, -25, this.y(-25, 26) + 2.5, 26);

    // dead trees around the cemetery
    const dead = P.deadTreeGeometry();
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.cemetery.radius + 2 + r() * 8;
      const x = LAYOUT.cemetery.x + Math.cos(a) * d;
      const z = LAYOUT.cemetery.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3) continue;
      batch.add(P.place(dead, x, this.y(x, z) - 0.1, z, r() * 6, 0.9 + r() * 0.7));
      this.colliders.push({ x, z, r: 0.4 });
    }
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
        batch.add(P.place(P.graveGeometry(v++), x, this.y(x, z), z, (v % 3) * 0.06 - 0.06));
        this.colliders.push({ x, z, r: 0.5 });
      }
    }
    batch.add(P.place(P.openGraveGeometry(), c.x, this.y(c.x, c.z) + 0.02, c.z, 0));
    this.colliders.push({ x: c.x, z: c.z - 1.45, r: 0.55 });
    this.interactables.push({ id: 'open_grave', x: c.x, z: c.z, radius: 2.6, verb: 'Look', dialogue: 'grave_open' });
    this.interactables.push({ id: 'headstone', x: c.x, z: c.z - 1.4, radius: 2.2, verb: 'Read', dialogue: 'grave_headstone' });

    const chX = c.x - 6;
    const chZ = c.z - 14;
    batch.add(P.place(P.chapelGeometry(), chX, this.y(chX, chZ) - 0.2, chZ, 0));
    this.colliders.push({ x: chX, z: chZ, r: 4.4 }, { x: chX - 5.2, z: chZ, r: 2 }, { x: chX + 3.4, z: chZ, r: 2.8 });
    this.light(0xff40c0, 3, 14, chX, this.y(chX, chZ) + 3, chZ + 4.5);

    const sx = -24;
    const sz = -30;
    batch.add(P.place(P.signpostGeometry(), sx + 2.4, this.y(sx + 2.4, sz + 1.6), sz + 1.6, 0.4));
    this.colliders.push({ x: sx + 2.4, z: sz + 1.6, r: 0.3 });
    this.interactables.push({ id: 'signpost', x: sx + 2.4, z: sz + 1.6, radius: 2.4, verb: 'Read', dialogue: 'signpost' });
  }

  // ---------------------------------------------------------------- Candlewick
  private buildVillage(batch: P.PropBatch): void {
    const v = LAYOUT.village;
    const spots: [number, number][] = [[-14, -8], [-4, -15], [10, -13], [14, 4], [2, 14], [-13, 9]];
    spots.forEach(([dx, dz], i) => {
      const x = v.x + dx;
      const z = v.z + dz;
      const ry = Math.atan2(dx, dz) + Math.PI; // the doors face the square
      batch.add(P.place(P.crookedHouseGeometry(i), x, this.y(x, z) - 0.25, z, ry));
      this.colliders.push({ x, z, r: 3.4 });
    });
    this.light(0xffa040, 5, 18, v.x - 6, this.y(v.x - 6, v.z - 4) + 3, v.z - 4);
    this.light(0xffa040, 4, 16, v.x + 6, this.y(v.x + 6, v.z + 6) + 3, v.z + 6);

    const wx = v.x + 3;
    const wz = v.z + 2;
    batch.add(P.place(P.wellGeometry(), wx, this.y(wx, wz), wz));
    this.colliders.push({ x: wx, z: wz, r: 1.4 });
    this.interactables.push({ id: 'well', x: wx, z: wz, radius: 2.6, verb: 'Look', dialogue: 'well' });

    const cx = v.x - 4;
    const cz = v.z - 3;
    batch.add(P.place(P.candleShrineGeometry(), cx, this.y(cx, cz), cz, 0.6));
    this.colliders.push({ x: cx, z: cz, r: 1.3 });
    this.interactables.push({ id: 'candle_shrine', x: cx, z: cz, radius: 2.8, verb: 'Look', dialogue: 'candle_shrine' });

    const bx = v.x + 8;
    const bz = v.z - 5;
    batch.add(P.place(P.bellTowerGeometry(), bx, this.y(bx, bz), bz, 0.2));
    this.colliders.push({ x: bx, z: bz, r: 1.6 });
    this.interactables.push({ id: 'bell_tower', x: bx, z: bz, radius: 3, verb: 'Look', dialogue: 'bell_tower' });
  }

  private buildMine(batch: P.PropBatch): void {
    const { x, z } = LAYOUT.mine;
    batch.add(P.place(P.mineEntranceGeometry(), x, this.y(x, z) - 0.3, z, Math.PI * 0.85));
    this.colliders.push({ x, z, r: 2.6 }, { x: x - 3.4, z: z + 2, r: 2.6 }, { x: x + 3.4, z: z - 2, r: 2.6 });
    this.light(0x40ff40, 4, 14, x - 0.5, this.y(x, z) + 2, z - 1.5);
    this.interactables.push({ id: 'mine', x, z: z - 3, radius: 3.4, verb: 'Look', dialogue: 'mine_entrance' });
  }

  // ---------------------------------------------------------------- grass & flowers
  /** Billboard grass tufts and flowers – crossed quads, the classic old-game meadow. */
  private buildGrass(): void {
    const r = rng(314);
    const quad = () => {
      const a = new THREE.PlaneGeometry(1.1, 0.7);
      a.translate(0, 0.35, 0);
      const b = a.clone().rotateY(Math.PI / 2);
      const g = mergeGeometries([a, b], false);
      if (!g) throw new Error('grass merge failed');
      return g;
    };
    const kinds: [THREE.Texture, number, number][] = [
      [grassSprite(), 2600, 1],
      [flowerSprite(), 420, 0.8],
    ];
    for (const [tex, count, size] of kinds) {
      const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      const mesh = new THREE.InstancedMesh(quad(), mat, count);
      mesh.name = 'grass';
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion();
      const col = new THREE.Color();
      let n = 0;
      let tries = 0;
      while (n < count && tries < count * 12) {
        tries++;
        const x = (r() - 0.5) * 200;
        const z = (r() - 0.5) * 200;
        if (Math.hypot(x, z) > 98) continue;
        if (lakeFactor(x, z) < 1.12) continue;
        if (distToPath(x, z) < 2.3) continue;
        if (Math.hypot(x - LAYOUT.village.x, z - LAYOUT.village.z) < 9) continue;
        const y = this.y(x, z);
        if (y < 0.4) continue;
        if (this.colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.3)) continue;
        const s = size * (0.7 + r() * 0.7);
        m.compose(new THREE.Vector3(x, y - 0.05, z), q.setFromEuler(new THREE.Euler(0, r() * 3.14, 0)), new THREE.Vector3(s, s, s));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n, col.setHSL(0.28 + r() * 0.12, 0.6, 0.45 + r() * 0.25));
        n++;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.scene.add(mesh);
    }
  }

  // ---------------------------------------------------------------- atmosphere
  private buildAtmosphere(): void {
    const r = rng(99);
    // fireflies around the lake and the forest edges
    const n = 220;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.lake.radius * (0.7 + r() * 1.3);
      const x = LAYOUT.lake.x + Math.cos(a) * d;
      const z = LAYOUT.lake.z + Math.sin(a) * d;
      pos.set([x, Math.max(0.2, this.y(x, z)) + 0.4 + r() * 2.2, z], i * 3);
      const c = r() > 0.25 ? [0.7, 1.4, 0.3] : [0.6, 0.5, 1.6];
      col.set(c, i * 3);
    }
    this.fireflyBase = pos.slice();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.fireflies = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.35, vertexColors: true, map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.fireflies);

    // drifting ground mist
    const tex = mistSprite();
    const spots: [number, number, number][] = [
      [0, 6, 0x8a5ad0], [-15, -5, 0x6a4ab0], [14, 18, 0x5a8a9a], [-40, -36, 0x7a5ac0], [-48, -44, 0x6a4ab0],
      [50, 2, 0x8a5ab0], [60, -6, 0x7a4aa0], [30, 50, 0x4a9a5a], [-10, 28, 0x5a6ab0], [20, -20, 0x7a5ac0],
    ];
    for (const [x, z, color] of spots) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: 0.32, depthWrite: false, fog: true }));
      s.scale.set(26, 7, 1);
      s.position.set(x, Math.max(0, this.y(x, z)) + 1.6, z);
      s.userData.base = s.position.clone();
      s.userData.phase = r() * 10;
      this.mist.push(s);
      this.scene.add(s);
    }
  }

  /** Per-frame animation: sky, flickering lights, fireflies, mist, the lake light. */
  update(dt: number, hour: number, focus: THREE.Vector3, camera: THREE.Camera): void {
    this.time += dt;
    const t = this.time;
    this.sky.update(dt, hour, focus, camera, this.fog);
    const night = this.sky.state.night;
    for (const [m, mult] of this.glowMats) m.color.setScalar(mult * (0.75 + night * 0.35));
    for (const f of this.flickerLights) {
      f.light.intensity = f.base * (0.75 + night * 0.4) * (0.9 + Math.sin(t * 8.3 + f.phase) * 0.05 + Math.sin(t * 21.7 + f.phase) * 0.05);
    }
    const pulse = Math.max(0, Math.sin(t * 0.45)) ** 3;
    this.lakeGlow.intensity = 2 + pulse * 8;
    (this.lakeGlowMesh.material as THREE.MeshBasicMaterial).color.setRGB(1 + pulse * 3, 0.6 + pulse * 2, 0.2 + pulse * 0.6);

    const pos = this.fireflies.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const b = i * 3;
      pos.setXYZ(
        i,
        this.fireflyBase[b] + Math.sin(t * 0.6 + i) * 0.8,
        this.fireflyBase[b + 1] + Math.sin(t * 1.3 + i * 1.7) * 0.35,
        this.fireflyBase[b + 2] + Math.cos(t * 0.5 + i * 0.7) * 0.8,
      );
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
