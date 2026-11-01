import * as THREE from 'three';
import { Humanoid, type Action, type Tool } from '../character/Humanoid';
import { villagerSpec, type Build, type FigureSpec } from '../character/figures';
import { resolveCollisions } from '../player/movement';
import type { DialogueGraph } from '../dialogue/Dialogue';
import type { Target } from '../interaction/Interaction';
import { LAYOUT } from './terrain';
import { Creatures } from './Creatures';
import type { World } from './World';

/**
 * The people of the vale and its animals. Villagers have a name, a body, a
 * job they are busy with (or a road they walk) and a few things to say.
 */

type Activity =
  | { kind: 'work'; spot: string | [number, number, number]; action: Action | null; tool?: Tool }
  | { kind: 'route'; points: [number, number][]; pause: number; action?: Action; tool?: Tool }
  | { kind: 'roam'; x: number; z: number; r: number; speed: number };

interface VillagerDef {
  name: string;
  build: Build;
  seed: number;
  activity: Activity;
  lines: string[];
}

interface Villager {
  def: VillagerDef;
  h: Humanoid;
  spec: FigureSpec;
  target: Target;
  x: number;
  z: number;
  yaw: number;
  /** route / roam state */
  leg: number;
  dir: number;
  wait: number;
  tx: number;
  tz: number;
  stuck: number;
  speed: number;
  held: boolean;
}

const V = LAYOUT.village;
const F = LAYOUT.farm;
const C = LAYOUT.camp;

