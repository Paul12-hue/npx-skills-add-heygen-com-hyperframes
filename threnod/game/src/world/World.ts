import * as THREE from 'three';
import { LAYOUT, Terrain, distToPath, lakeFactor } from './terrain';
import { rng } from './noise';
import * as P from './props';
import { Sky } from './Sky';

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
  /** Verb shown in the prompt, e.g. "Read". */
  verb: string;
  dialogue: string;
}

/**
 * Builds the test slice of Hollowmere Vale: terrain, lake, Candlewick, the
 * cemetery of Saint Ebba, the mine entrance, forest, sky and lights.
 */
export class World {
  readonly scene = new THREE.Scene();
  readonly terrain = new Terrain();
  readonly sky = new Sky();
  readonly fog = new THREE.Fog(0x4f4170, 18, 135);
  readonly colliders: Collider[] = [];
  readonly interactables: InteractableDef[] = [];
  readonly spawn = new THREE.Vector3(LAYOUT.cemetery.x + 2.6, 0, LAYOUT.cemetery.z + 1.5);
  readonly spawnYaw = Math.PI * 0.75;
  private windowMats: THREE.MeshBasicMaterial[] = [];
  private lampLights: THREE.PointLight[] = [];
  private lakeGlow!: THREE.PointLight;
  private lakeGlowMesh!: THREE.Mesh;
  private time = 0;

  constructor() {
    this.scene.fog = this.fog;
    this.scene.add(this.terrain.mesh, this.sky.group);
    this.buildWater();
    this.buildForest();
    this.buildCemetery();
    this.buildVillage();
    this.buildMine();
    this.spawn.y = this.terrain.getHeight(this.spawn.x, this.spawn.z);
  }

  height(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
  }

  private y(x: number, z: number): number {
    return this.terrain.getHeight(x, z);
  }

  private solid(): THREE.MeshLambertMaterial {
    return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  }

