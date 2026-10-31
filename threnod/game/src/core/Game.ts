import * as THREE from 'three';
import { Renderer } from '../render/Renderer';
import { World } from '../world/World';
import { Player } from '../player/Player';
import { Humanoid } from '../character/Humanoid';
import { tildeSpec } from '../character/figures';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { Input } from '../input/Input';
import { TouchControls } from '../input/TouchControls';
import { UI } from '../ui/UI';
import { findTarget, placeName, type Target } from '../interaction/Interaction';
import { DialogueRunner, type DialogueGraph, type Flags } from '../dialogue/Dialogue';
import { Storage, type Settings } from '../save/Save';
import dialogues from '../data/dialogues.json';

type Mode = 'title' | 'playing' | 'dialogue' | 'paused';

const START_HOUR = 21; // the game begins at night, under the orange moon
const SECONDS_PER_GAME_HOUR = 60; // one in-game day = 24 real minutes
const AUTOSAVE_SECONDS = 30;

interface Npc {
  mesh: Humanoid;
  target: Target;
  baseYaw: number;
}

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

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.settings = Storage.loadSettings();
    this.world = new World();
    this.player = new Player(this.world);
    this.world.scene.add(this.player.mesh.root);
    this.cam = new ThirdPersonCamera(1);
    // soft fill light that follows the camera so faces stay readable at night
    const fill = new THREE.PointLight(0xffd4b4, 1.25, 9, 1.4);
    this.cam.camera.add(fill);
    this.world.scene.add(this.cam.camera);
    this.renderer = new Renderer(canvas, this.world.scene, this.cam.camera, {
      quality: this.settings.quality,
      bloom: this.settings.bloom,
      grain: this.settings.grain,
      retro: this.settings.retro,
    });
    this.input = new Input(canvas);
    this.touch = new TouchControls(canvas, this.input);
    this.applySettings();
    this.spawnNpcs();

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
        onDialogueAdvance: () => this.dialogueAdvance(),
        onDialogueChoose: (i) => this.dialogueChoose(i),
      },
      this.settings,
    );

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

  private spawnNpcs(): void {
    // Tilde, the gravedigger's girl, waits by the open grave.
    const mesh = new Humanoid(tildeSpec());
    const x = this.world.spawn.x - 5.5;
    const z = this.world.spawn.z + 3.2;
    mesh.root.position.set(x, this.world.height(x, z), z);
    const baseYaw = Math.atan2(-(this.world.spawn.x - x), -(this.world.spawn.z - z));
    mesh.root.rotation.y = baseYaw;
    this.world.scene.add(mesh.root);
    this.world.colliders.push({ x, z, r: 0.45 });
    this.npcs.push({ mesh, baseYaw, target: { id: 'tilde', name: 'Tilde', x, z, radius: 3, verb: 'Talk', dialogue: 'tilde_first' } });
  }

  private applySettings(): void {
    const s = this.settings;
    this.renderer.setOptions({ quality: s.quality, bloom: s.bloom, grain: s.grain, retro: s.retro });
    this.world.sky.setShadowSize(this.renderer.shadowSize);
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
    this.cam.pitch = 0.3;
    this.cam.snap();
    this.lastPlace = '';
    this.setMode('playing');
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
    this.ui.showDialogue(this.dialogue.node, this.dialogue.choices, this.input.touchMode);
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

  private endDialogue(): void {
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
      this.cam.pitch = 0.22;
      this.cam.distance = 11;
      this.cam.update(dt, this.player.position, (x, z) => this.world.height(x, z));
      this.cam.distance = 6.2;
    }

    for (const n of this.npcs) n.mesh.animate(dt, 0, this.clock.elapsedTime);
    this.world.update(dt, this.hour, this.player.position, this.cam.camera);
    this.renderer.render(dt);
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
    this.player.update(dt, s.moveX, s.moveY, s.run, this.cam.yaw);
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