/** Who lives where and what they do. Lines hint at the story without spoiling it. */
const PEOPLE: VillagerDef[] = [
  // ---------------------------------------------------------------- Candlewick
  { name: 'Hale the Smith', build: 'man', seed: 11, activity: { kind: 'work', spot: 'smith', action: 'hammer', tool: 'hammer' }, lines: [
    'Mind the sparks. Forty years at this anvil and I still burn my sleeves.',
    'Strange thing – I forged a key last week, and nobody in Candlewick remembers ordering it.',
    'They say the bells out in the wild lands used to be rung every dusk. Who stopped, and why, nobody can tell me.',
  ] },
  { name: 'Merriam', build: 'woman', seed: 23, activity: { kind: 'work', spot: 'stall0', action: 'talk' }, lines: [
    'Fresh bread, honey cake, onions from Millfield! Well – fresh-ish.',
    'You look like you climbed out of a grave, dear. Have a heel of bread, no charge.',
    'My mother had a recipe book. Every year there are more blank pages in it.',
  ] },
  { name: 'Old Cobb', build: 'elder', seed: 31, activity: { kind: 'work', spot: 'stall1', action: null }, lines: [
    'Candles, wicks, lamp oil. Candlewick never lets its lights go out – that is the rule.',
    'When I was a boy, the grey fog was a day\'s walk further east. It creeps, stranger. It creeps.',
  ] },
  { name: 'Wenna', build: 'woman', seed: 47, activity: { kind: 'work', spot: 'stall2', action: 'talk' }, lines: [
    'Wool from Cairnfold, the best on the moor. Feel it!',
    'The shepherds up on the High Moor say their old bell tower hums when the wind is right.',
  ] },
  { name: 'Ysolde', build: 'woman', seed: 52, activity: { kind: 'work', spot: 'buyer0', action: 'talk', tool: 'basket' }, lines: [
    'I always forget what I came to the market for. Then again – everyone does, these days.',
  ] },
  { name: 'Bram', build: 'man', seed: 58, activity: { kind: 'work', spot: 'buyer2', action: 'talk' }, lines: [
    'Three coppers for a cabbage. Robbery, I call it.',
    'Have you met Mother Odile? She keeps the candles at the shrine. Wise woman. Strict, though.',
  ] },
  { name: 'Agna', build: 'elder', seed: 61, activity: { kind: 'work', spot: 'square', action: 'sweep', tool: 'broom' }, lines: [
    'Somebody has to keep the square clean. The gods certainly won\'t.',
    'Sweep, sweep. If you stop moving, the fog finds you – that\'s what my gran said.',
  ] },
  { name: 'Pip', build: 'child', seed: 71, activity: { kind: 'roam', x: V.x - 2, z: V.z + 4, r: 9, speed: 1.35 }, lines: [
    'You can\'t catch me! Nobody can catch me!',
    'Tilde says she found a person in the graveyard. Was it you? Are you a ghost?',
  ] },
  { name: 'Lark', build: 'child', seed: 79, activity: { kind: 'roam', x: V.x + 3, z: V.z - 2, r: 10, speed: 1.3 }, lines: [
    'We\'re playing Hush-and-seek. If the fog gets you, you\'re out!',
  ] },
  { name: 'Osric the Lamplighter', build: 'man', seed: 83, activity: { kind: 'route', points: [[V.x - 6, V.z - 4], [V.x + 26, V.z - 18], [V.x + 6, V.z + 6], [V.x - 14, V.z + 12]], pause: 4 }, lines: [
    'Every lamp, every night. If one goes dark, people start forgetting the street it stood on.',
    'Don\'t laugh. It happened to Nettle Lane. Ask anyone where Nettle Lane was – they\'ll just stare at you.',
  ] },
  // ---------------------------------------------------------------- Millfield
  { name: 'Farmer Dunstan', build: 'man', seed: 91, activity: { kind: 'work', spot: [F.x - 13.2, F.z - 2, 0], action: 'hoe', tool: 'hoe' }, lines: [
    'The soil\'s good. The rain\'s good. It\'s only the names that go bad.',
    'Windmill\'s turning, so we\'ll have flour. Small mercies.',
  ] },
  { name: 'Hilde', build: 'woman', seed: 97, activity: { kind: 'work', spot: [F.x + 0.6, F.z + 6, 0], action: 'gather', tool: 'basket' }, lines: [
    'Beans, beans and more beans. You hungry?',
    'My husband and I had a son. I am sure of it. I just can\'t see his face anymore.',
  ] },
  { name: 'Tam', build: 'man', seed: 103, activity: { kind: 'work', spot: [F.x + 12.4, F.z - 1, Math.PI], action: 'hoe', tool: 'hoe' }, lines: [
    'Back hurts, sun\'s gone, still hoeing. That\'s farming.',
  ] },
  { name: 'Carter Wynn', build: 'man', seed: 109, activity: { kind: 'route', points: [[V.x + 4, V.z + 2], [V.x + 22, V.z + 14], [F.x - 4, F.z - 10], [F.x + 18, F.z + 4]], pause: 5, action: 'carry', tool: 'crate' }, lines: [
    'Crates to Millfield, sacks back to Candlewick. Round and round.',
  ] },
  // ---------------------------------------------------------------- Reedwater
  { name: 'Old Fennick', build: 'elder', seed: 113, activity: { kind: 'work', spot: 'fisher0', action: 'fish', tool: 'rod' }, lines: [
    'Shh. You\'ll scare the fish. And the thing under the lake.',
    'There\'s a light down there, under Hollowmere. Been there since before my grandfather.',
  ] },
  { name: 'Maren', build: 'woman', seed: 127, activity: { kind: 'work', spot: 'fisher1', action: 'fish', tool: 'rod' }, lines: [
    'Reedwater\'s small, but we eat well. Perch, mostly.',
    'The river runs west into the marsh. The marsh folk in Stiltwick trade reeds for our fish.',
  ] },
  { name: 'Gideon', build: 'man', seed: 131, activity: { kind: 'work', spot: 'rw_fire0', action: 'sit' }, lines: [
    'Sit. Warm your hands. Nobody\'s in a hurry in Reedwater.',
  ] },
  { name: 'Brisa', build: 'woman', seed: 137, activity: { kind: 'work', spot: 'rw_fire1', action: 'sit' }, lines: [
    'You hum when you walk, did you know? A sad little tune. Where did you learn it?',
  ] },
  { name: 'Nell', build: 'woman', seed: 139, activity: { kind: 'work', spot: 'rw_rack', action: 'gather' }, lines: [
    'Salt, smoke and wind – that\'s how you keep fish through the winter.',
  ] },
  // ---------------------------------------------------------------- Fellstead
  { name: 'Ruark', build: 'man', seed: 149, activity: { kind: 'work', spot: 'chop0', action: 'chop', tool: 'axe' }, lines: [
    'Stand back. Axes don\'t care whose leg they find.',
    'We only cut at the edge of the Whisperwood. Further in, the trees… listen.',
  ] },
  { name: 'Edda', build: 'woman', seed: 151, activity: { kind: 'work', spot: 'chop1', action: 'chop', tool: 'axe' }, lines: [
    'Fellstead firewood keeps half the vale warm. Remember that when you\'re cold.',
  ] },
  { name: 'Bjorn', build: 'man', seed: 157, activity: { kind: 'work', spot: 'chop2', action: 'chop', tool: 'axe' }, lines: [
    'There\'s an old bell tower deep in the wood. Nobody\'s rung it in my lifetime.',
  ] },
  { name: 'Sawyer Tobin', build: 'man', seed: 163, activity: { kind: 'work', spot: 'saw', action: 'sweep' }, lines: [
    'Back and forth, back and forth. A saw is a song with only one note.',
  ] },
  { name: 'Old Hesk', build: 'elder', seed: 167, activity: { kind: 'work', spot: 'fs_fire0', action: 'sit' }, lines: [
    'I cut trees for sixty years. Now I just watch the fire and tell lies to the young ones.',
  ] },
  { name: 'Ilse', build: 'woman', seed: 173, activity: { kind: 'work', spot: 'fs_fire1', action: 'sit' }, lines: [
    'Hunters from the camp say there are deer as big as horses in the deep wood. I believe them.',
  ] },
  // ---------------------------------------------------------------- Stiltwick
  { name: 'Moss', build: 'man', seed: 179, activity: { kind: 'work', spot: 'reeds0', action: 'gather' }, lines: [
    'Reeds for roofs, reeds for baskets, reeds for everything. Mind the black water – it\'s deeper than it looks.',
  ] },
  { name: 'Sedge', build: 'woman', seed: 181, activity: { kind: 'work', spot: 'reeds1', action: 'gather' }, lines: [
    'Frogs sing louder near the old bell tower. As if they remember something we don\'t.',
  ] },
  { name: 'Granny Brack', build: 'elder', seed: 191, activity: { kind: 'work', spot: 'sw_rack', action: 'talk' }, lines: [
    'Stiltwick has stood on its legs for three hundred years. The marsh hasn\'t swallowed us yet.',
    'Bells, child. The old ones say bells make the world remember. Silly, isn\'t it?',
  ] },
  { name: 'Wren', build: 'child', seed: 193, activity: { kind: 'roam', x: LAYOUT.stiltwick.x, z: LAYOUT.stiltwick.z, r: 8, speed: 1.2 }, lines: [
    'I caught seven frogs today! Well, five. Well – one, but it was big.',
  ] },
  // ---------------------------------------------------------------- Cairnfold
  { name: 'Shepherd Calloway', build: 'man', seed: 197, activity: { kind: 'work', spot: 'shepherd', action: null }, lines: [
    'Forty-two sheep. I count them every morning. Some mornings there are forty-three, and I don\'t know which one is new.',
    'Wind\'s cold up here, but the air is clear. The grey fog never climbs the moor. Not yet.',
  ] },
  { name: 'Ailith', build: 'woman', seed: 199, activity: { kind: 'work', spot: 'cf_well', action: 'gather' }, lines: [
    'We pile the cairns so travellers find their way. And so we do.',
  ] },
  // ---------------------------------------------------------------- the camp and the roads
  { name: 'Hunter Vey', build: 'man', seed: 211, activity: { kind: 'work', spot: [C.x, C.z + 2.2, Math.PI], action: 'sit' }, lines: [
    'Tracks everywhere this season. Deer, foxes – and something that walks on two legs but leaves no prints.',
  ] },
  { name: 'Tamsin', build: 'woman', seed: 223, activity: { kind: 'work', spot: [C.x - 2.1, C.z - 0.6, -Math.PI / 2 - 0.3], action: 'sit' }, lines: [
    'Sit if you like. Don\'t touch the bow.',
  ] },
  { name: 'Pedlar Quill', build: 'man', seed: 227, activity: { kind: 'route', points: [[54, 0], [96, -8], [128, -26], [150, -70], [170, -110], [184, -128]], pause: 6 }, lines: [
    'Needles, thread, buttons, ribbons, a map of a town that isn\'t there anymore – everything must go!',
  ] },
  { name: 'Pilgrim Orla', build: 'woman', seed: 229, activity: { kind: 'route', points: [[-24, -32], [-46, -6], [-40, 20], [-30, 34], [-22, 42]], pause: 8 }, lines: [
    'I walk to Saint Ebba\'s every week and light a candle for someone. I don\'t remember who anymore. I light it anyway.',
  ] },
  { name: 'Drover Kell', build: 'man', seed: 233, activity: { kind: 'route', points: [[-46, -6], [-84, -36], [-106, -58], [-170, -100], [-196, -92]], pause: 6 }, lines: [
    'Driving wool down from Cairnfold. Long road, good company – the crows mostly.',
  ] },
];