  private glow(): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.windowMats.push(m);
    return m;
  }

  private addMerged(name: string, geos: THREE.BufferGeometry[], mat: THREE.Material): void {
    if (!geos.length) return;
    const mesh = new THREE.Mesh(P.mergeAll(geos), mat);
    mesh.name = name;
    this.scene.add(mesh);
  }

  // ---------------------------------------------------------------- water
  private buildWater(): void {
    const { lake, waterLevel } = LAYOUT;
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(lake.radius * 1.5, 28),
      new THREE.MeshLambertMaterial({ color: 0x45605f, transparent: true, opacity: 0.82, emissive: 0x0b1416 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.set(lake.x, waterLevel, lake.z);
    water.name = 'water';
    this.scene.add(water);

    // "The Lantern Under the Lake" – a faint light on the lake bed.
    this.lakeGlowMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0xf5c060 }));
    this.lakeGlowMesh.position.set(lake.x + 4, -2.7, lake.z - 3);
    this.lakeGlow = new THREE.PointLight(0xf5c060, 6, 14, 2);
    this.lakeGlow.position.copy(this.lakeGlowMesh.position).add(new THREE.Vector3(0, 0.8, 0));
    this.scene.add(this.lakeGlowMesh, this.lakeGlow);

    this.interactables.push({ id: 'lake_shore', x: lake.x + 4, z: lake.z - lake.radius + 1, radius: 4, verb: 'Look', dialogue: 'lake_shore' });
  }

  // ---------------------------------------------------------------- forest
  private buildForest(): void {
    const r = rng(412);
    const pine = P.pineGeometry();
    const max = 520;
    const inst = new THREE.InstancedMesh(pine, this.solid(), max);
    inst.name = 'pines';
    const m = new THREE.Matrix4();
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
      // denser forest east and on the valley walls, clearings elsewhere
      const density = 0.25 + (x > 20 ? 0.35 : 0) + (rad > 70 ? 0.4 : 0);
      if (r() > density) continue;
      const s = 0.8 + r() * 0.7;
      const y = this.y(x, z) - 0.2;
      m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, r() * 6.28, 0)), new THREE.Vector3(s, s * (0.9 + r() * 0.3), s));
      inst.setMatrixAt(count, m);
      inst.setColorAt(count, tint.setScalar(0.75 + r() * 0.35));
      if (rad < 100) this.colliders.push({ x, z, r: 0.55 * s });
      count++;
    }
    inst.count = count;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    this.scene.add(inst);

    // rocks along the shore and dead trees around the cemetery
    const rocks: THREE.BufferGeometry[] = [];
    const rockGeo = P.rockGeometry();
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.lake.radius * (1.05 + r() * 0.35);
      const x = LAYOUT.lake.x + Math.cos(a) * d;
      const z = LAYOUT.lake.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3) continue;
      const s = 0.4 + r() * 0.9;
      rocks.push(P.place(rockGeo, x, this.y(x, z) - 0.1, z, r() * 6, s));
      if (s > 0.8) this.colliders.push({ x, z, r: s * 0.8 });
    }
    this.addMerged('rocks', rocks, this.solid());

    const dead: THREE.BufferGeometry[] = [];
    const deadGeo = P.deadTreeGeometry();
    for (let i = 0; i < 14; i++) {
      const a = r() * Math.PI * 2;
      const d = LAYOUT.cemetery.radius + 2 + r() * 8;
      const x = LAYOUT.cemetery.x + Math.cos(a) * d;
      const z = LAYOUT.cemetery.z + Math.sin(a) * d;
      if (distToPath(x, z) < 3) continue;
      dead.push(P.place(deadGeo, x, this.y(x, z) - 0.1, z, r() * 6, 0.9 + r() * 0.6));
      this.colliders.push({ x, z, r: 0.4 });
    }
    this.addMerged('dead-trees', dead, this.solid());
  }

  // ---------------------------------------------------------------- cemetery
  private buildCemetery(): void {
    const c = LAYOUT.cemetery;
    const graves: THREE.BufferGeometry[] = [];
    let v = 0;
    for (let row = -2; row <= 2; row++) {
      for (let col = -3; col <= 3; col++) {
        const x = c.x + col * 2.6 + (row % 2) * 0.6;
        const z = c.z + row * 3.4;
        if (Math.abs(col) <= 1 && row === 0) continue; // space for the open grave
        if ((row * 7 + col * 3) % 5 === 0) continue; // gaps
        graves.push(P.place(P.graveGeometry(v++), x, this.y(x, z), z, (v % 3) * 0.05 - 0.05));
        this.colliders.push({ x, z, r: 0.5 });
      }
    }
    this.addMerged('graves', graves, this.solid());

    const og = P.place(P.openGraveGeometry(), c.x, this.y(c.x, c.z) + 0.02, c.z, 0);
    this.addMerged('open-grave', [og], this.solid());
    this.colliders.push({ x: c.x, z: c.z - 1.4, r: 0.55 });
    this.interactables.push({ id: 'open_grave', x: c.x, z: c.z, radius: 2.6, verb: 'Look', dialogue: 'grave_open' });
    this.interactables.push({ id: 'headstone', x: c.x, z: c.z - 1.4, radius: 2.2, verb: 'Read', dialogue: 'grave_headstone' });

    const chX = c.x - 6;
    const chZ = c.z - 13;
    this.addMerged('chapel', [P.place(P.chapelGeometry(), chX, this.y(chX, chZ) - 0.2, chZ, 0)], this.solid());
    this.addMerged('chapel-windows', [P.place(P.chapelWindowsGeometry(), chX, this.y(chX, chZ) - 0.2, chZ, 0)], this.glow());
    this.colliders.push({ x: chX, z: chZ, r: 4.2 }, { x: chX - 4.6, z: chZ, r: 1.8 }, { x: chX + 3.2, z: chZ, r: 2.6 });

    // signpost where the roads fork
    const sx = -24;
    const sz = -30;
    this.addMerged('signpost', [P.place(P.signpostGeometry(), sx, this.y(sx, sz), sz, 0.4)], this.solid());
    this.colliders.push({ x: sx, z: sz, r: 0.3 });
    this.interactables.push({ id: 'signpost', x: sx, z: sz, radius: 2.4, verb: 'Read', dialogue: 'signpost' });
  }

  // ---------------------------------------------------------------- Candlewick
  private buildVillage(): void {
    const v = LAYOUT.village;
    const houses: THREE.BufferGeometry[] = [];
    const windows: THREE.BufferGeometry[] = [];
    const spots: [number, number][] = [[-14, -8], [-4, -15], [10, -13], [14, 4], [2, 14], [-13, 9]];
    for (const [dx, dz] of spots) {
      const x = v.x + dx;
      const z = v.z + dz;
      const ry = Math.atan2(-dx, -dz); // doors face the square
      const y = this.y(x, z) - 0.2;
      houses.push(P.place(P.cottageGeometry(), x, y, z, ry));
      windows.push(P.place(P.cottageWindowsGeometry(), x, y, z, ry));
      this.colliders.push({ x, z, r: 3.5 });
    }
    this.addMerged('cottages', houses, this.solid());
    this.addMerged('cottage-windows', windows, this.glow());

    // the square: well, name-candle shrine, bell tower, lanterns
    const props: THREE.BufferGeometry[] = [];
    const wx = v.x + 3;
    const wz = v.z + 2;
    props.push(P.place(P.wellGeometry(), wx, this.y(wx, wz), wz));
    this.colliders.push({ x: wx, z: wz, r: 1.4 });
    this.interactables.push({ id: 'well', x: wx, z: wz, radius: 2.6, verb: 'Look', dialogue: 'well' });

    const cx = v.x - 4;
    const cz = v.z - 3;
    props.push(P.place(P.candleShrineGeometry(), cx, this.y(cx, cz), cz, 0.6));
    this.addMerged('candle-flames', [P.place(P.candleFlamesGeometry(), cx, this.y(cx, cz), cz, 0.6)], this.glow());
    this.colliders.push({ x: cx, z: cz, r: 1.3 });
    this.interactables.push({ id: 'candle_shrine', x: cx, z: cz, radius: 2.8, verb: 'Look', dialogue: 'candle_shrine' });

    const bx = v.x + 8;
    const bz = v.z - 5;
    props.push(P.place(P.bellTowerGeometry(), bx, this.y(bx, bz), bz, 0.2));
    this.colliders.push({ x: bx, z: bz, r: 1.6 });
    this.interactables.push({ id: 'bell_tower', x: bx, z: bz, radius: 3, verb: 'Look', dialogue: 'bell_tower' });

    const lamps: [number, number][] = [[-6, 5], [6, 7], [-1, -7], [26 - v.x + 2, -18 - v.z + 2]];
    const glows: THREE.BufferGeometry[] = [];
    for (const [dx, dz] of lamps) {
      const x = v.x + dx;
      const z = v.z + dz;
      props.push(P.place(P.lanternPostGeometry(), x, this.y(x, z), z));
      glows.push(P.place(P.lanternGlowGeometry(), x, this.y(x, z), z));
      this.colliders.push({ x, z, r: 0.3 });
      const light = new THREE.PointLight(0xf0a040, 0, 16, 1.6);
      light.position.set(x + 0.5, this.y(x, z) + 2.4, z);
      this.lampLights.push(light);
      this.scene.add(light);
    }
    this.addMerged('village-props', props, this.solid());
    this.addMerged('lantern-glow', glows, this.glow());
  }

  private buildMine(): void {
    const { x, z } = LAYOUT.mine;
    this.addMerged('mine', [P.place(P.mineEntranceGeometry(), x, this.y(x, z) - 0.3, z, Math.PI * 0.85)], this.solid());
    this.colliders.push({ x, z, r: 2.6 }, { x: x - 3.4, z: z + 2, r: 2.6 }, { x: x + 3.4, z: z - 2, r: 2.6 });
    this.interactables.push({ id: 'mine', x, z: z - 3, radius: 3.4, verb: 'Look', dialogue: 'mine_entrance' });
  }

  /** Per-frame world animation: sky, lights that respond to night, the lake glimmer. */
  update(dt: number, hour: number, focus: THREE.Vector3): void {
    this.time += dt;
    this.sky.update(hour, focus, this.fog);
    const night = this.sky.state.night;
    const flicker = 0.92 + Math.sin(this.time * 9.1) * 0.04 + Math.sin(this.time * 23.7) * 0.04;
    for (const m of this.windowMats) m.color.setScalar(0.35 + night * 0.65);
    for (const l of this.lampLights) l.intensity = night * 14 * flicker;
    // the lantern under the lake slowly pulses – and sometimes goes dark
    const pulse = Math.max(0, Math.sin(this.time * 0.45)) ** 3;
    this.lakeGlow.intensity = 2 + pulse * 10;
    (this.lakeGlowMesh.material as THREE.MeshBasicMaterial).color.setScalar(0.4 + pulse * 0.6);
  }
}
