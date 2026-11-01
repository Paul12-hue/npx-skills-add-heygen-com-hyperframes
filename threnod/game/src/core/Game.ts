import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Humanoid } from '../character/Humanoid';
import { fadedSpec, odileSpec, tildeSpec } from '../character/figures';
import { LAYOUT } from '../world/terrain';
import { PortraitRenderer } from '../character/Portrait';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { Input } from '../input/Input';
import { TouchControls } from '../input/TouchControls';
import { UI } from '../ui/UI';
import { findTarget, placeName, type Target } from '../interaction/Interaction';
import { DialogueRunner, type DialogueGraph, type Flags } from '../dialogue/Dialogue';
import { Storage, type Settings } from '../save/Save';
import dialogues from '../data/dialogues.json';

type Mode = 'title' | 'playing' | 'dialogue' | 'paused' | 'paused-story';

const START_HOUR = 21; // the game begins at night, under the orange moon
const SECONDS_PER_GAME_HOUR = 60; // one in-game day = 24 real minutes
const AUTOSAVE_SECONDS = 30;

interface Npc {
  mesh: Humanoid;
  target: Target;
  baseYaw: number;
  /** slow wandering in a circle (the Faded) */
  wander?: { cx: number; cz: number; r: number; speed: number; a: number };
}

const PROLOGUE = [
  'The gods are dead.',
  'For four hundred years the world has been forgetting itself. Villages slip off the maps. Names slip from tongues. At the edges of the vale a grey fog eats the land, and what it touches is never remembered again.',
  'In Hollowmere Vale, in the graveyard of Saint Ebba, an unmarked grave opens.',
];

export class Game {
  private renderer: Renderer;
  private world: World;
  private player: Player;
  private cam: ThirdPersonCamera;
  private input: Input;
  private touch: TouchControls;
  private ui: UI;
  private settings: Settings;
  private mode: Mode = 'title';
  private hour = START_HOUR;
  private flags: Flags = {};
  private npcs: Npc[] = [];
  private target: Target | null = null;
  private dialogue: DialogueRunner | null = null;
  private lastPlace = '';
  private autosave = 0;
  private clock = new THREE.Clock();
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;
  private titleAngle = 0;
  private portrait = new PortraitRenderer();

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = Storage.loadSettings();
    this.world = new World();
    this.player = new Player(this.world);
    this.world.scene.add(this.player.mesh.root);
    this.cam = new ThirdPersonCamera(1);
    // soft fill light that follows the camera so faces stay readable at night
    const fill = new THREE.PointLight(0xffd4b4, 0.0, 9, 1.4); // top-down camera: no face fill needed
    this.cam.camera.add(fill);
    this.world.scene.add(this.cam.camera);
    this.renderer = new Renderer(canvas, this.world.scene, this.cam.camera, {
      quality: this.settings.quality,
      bloom: this.settings.bloom,
      grain: this.settings.grain,
    });
    this.input = new Input(canvas);
    this.touch = new TouchControls(canvas, this.input);
    this.applySettings();
    this.spawnNpcs();
    this.spawnStoryNpcs();

    this.ui = new UI(
      uiRoot,
      {
        onNewGame: () => this.startGame(false),
        onContinue: () => this.startGame(true),
        onResume: () => this.setMode('playing'),
        onSave: () => {
          this.save();
          this.ui.showToast('Game saved');
        },
        onQuitToTitle: () => {
          this.save();
          this.setMode('title');
        },
        onSettingsChange: (s) => {
          this.settings = s;
          Storage.saveSettings(s);
          this.applySettings();
        },
        onInteract: () => this.input.press('interact'),
        onPause: () => this.input.press('pause'),
        onJump: () => this.input.press('jump'),
        onView: () => this.input.press('view'),
        onFreeCam: () => this.input.press('freecam'),
        onCamHold: (kind, v) => (this.input.hold[kind] = v),
        onDialogueAdvance: () => this.dialogueAdvance(),
        onDialogueChoose: (i) => this.dialogueChoose(i),
        onDialogueAnswer: (v) => this.dialogueAnswer(v),
      },
      this.settings,
    );