export class Population {
  readonly villagers: Villager[] = [];
  readonly creatures: Creatures;

  constructor(private world: World) {
    for (const def of PEOPLE) this.spawn(def);
    this.creatures = new Creatures(world);
    this.placeAnimals();
    world.scene.add(this.creatures.group);
  }

  private spawn(def: VillagerDef): void {
    const spec = villagerSpec(def.seed, def.build);
    const h = new Humanoid(spec, { priority: 2, lazyNear: true });
    let x = 0;
    let z = 0;
    let yaw = 0;
    const a = def.activity;
    if (a.kind === 'work') {
      const s = typeof a.spot === 'string' ? this.world.spots.get(a.spot) : { x: a.spot[0], z: a.spot[1], yaw: a.spot[2] };
      if (!s) {
        console.warn('missing spot', a.spot);
        return;
      }
      ({ x, z, yaw } = s);
      h.action = a.action;
      if (a.tool) h.setTool(a.tool);
      this.world.addCollider({ x, z, r: 0.4 });
    } else if (a.kind === 'route') {
      [x, z] = a.points[0];
      if (a.tool) h.setTool(a.tool);
      if (a.action) h.action = a.action;
    } else {
      x = a.x;
      z = a.z;
    }
    const id = 'villager' + this.villagers.length;
    const v: Villager = {
      def, h, spec, x, z, yaw, leg: 1, dir: 1, wait: Math.random() * 3, tx: x, tz: z, stuck: 0,
      speed: a.kind === 'roam' ? a.speed : 0.5, held: false,
      target: { id, name: def.name, x, z, radius: 2.6, verb: 'Talk', dialogue: 'bark:' + id },
    };
    this.place(v);
    this.world.scene.add(h.root);
    this.villagers.push(v);
  }

  private place(v: Villager): void {
    v.h.root.position.set(v.x, this.world.groundHeight(v.x, v.z, 6), v.z);
    v.h.root.rotation.y = v.yaw;
    v.target.x = v.x;
    v.target.z = v.z;
  }

  private placeAnimals(): void {
    const c = this.creatures;
    const L = LAYOUT;
    // sheep on the moor and in the pen at Cairnfold, cows and chickens at Millfield
    c.herd('sheep', 18, L.cairnfold.x + 4, L.cairnfold.z + 9, 4.5, 4.5, ['ffffff', 'f0ece4', 'e0dcd4', '6a6460']);
    c.herd('sheep', 16, L.cairnfold.x - 30, L.cairnfold.z - 22, 14, 22, ['ffffff', 'f0ece4', 'e0dcd4']);
    c.herd('sheep', 12, L.moor.x - 10, L.moor.z - 40, 12, 20, ['ffffff', 'f0ece4', '7a7470']);
    c.herd('cow', 8, L.farm.x + 4, L.farm.z - 22, 10, 14, ['ffffff', 'e0c8a8', 'b88a60']);
    c.herd('chicken', 10, L.village.x + 2, L.village.z - 8, 6, 9, ['ffffff', 'f0e0c0', 'a86a3a']);
    c.herd('chicken', 8, L.farm.x + 22, L.farm.z, 4, 7, ['ffffff', 'e8d8b8']);
    c.herd('chicken', 5, L.reedwater.x + 4, L.reedwater.z + 6, 3, 6, ['ffffff']);
    // deer at the edge of the woods and in quiet meadows
    for (const [x, z] of [[170, -170], [230, -150], [150, -230], [-80, 90], [-150, -20], [90, -110], [-70, -150], [250, -260]]) {
      c.herd('deer', 4, x, z, 8, 30, ['ffffff', 'e8d0b8', 'c8a888'], [0.85, 1.1]);
    }
    // rabbits everywhere in the meadows
    for (let i = 0; i < 12; i++) {
      const a = i * 2.39;
      const d = 60 + (i % 5) * 35;
      c.herd('rabbit', 4, Math.cos(a) * d, Math.sin(a) * d, 6, 12, ['ffffff', 'd8c8b0', 'a89880']);
    }
    // crows on the fields, at the cemetery and at the ruin
    c.herd('crow', 10, L.farm.x - 2, L.farm.z + 2, 10, 18, ['ffffff']);
    c.herd('crow', 7, L.cemetery.x, L.cemetery.z, 10, 16, ['ffffff']);
    c.herd('crow', 6, L.ruin.x, L.ruin.z, 8, 14, ['ffffff']);
    c.herd('crow', 6, L.stones.x, L.stones.z, 8, 14, ['ffffff']);
    // frogs in the marsh and on the lake shore
    c.herd('frog', 22, L.stiltwick.x - 20, L.stiltwick.z + 25, 18, 12, ['ffffff', 'c8e0a0', 'e0d080']);
    c.herd('frog', 18, L.marsh.x, L.marsh.z, 30, 14, ['ffffff', 'c8e0a0']);
    c.herd('frog', 8, L.lake.x - 20, L.lake.z - 22, 10, 8, ['ffffff']);
  }