    this.ui.setPortraitCanvas(this.portrait.canvas);
    this.player.place(this.world.spawn.x, this.world.spawn.z, this.world.spawnYaw);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (this.mode === 'playing' || this.mode === 'dialogue')) {
        this.save();
        this.setMode('paused');
      }
    });
    this.resize();
    this.setMode('title');
    this.exposeDebug();
  }

  private addNpc(mesh: Humanoid, x: number, z: number, yaw: number, target: Omit<Target, 'x' | 'z'>, wander?: Npc['wander']): void {
    mesh.root.position.set(x, this.world.height(x, z), z);
    mesh.root.rotation.y = yaw;
    this.world.scene.add(mesh.root);
    if (!wander) this.world.addCollider({ x, z, r: 0.42 });
    this.npcs.push({ mesh, baseYaw: yaw, target: { ...target, x, z }, wander });
  }

  private spawnStoryNpcs(): void {
    // Mother Odile waits at the candle shrine in Candlewick
    const v = LAYOUT.village;
    this.addNpc(new Humanoid(odileSpec()), v.x - 2.2, v.z - 0.6, Math.PI * 0.85, { id: 'odile', name: 'Mother Odile', radius: 3, verb: 'Talk', dialogue: 'odile' });
    // the Faded drift through grey Aldersey
    const al = LAYOUT.aldersey;
    for (let i = 0; i < 4; i++) {
      const woman = i % 2 === 0;
      this.addNpc(
        new Humanoid(fadedSpec(woman ? 0 : 1 + (i % 2)), { ghost: true }),
        al.x,
        al.z,
        0,
        { id: 'faded' + i, name: woman ? 'Faded woman' : 'Faded man', radius: 2.6, verb: 'Talk', dialogue: woman ? 'faded_woman' : 'faded_man' },
        { cx: al.x + [-6, 6, 4, -5][i], cz: al.z + [4, -3, 9, -8][i], r: 3 + i, speed: 0.12 + i * 0.03, a: i * 1.7 },
      );
    }
  }

  private spawnNpcs(): void {
    // Tilde, the gravedigger's girl, waits by the open grave.
    const mesh = new Humanoid(tildeSpec());
    const x = this.world.spawn.x - 5.5;
    const z = this.world.spawn.z + 3.2;
    mesh.root.position.set(x, this.world.height(x, z), z);
    const baseYaw = Math.atan2(-(this.world.spawn.x - x), -(this.world.spawn.z - z));
    mesh.root.rotation.y = baseYaw;
    this.world.scene.add(mesh.root);
    this.world.addCollider({ x, z, r: 0.45 });
    this.npcs.push({ mesh, baseYaw, target: { id: 'tilde', name: 'Tilde', x, z, radius: 3, verb: 'Talk', dialogue: 'tilde_first' } });
  }

  private applySettings(): void {
    const s = this.settings;
    this.renderer.setOptions({ quality: s.quality, bloom: s.bloom, grain: s.grain });
    this.world.sky.setShadowSize(this.renderer.shadowSize);
    this.world.setGrassDensity({ low: 0.35, medium: 0.7, high: 1 }[s.quality]);
    this.world.setReflections(s.quality !== 'low');
    this.input.invertY = s.invertY;
    this.input.sensitivity = s.sensitivity;
    this.resize();
  }

  private resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.cam.setAspect(this.renderer.width / this.renderer.height);
  }

  private startGame(load: boolean): void {
    const data = load ? Storage.loadGame() : null;
    if (data) {
      this.flags = data.flags;
      this.hour = data.hour;
      this.player.place(data.player.x, data.player.z, data.player.yaw);
    } else {
      this.flags = {};
      this.hour = START_HOUR;
      this.player.place(this.world.spawn.x, this.world.spawn.z, this.world.spawnYaw);
    }
    this.cam.yaw = this.player.yaw;
    this.cam.snap();
    this.lastPlace = '';
    this.syncBells(false);
    window.setTimeout(() => this.portrait.warmUp(), 1200);
    this.setMode('playing');
    this.updateGoal();
    if (!data) {
      this.mode = 'paused-story';
      this.touch.enabled = false;
      this.ui.showPrologue(PROLOGUE, () => {
        this.mode = 'playing';
        this.touch.enabled = true;
        this.input.clearPressed();
      });
    }
  }

  private save(): void {
    if (this.mode === 'title') return;
    Storage.saveGame({
      player: { x: this.player.position.x, z: this.player.position.z, yaw: this.player.yaw },
      hour: this.hour,
      flags: this.flags,
    });
    this.autosave = 0;
  }

  private setMode(m: Mode): void {
    this.mode = m;
    this.input.clearPressed();
    this.touch.reset();
    this.touch.enabled = m === 'playing';
    if (m === 'title') {
      this.ui.showTitle(!!Storage.loadGame());
      this.cam.snap();
    } else if (m === 'playing') {
      this.ui.showGame();
      this.ui.hideDialogue();
    } else if (m === 'paused') {
      this.ui.showPause(true);
    }
  }

  // ---------------------------------------------------------------- dialogue
  private startDialogue(t: Target): void {
    if (this.cam.free) this.toggleFreeCam();
    const graph = (dialogues as Record<string, DialogueGraph>)[t.dialogue];
    if (!graph) {
      console.warn('missing dialogue', t.dialogue);
      return;
    }
    this.player.faceTowards(t.x, t.z);
    const npc = this.npcs.find((n) => n.target.id === t.id);
    if (npc) npc.mesh.root.rotation.y = Math.atan2(-(this.player.position.x - t.x), -(this.player.position.z - t.z));
    this.dialogue = new DialogueRunner(graph, this.flags);
    this.mode = 'dialogue';
    this.touch.reset();
    this.touch.enabled = false;
    this.showNode();
  }

  private showNode(): void {
    if (!this.dialogue) return;
    // the speaker's face; narration and the player's own answers show the Unsung
    const who = this.dialogue.node.speaker ?? 'Unsung';
    this.portrait.show(who);
    const name = String(this.flags.playerName ?? 'stranger');
    const node = { ...this.dialogue.node, text: this.dialogue.node.text.split('{name}').join(name) };
    this.ui.showDialogue(node, this.dialogue.choices, this.input.touchMode, this.portrait.has(who));
  }

  private dialogueAdvance(): void {
    if (!this.dialogue || this.ui.skipTyping()) return;
    if (this.dialogue.choices.length) {
      this.dialogueChoose(this.ui.selectedChoice);
      return;
    }
    this.dialogue.advance();
    if (this.dialogue.finished) this.endDialogue();
    else this.showNode();
  }

  private dialogueChoose(i: number): void {
    if (!this.dialogue || this.ui.skipTyping()) return;
    this.dialogue.choose(i);
    this.showNode();
  }

  private toggleFreeCam(): void {
    this.cam.setFree(!this.cam.free, this.player.position);
    this.ui.setFreeCam(this.cam.free);
    this.ui.showToast(this.cam.free ? 'Free camera – move it with the stick' : 'Camera follows you again');
  }

  private dialogueAnswer(value: string): void {
    if (!this.dialogue) return;
    const clean = value.trim().slice(0, 18) || 'Wanderer';
    this.dialogue.answer(clean);
    this.showNode();
  }

  /** Light the lamps of every bell tower that has been rung. */
  private syncBells(announce: boolean): void {
    for (const b of LAYOUT.bells) {
      if (!this.flags['rang_' + b.id] || this.litBells.has(b.id)) continue;
      this.litBells.add(b.id);
      this.world.lightBell(b.id);
      if (announce) this.ui.showToast(`The vale remembers ${b.name}.`);
    }
  }
  private litBells = new Set<string>();

  /** The current goal, shown small in the corner (there are no quest markers). */
  private updateGoal(): void {
    const f = this.flags;
    const rung = LAYOUT.bells.filter((b) => f['rang_' + b.id]).length;
    let goal: string;
    if (!f.met_tilde) goal = 'Speak to the girl among the gravestones.';
    else if (!f.player_named) goal = 'Find Mother Odile at the candle shrine in Candlewick, east along the road.';
    else if (!f.seen_mine) goal = 'Someone is counting in the Old Silver Mine, south-east of the lake.';
    else if (rung < LAYOUT.bells.length) goal = `Ring the forgotten bell towers in the hills (${rung}/${LAYOUT.bells.length}).`;
    else if (!f.seen_hush) goal = 'Follow the grey fog east, to where the world forgets itself.';
    else goal = 'The Hush is spreading. (More of the story follows in the next chapter.)';
    this.ui.setGoal(goal);
  }

  private endDialogue(): void {
    this.syncBells(true);
    this.updateGoal();
    this.dialogue = null;
    this.ui.hideDialogue();
    this.mode = 'playing';
    this.input.clearPressed();
    this.touch.enabled = true;
  }

  // ---------------------------------------------------------------- loop
  start(): void {
    const frame = () => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, this.clock.getDelta());
      this.tick(dt);
    };
    requestAnimationFrame(frame);
  }

  private tick(dt: number): void {
    this.input.poll(dt);
    this.ui.setTouchMode(this.input.touchMode);

    if (this.mode === 'playing') this.updatePlaying(dt);
    else if (this.mode === 'dialogue') this.updateDialogue();
    else if (this.mode === 'paused') {
      if (this.input.consume('pause')) this.setMode('playing');
    } else if (this.mode === 'title') {
      // slow orbit around the cemetery behind the title
      this.titleAngle += dt * 0.05;
      this.cam.yaw = this.titleAngle;
      this.cam.pitch = 0.95;
      this.cam.distance = 22;
      this.cam.update(dt, this.player.position, (x, z) => this.world.height(x, z));
      this.cam.distance = 15;
    }

    for (const n of this.npcs) {
      if (n.wander && this.mode === 'playing') {
        const w = n.wander;
        w.a += (w.speed * dt * 4.2) / w.r;
        const x = w.cx + Math.cos(w.a) * w.r;
        const z = w.cz + Math.sin(w.a) * w.r;
        n.mesh.root.position.set(x, this.world.height(x, z), z);
        n.mesh.root.rotation.y = Math.atan2(Math.sin(w.a), -Math.cos(w.a)) + Math.PI;
        n.target.x = x;
        n.target.z = z;
        n.mesh.animate(dt, w.speed, this.clock.elapsedTime);
      } else n.mesh.animate(dt, 0, this.clock.elapsedTime);
    }
    this.renderer.setHush(this.world.hushHere);
    this.world.update(dt, this.hour, this.player.position, this.cam.camera);
    this.renderer.render(dt);
    if (this.mode === 'dialogue') this.portrait.render(dt);
    this.ui.update(dt);
    this.input.endFrame();
    this.input.clearPressed(); // unconsumed presses never leak into the next frame

    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = this.fpsFrames / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsFrames = 0;
      this.ui.setFps(this.settings.showFps, this.fps);
    }
  }

  private updatePlaying(dt: number): void {
    const s = this.input.state;
    this.cam.rotate(s.lookX, s.lookY);
    this.cam.zoom(s.zoom);
    if (this.input.consume('view')) this.ui.showToast('View: ' + this.cam.cyclePreset());
    if (this.input.consume('freecam')) this.toggleFreeCam();
    if (this.input.consume('center') && this.cam.free) this.toggleFreeCam();
    if (this.cam.free) {
      // free camera: the stick / WASD moves the camera, the Unsung waits
      this.cam.pan(s.moveX, s.moveY, dt * (s.run ? 2.2 : 1));
      this.player.update(dt, 0, 0, false, this.cam.yaw, false);
    } else {
      this.player.update(dt, s.moveX, s.moveY, s.run, this.cam.yaw, this.input.consume('jump'));
    }
    this.cam.update(dt, this.player.position, (x, z) => this.world.height(x, z));
    this.hour = (this.hour + dt / SECONDS_PER_GAME_HOUR) % 24;

    const targets: Target[] = [...this.world.interactables, ...this.npcs.map((n) => n.target)];
    this.target = findTarget(this.player.position.x, this.player.position.z, this.player.yaw, targets);
    this.ui.setPrompt(this.target ? `${this.target.verb}${this.target.name ? ' · ' + this.target.name : ''}` : null, this.input.touchMode);

    const place = placeName(this.player.position.x, this.player.position.z);
    if (place !== this.lastPlace) {
      this.lastPlace = place;
      this.ui.showPlace(place);
    }

    if (this.input.consume('time')) this.hour = (this.hour + 1) % 24; // debug: T skips an hour
    if (this.input.consume('pause')) {
      this.save();
      this.setMode('paused');
      return;
    }
    if (this.input.consume('interact') && this.target) {
      this.startDialogue(this.target);
      return;
    }
    this.autosave += dt;
    if (this.autosave > AUTOSAVE_SECONDS) this.save();
  }

  private updateDialogue(): void {
    if (this.input.consume('up')) this.ui.moveChoice(-1);
    if (this.input.consume('down')) this.ui.moveChoice(1);
    for (const [k, i] of [['n1', 0], ['n2', 1], ['n3', 2], ['n4', 3]] as const) {
      if (this.input.consume(k)) this.dialogueChoose(i);
    }
    const a = this.input.consume('interact');
    const b = this.input.consume('confirm');
    if (a || b) this.dialogueAdvance();
    this.input.consume('pause');
  }

  /** Hooks for the automated browser test (e2e/smoke.mjs). Harmless in play. */
  private exposeDebug(): void {
    (window as unknown as { __threnod: unknown }).__threnod = {
      state: () => ({
        mode: this.mode,
        hour: this.hour,
        player: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z, yaw: this.player.yaw },
        target: this.target?.id ?? null,
        dialogue: this.dialogue ? { text: this.dialogue.node.text, choices: this.dialogue.choices.length } : null,
        flags: { ...this.flags },
        internal: [this.renderer.width, this.renderer.height],
        fps: this.fps,
        cam: { distance: this.cam.distance, pitch: this.cam.pitch, yaw: this.cam.yaw, free: this.cam.free, x: this.cam.camera.position.x, z: this.cam.camera.position.z },
      }),
      setHour: (h: number) => (this.hour = h),
      setCamera: (distance: number, pitch: number, yawOffset: number) => {
        this.cam.distance = distance;
        this.cam.pitch = pitch;
        this.cam.yaw = this.player.yaw + yawOffset;
        this.cam.snap();
      },
      teleport: (x: number, z: number, yaw: number) => {
        this.player.place(x, z, yaw);
        this.cam.yaw = yaw;
        this.cam.snap();
      },
    };
  }
}