  get targets(): Target[] {
    return this.villagers.map((v) => v.target);
  }

  /** A short conversation with a villager: one of their lines. */
  dialogue(id: string): DialogueGraph | null {
    if (!id.startsWith('bark:')) return null;
    const v = this.villagers.find((x) => x.target.id === id.slice(5));
    if (!v) return null;
    const line = v.def.lines[Math.floor(Math.random() * v.def.lines.length)];
    return { start: 'a', nodes: { a: { speaker: v.def.name, text: line, end: true } } };
  }

  /** Portrait designs for the dialogue box (by speaker name). */
  portraitSpecs(): [string, FigureSpec][] {
    return this.villagers.map((v) => [v.def.name, v.spec]);
  }

  /** Stop and turn towards the player while talking. */
  hold(id: string, px: number, pz: number): void {
    const v = this.villagers.find((x) => x.target.id === id);
    if (!v) return;
    v.held = true;
    v.yaw = Math.atan2(-(px - v.x), -(pz - v.z));
    v.h.root.rotation.y = v.yaw;
  }

  release(): void {
    for (const v of this.villagers) {
      if (!v.held) continue;
      v.held = false;
      const a = v.def.activity;
      if (a.kind === 'work') {
        const s = typeof a.spot === 'string' ? this.world.spots.get(a.spot)! : { yaw: a.spot[2] };
        v.yaw = s.yaw;
        v.h.root.rotation.y = v.yaw;
      }
    }
  }

  update(dt: number, t: number, cam: THREE.Vector3, player: THREE.Vector3, active: boolean): void {
    for (const v of this.villagers) {
      const a = v.def.activity;
      let speed01 = 0;
      if (active && !v.held && a.kind !== 'work') speed01 = this.walk(v, dt, a);
      const visible = v.h.updateLod(cam);
      if (!visible) continue;
      if (v.held) {
        const keep = v.h.action;
        if (keep !== 'sit') v.h.action = null;
        v.h.animate(dt, 0, t);
        v.h.action = keep;
      } else v.h.animate(dt, speed01, t);
    }
    this.creatures.update(dt, t, player, cam, active);
  }

  private walk(v: Villager, dt: number, a: Exclude<Activity, { kind: 'work' }>): number {
    if (v.wait > 0) {
      v.wait -= dt;
      if (a.kind === 'route' && a.action === 'carry') v.h.action = 'carry';
      return 0;
    }
    if (a.kind === 'route') {
      const [tx, tz] = a.points[v.leg];
      v.tx = tx;
      v.tz = tz;
    }
    const dx = v.tx - v.x;
    const dz = v.tz - v.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      if (a.kind === 'route') {
        if (v.leg === a.points.length - 1 || v.leg === 0) v.dir = -v.dir;
        v.leg += v.dir;
        v.wait = a.pause * (0.6 + Math.random() * 0.8);
      } else {
        this.newRoamTarget(v, a);
        v.wait = Math.random() * 1.5;
      }
      return 0;
    }
    const metresPerSec = v.speed * 4.2;
    const want = Math.atan2(-dx, -dz);
    let dy = want - v.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.yaw += dy * Math.min(1, dt * 5);
    const step = Math.min(d, metresPerSec * dt);
    let nx = v.x - Math.sin(v.yaw) * step;
    let nz = v.z - Math.cos(v.yaw) * step;
    [nx, nz] = resolveCollisions(nx, nz, 0.35, this.world.nearby(nx, nz));
    const moved = Math.hypot(nx - v.x, nz - v.z);
    v.stuck = moved < step * 0.3 ? v.stuck + dt : 0;
    v.x = nx;
    v.z = nz;
    if (v.stuck > 1.2) {
      // blocked: try somewhere else (roamers) or nudge sideways (walkers)
      v.stuck = 0;
      if (a.kind === 'roam') this.newRoamTarget(v, a);
      else v.yaw += 1.2;
    }
    this.place(v);
    return v.speed;
  }

  private newRoamTarget(v: Villager, a: { x: number; z: number; r: number }): void {
    for (let k = 0; k < 8; k++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * a.r;
      const x = a.x + Math.cos(ang) * r;
      const z = a.z + Math.sin(ang) * r;
      if (this.world.height(x, z) > 0.3 && this.world.isFree(x, z, 0.6)) {
        v.tx = x;
        v.tz = z;
        return;
      }
    }
  }
}
