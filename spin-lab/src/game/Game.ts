// Game controller: owns the scene objects and runs intro, menus, experiments and the finale.

import * as THREE from 'three';
import { COACH, LAUNCH, PALETTE, SUBSTANCES, TABLE, type SubstanceId } from '../config';
import { sound } from '../audio/Sound';
import { simulate, sampleAt, type SimResult } from '../physics/ballPhysics';
import { launchVectors, MAX_SPIN, toRpm, type ShotInput } from '../physics/shot';
import { Renderer } from '../render/Renderer';
import { Lab } from '../render/Lab';
import { BallView } from '../render/BallView';
import { Fx } from '../render/Fx';
import { DrSpinBot } from '../render/DrSpinBot';
import { CameraRig, type Shot } from '../render/CameraRig';
import { SpinPad, SwipeInput, spinLabel, type SwipeIntent } from '../input/Gesture';
import {
  EXPERIMENTS, GRAVITY_CYCLE, GRAVITY_PHASES, buildEnv, evaluateShot, experimentById, gravityPhase,
  type ExperimentDef, type ExperimentId, type ShotOutcome, type StageDef,
} from './experiments';
import { pickLine, type LineKey } from './dialogue';
import { store } from './storage';
import { $, Speech, confirmBox, flash, fmt, fmt1, initConfirm, letterbox, only, retrigger, roundCard, show, toast } from '../ui/Ui';

const TOP = TABLE.height;
const ALL_SCREENS = ['boot', 'intro', 'menu', 'challenges', 'scores', 'lab', 'settings', 'hud', 'summary', 'finaleWin', 'pause'];
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, t)), 3);

type Mode = 'boot' | 'intro' | 'menu' | 'sheet' | 'lab' | 'play' | 'summary' | 'finaleWin';

interface ActiveShot {
  sim: SimResult;
  outcome: ShotOutcome;
  input: ShotInput;
  substance: SubstanceId;
  launchClock: number;
  t: number;
  nextEvent: number;
  resolved: boolean;
  slowFrom: number;
  slowTo: number;
  demo: boolean;
  cinematic: boolean;
  speed: number;
  contacted: boolean;
}

interface Stats {
  score: number;
  shots: number;
  hits: number;
  perfects: number;
  combo: number;
  bestCombo: number;
  mult: number;
  roundsWon: number;
  accSum: number;
  best: { points: number; text: string };
}

const TRAINING: ExperimentDef = {
  id: 'perfect', code: 'TR', name: 'FREIES TRAINING', tagline: 'Nach Methode Rolf: wiederholen, bis es sitzt.',
  intro: 'Freies Training. Keine Punkte, keine Zeugen. Probier alle Substanzen aus.',
  passAt: 99,
  rounds: [{
    attempts: Infinity,
    stage: {
      title: 'TRAININGSFELD',
      brief: 'Experimentiere frei mit Spin und Substanzen.',
      target: { kind: 'disc', pos: () => ({ x: 0, y: TOP, z: -0.8 }), radius: 0.2, perfect: 0.06 },
      obstacles: [],
      substance: 'choose',
    },
  }],
};

const LAB_STATIONS: { title: string; text: string; shot: Shot; bot?: THREE.Vector3 }[] = [
  {
    title: 'DER TISCH',
    text: '2,74 × 1,525 m, 76 cm hoch, abgenommen von Trainer Rolf. Ein rotierender Ball zieht die Luft auf einer Seite mit — das ist der Magnus-Effekt. Topspin drückt den Ball nach unten und lässt ihn nach dem Aufprall nach vorne schießen. Unterschnitt trägt ihn und bremst ihn am Tisch.',
    shot: { pos: v(1.2, 1.1, 1.6), look: v(0, 0.8, -0.2) },
  },
  {
    title: 'CHEMIE-STATION',
    text: 'Vier fiktive Substanzen, null Sicherheitsfreigabe. LIQUID NITRO macht schneller und verstärkt den Spin. MAGNETIC GEL zieht den Ball seitlich zum Ziel. SUPER BOUNCE springt höher, als er fällt. QUANTUM DUST tunnelt durch Wände — und kippt am Netz den Seitenspin.',
    shot: { pos: v(-2.6, 1.8, -0.6), look: v(-4.2, 1.5, -2.6) },
    bot: v(-3.55, 2.45, -2.05),
  },
  {
    title: 'GRAVITATIONSRING',
    text: 'Unser Ringbeschleuniger erzeugt lokale Gravitationsfelder. Im Experiment 03 wechselt die Schwerkraft zwischen 1 g, 0,25 g, 2,6 g und sogar leicht negativ. Das Raster über dem Tisch zeigt dir, was gerade los ist. Für das Finale erzeugt der Ring das R.O.L.F.-Feld (Rotations-Optimiertes Labor-Feld): dreifacher Magnus-Effekt. Benannt nach dem einzigen Menschen, der angeblich auch ohne Feld so schneidet.',
    shot: { pos: v(0.4, 2.2, -2.6), look: v(0, 2.8, -7.2) },
    bot: v(1.2, 2.4, -3.6),
  },
  {
    title: 'MESSSTAND',
    text: 'Jeder Schlag wird komplett vorausberechnet: 480 Physikschritte pro Sekunde mit Luftwiderstand, Magnus-Kraft, Reibung und Rotationsänderung beim Aufprall. Deshalb kann die Zeitlupe nur dann starten, wenn der Treffer wirklich passiert.',
    shot: { pos: v(2.6, 1.9, -0.4), look: v(4.4, 1.8, -2.4) },
    bot: v(3.2, 2.2, -1.2),
  },
  {
    title: 'DR. SPIN',
    text: 'Forschungsroboter, Baujahr unbekannt, Humor-Modul nicht deaktivierbar. Zuständig für Kommentare, Statistik und emotionale Unterstützung. Untersteht direkt Trainer Rolf, was er niemandem erzählt. Zitat: „Der Ball hat mehr Spin als mein gesamtes Betriebssystem.“',
    shot: { pos: v(-0.4, 1.6, 1.9), look: v(-1.0, 1.55, 0.9) },
    bot: v(-0.95, 1.55, 0.95),
  },
];

export class Game {
  private r: Renderer;
  private lab: Lab;
  private ball: BallView;
  private fx: Fx;
  private bot: DrSpinBot;
  private cam: CameraRig;
  private speech: Speech;
  private swipe: SwipeInput;
  private pad: SpinPad;

  private mode: Mode = 'boot';
  private paused = false;
  private time = 0;
  /** Game clock: drives targets, gravity and playback; slows down during slow motion. */
  private clock = 0;
  private timeScale = 1;
  private dim = 0;
  private dimTarget = 0;

  // play state
  private exp: ExperimentDef | null = null;
  private campaign = false;
  private campaignTotal = 0;
  private campaignScores: Partial<Record<ExperimentId, number>> = {};
  private training = false;
  private roundIdx = 0;
  private attempt = 0;
  private stats!: Stats;
  private substance: SubstanceId = 'none';
  private shot: ActiveShot | null = null;
  private aimPreview: SimResult | null = null;
  private ready = false;
  private advanceAt = 0;
  private advanceFn: (() => void) | null = null;
  private lastInputAt = 0;
  private lastIdleLine = 0;
  private finaleFails = 0;
  private assist = false;
  private lastShotInfo = { speed: 0, rpm: 0, apex: 0 };
  private lastPhaseKind = '';
  private announcedSubs = new Set<SubstanceId>();
  private trailEmit = 0;
  private firstShotHint = true;

  // intro / menu / lab
  private introT = -1;
  private introStep = 0;
  private introLine: THREE.Mesh;
  private introSpot: THREE.SpotLight;
  private orbit = 0;
  private demoAt = 0;
  private labIdx = 0;
  private screenTimer = 0;
  private scoreTab = 'campaign';

  constructor() {
    this.r = new Renderer($('stage'));
    const scene = this.r.scene;
    this.lab = new Lab(scene);
    this.ball = new BallView(scene);
    this.fx = new Fx(scene);
    this.bot = new DrSpinBot(scene);
    this.cam = new CameraRig(this.r.camera);
    this.speech = new Speech(this.bot.face);
    this.swipe = new SwipeInput(this.r.renderer.domElement);
    this.pad = new SpinPad($('spinPad'), $('spinDot'));

    // intro props
    this.introLine = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 0.004),
      new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    scene.add(this.introLine);
    this.introSpot = new THREE.SpotLight(0xffffff, 0, 6, 0.35, 0.6, 1.2);
    scene.add(this.introSpot, this.introSpot.target);

    this.r.onQualityChange = (l) => {
      this.lab.setShadowQuality(l === 'high' ? 2048 : l === 'medium' ? 1024 : 512);
      this.fx.setBudget(l === 'low' ? 0.45 : l === 'medium' ? 0.75 : 1);
      this.fx.setViewport(this.r.viewportHeight);
    };
    this.r.setQuality(store.settings.quality);
    sound.setMuted(!store.settings.sound);
    sound.setAmbience(store.settings.ambience);

    this.bindUi();
    this.bindInput();
    this.applyDarkness(1);
    this.ball.resetTrail(v(LAUNCH.x, LAUNCH.y, LAUNCH.z));
    this.cam.go({ pos: v(0.5, 1.35, 1.9), look: v(0, 1.25, 0.6) }, 3, true);
    this.onResize();
    window.addEventListener('resize', () => this.onResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (this.mode === 'play') this.pause(true); sound.suspend(); } else sound.resume();
    });
  }

  // ======================================================================== frame
  frame(dtReal: number, render = true) {
    dtReal = Math.min(dtReal, 1 / 20);
    this.time += dtReal;
    this.r.track(dtReal);
    const live = !this.paused;
    // slow motion window of the current shot
    let target = 1;
    if (this.shot && !this.shot.demo && this.shot.t >= this.shot.slowFrom && this.shot.t <= this.shot.slowTo) target = this.shot.cinematic ? 0.22 : 0.3;
    this.timeScale += (target - this.timeScale) * Math.min(1, dtReal * 10);
    const dt = live ? dtReal * this.timeScale : 0;
    if (live) this.clock += dt;

    if (live) {
      if (this.mode === 'intro') this.updateIntro(dtReal);
      if (this.mode === 'menu' || this.mode === 'sheet') this.updateMenu(dtReal);
      if (this.mode === 'play' || this.mode === 'menu' || this.mode === 'sheet' || this.mode === 'lab' || this.mode === 'finaleWin') this.updateBall(dt, dtReal);
      if (this.mode === 'play') this.updatePlay(dtReal);
      if (this.advanceFn && this.time >= this.advanceAt) { const f = this.advanceFn; this.advanceFn = null; f(); }
    }

    this.lab.update(dtReal, this.time);
    this.fx.update(live ? dt : 0, this.time, this.clock);
    const look = this.shot ? this.ball.mesh.position : this.r.camera.position;
    this.bot.update(dtReal, this.time, look);
    this.cam.update(dtReal, this.time);
    this.speech.update(dtReal);
    this.updateScreens(dtReal);

    this.dim += (this.dimTarget - this.dim) * Math.min(1, dtReal * 3);
    this.r.grade.uniforms.uDim.value = this.dim;
    this.r.grade.uniforms.uAberration.value = this.timeScale < 0.6 ? (1 - this.timeScale) * 0.8 : 0;
    const pl = this.lab.lights.pulse;
    pl.intensity = Math.max(0, pl.intensity - dtReal * 10);
    if (render) this.r.render(this.time);
  }

  // ======================================================================== boot & intro
  private get coachPlays() { return (store.settings.name || '').trim().toUpperCase() === COACH; }

  boot() {
    show('boot');
    const stored = (store.settings.name || 'SPIELER').toUpperCase();
    if (stored !== 'SPIELER' && stored !== COACH) $('bootMe').textContent = stored;
    const enter = (coach: boolean) => {
      if (coach) store.setSettings({ name: COACH });
      else if (this.coachPlays) store.setSettings({ name: 'SPIELER' });
      ($('setName') as HTMLInputElement).value = store.settings.name;
      $('introCoach').textContent = coach ? 'PROBAND: TRAINER ROLF' : 'AUFSICHT: TRAINER ROLF';
      sound.unlock();
      try {
        const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
        if (matchMedia('(pointer: coarse)').matches) (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
      } catch { /* not supported (iPad Safari) — fine */ }
      this.startIntro();
    };
    $('bootBtn').addEventListener('click', () => enter(false), { once: true });
    $('bootCoach').addEventListener('click', () => enter(true), { once: true });
  }

  private applyDarkness(k: number) {
    // k = 1: lab fully dark, 0: fully lit
    const L = this.lab.lights;
    L.key.intensity = 38 * (1 - k);
    L.fill.intensity = 0.35 * (1 - k);
    L.rimL.intensity = 34 * (1 - k);
    L.rimR.intensity = 22 * (1 - k);
    L.accent.intensity = 5 * (1 - k);
    for (const m of this.lab.stripMats) m.opacity = (m.userData.base ??= m.opacity) * (1 - k);
    for (const m of this.lab.coneMats) m.uniforms.uOpacity.value = (m.userData.base ??= m.uniforms.uOpacity.value) * (1 - k);
    this.r.scene.environmentIntensity = 0.35 * (1 - k) + 0.02;
  }

  private startIntro() {
    this.mode = 'intro';
    only(['intro'], ALL_SCREENS);
    this.introT = 0;
    this.introStep = 0;
    sound.powerUp();
    this.ball.setVisible(true);
    this.ball.mesh.position.set(0, 1.25, 0.6);
    this.lab.emitter.visible = false;
    this.bot.group.visible = false;
    $('skipIntro').addEventListener('click', () => this.finishIntro(true), { once: true });
  }

  private updateIntro(dt: number) {
    this.introT += dt;
    const t = this.introT;
    const ballPos = v(0, 1.25, 0.6);
    // ball: slow rotation, hovering
    this.ball.spin({ x: 0.4, y: 1, z: 0.15 }, dt * 0.8);
    this.ball.update(ballPos.clone().setY(1.25 + Math.sin(t * 1.4) * 0.008), false, dt, this.time);
    this.introSpot.position.set(0.6, 2.6, 1.6);
    this.introSpot.target.position.copy(ballPos);
    this.introSpot.intensity = 14 * ease((t - 1.8) / 1.4);
    this.ball.setGlow(PALETTE.cyan, 0.35 * ease((t - 2) / 1.5) * (1 - ease((t - 5) / 1.5)));

    // light line sweep
    const lm = this.introLine.material as THREE.MeshBasicMaterial;
    const lt = (t - 0.7) / 1.3;
    lm.opacity = lt > 0 && lt < 1 ? Math.sin(lt * Math.PI) : 0;
    this.introLine.position.set(-1.6 + lt * 3.2, 1.25, 0.55);
    this.introLine.lookAt(this.r.camera.position);

    // reveal steps with relay clunks
    const steps = [0.7, 2.0, 3.9, 4.3, 4.7, 5.6];
    while (this.introStep < steps.length && t >= steps[this.introStep]) {
      const s = this.introStep++;
      if (s === 0) sound.sweep(true, 0.06);
      if (s === 1) sound.sweep(false, 0.04);
      if (s >= 2 && s <= 4) sound.clunk(0.22 - s * 0.02);
      if (s === 5) { $('intro').classList.add('reveal'); sound.sweep(true, 0.08); setTimeout(() => sound.zap(1.5, 0.12, 0.05), 900); }
    }
    // cones & dust first, then strips, rims, key
    const coneK = ease((t - 1.2) / 1.6);
    for (const m of this.lab.coneMats) m.uniforms.uOpacity.value = m.userData.base * coneK * 0.7;
    if (t > 3.9) {
      const k = 1 - ease((t - 3.9) / 1.6);
      const L = this.lab.lights;
      L.rimL.intensity = 34 * ease((t - 3.9) / 0.5);
      L.rimR.intensity = 22 * ease((t - 4.3) / 0.5);
      L.key.intensity = 38 * ease((t - 4.7) / 0.8);
      L.fill.intensity = 0.35 * (1 - k);
      L.accent.intensity = 5 * (1 - k);
      for (const m of this.lab.stripMats) m.opacity = m.userData.base * (1 - k) * (0.85 + 0.15 * Math.sin(t * 40) * k);
      this.r.scene.environmentIntensity = 0.35 * (1 - k) + 0.02;
      for (const m of this.lab.coneMats) m.uniforms.uOpacity.value = m.userData.base * Math.max(coneK * 0.7, 1 - k);
    }

    // camera: dolly in on the ball, then pull back and rise to reveal the table
    let pos: THREE.Vector3, look: THREE.Vector3;
    if (t < 4.2) {
      const k = ease(t / 4.2);
      pos = v(0.5, 1.35, 1.9).lerp(v(0.1, 1.27, 0.86), k);
      look = ballPos.clone();
    } else {
      const k = easeOut((t - 4.2) / 3.0);
      const a = 0.3 + k * 0.5;
      pos = v(0.1, 1.27, 0.86).lerp(v(Math.sin(a) * 3.6, 2.05, Math.cos(a) * 3.6), k);
      look = ballPos.clone().lerp(v(0, 0.42, -0.2), k);
    }
    if (t > 7.2) {
      // idle orbit after the sequence
      const a = 0.8 + (t - 7.2) * 0.04;
      pos = v(Math.sin(a) * 3.6, 2.05, Math.cos(a) * 3.6);
      look = v(0, 0.42, -0.2);
    }
    this.cam.script = () => ({ pos, look });
  }

  private finishIntro(skipped: boolean) {
    if (this.mode !== 'intro') return;
    if (skipped) {
      this.introT = Math.max(this.introT, 7.3);
      this.introStep = 6;
      $('intro').classList.add('reveal');
      this.applyDarkness(0);
      this.lab.lights.key.intensity = 38;
    }
  }

  private introToMenu() {
    this.applyDarkness(0);
    this.introSpot.intensity = 0;
    (this.introLine.material as THREE.MeshBasicMaterial).opacity = 0;
    this.cam.script = null;
    this.ball.setGlow(PALETTE.cyan, 0);
    this.lab.emitter.visible = true;
    this.bot.group.visible = true;
    this.enterMenu();
    this.say(this.coachPlays ? 'rolfGreet' : 'greet', 2);
  }

  // ======================================================================== menu
  private enterMenu() {
    this.mode = 'menu';
    this.exp = null;
    this.shot = null;
    this.swipe.enabled = false;
    this.dimTarget = 0;
    letterbox(false);
    only(['menu'], ALL_SCREENS);
    this.speech.setSide(true);
    this.fx.target.set(undefined);
    this.fx.obstacles.clear();
    this.fx.traj.hidePast();
    this.fx.traj.hidePreview();
    this.setGravityVisual(1, false);
    this.bot.moveTo(null);
    this.bot.setHome(v(-1.25, 1.55, 0.35));
    $('menuPlayer').textContent = `PROBAND: ${store.settings.name || 'SPIELER'}`;
    this.demoAt = this.time + 1.2;
    this.cam.script = null;
  }

  private menuShot(): Shot {
    const a = 0.55 + Math.sin(this.orbit * 0.6) * 0.35;
    const portrait = innerWidth < innerHeight;
    const R = portrait ? 4.6 : 3.7;
    const pos = v(Math.sin(a) * R, portrait ? 2.6 : 1.85, Math.cos(a) * R);
    const look = v(0, 0.78, -0.1);
    if (!portrait) {
      // push the table to the right half of the frame, away from the menu column
      const fwd = look.clone().sub(pos).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, v(0, 1, 0)).normalize();
      look.addScaledVector(right, -0.85);
    } else look.y -= 0.6;
    return { pos, look };
  }

  private updateMenu(dt: number) {
    this.orbit += dt * 0.12;
    if (this.mode === 'menu' || this.mode === 'sheet') this.cam.go(this.menuShot(), 1.2);
    // background demo rallies keep the lab alive
    if (!this.shot && this.time > this.demoAt) this.demoShot();
  }

  private demoShot() {
    const presets: ShotInput[] = [
      { yaw: -0.12, power: 0.55, spinX: 0.2, spinY: 0.8 },
      { yaw: 0.15, power: 0.3, spinX: -0.5, spinY: -0.3 },
      { yaw: 0.0, power: 0.75, spinX: 0, spinY: 1 },
      { yaw: -0.3, power: 0.45, spinX: 0.9, spinY: 0 },
      { yaw: 0.25, power: 0.2, spinX: -0.2, spinY: -0.8 },
    ];
    const input = presets[Math.floor(Math.random() * presets.length)];
    const subs: SubstanceId[] = ['none', 'none', 'nitro', 'bounce', 'quantum'];
    const sub = subs[Math.floor(Math.random() * subs.length)];
    this.fireShot(input, sub, true);
  }

  // ======================================================================== UI wiring
  private bindUi() {
    initConfirm();
    $('introStart').addEventListener('click', () => { sound.ui('select'); this.introToMenu(); });
    const nav = $('menuNav');
    nav.querySelectorAll('button').forEach((b) => {
      b.addEventListener('pointerenter', () => sound.ui('hover'));
      b.addEventListener('click', () => {
        sound.ui('select');
        const act = (b as HTMLElement).dataset.act;
        if (act === 'campaign') this.startCampaign();
        else if (act === 'challenges') this.openSheet('challenges');
        else if (act === 'scores') this.openSheet('scores');
        else if (act === 'lab') this.openLab();
        else if (act === 'settings') this.openSheet('settings');
      });
    });
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { sound.ui('back'); this.enterMenu(); }));

    // HUD
    $('btnPause').addEventListener('click', () => { sound.ui('tap'); this.pause(true); });
    $('btnSound').addEventListener('click', () => this.toggleSound());
    $('pResume').addEventListener('click', () => { sound.ui('select'); this.pause(false); });
    $('pSound').addEventListener('click', () => this.toggleSound());
    $('pRestart').addEventListener('click', () => {
      confirmBox('NEU STARTEN?', 'Der aktuelle Fortschritt in diesem Experiment geht verloren.', 'NEU STARTEN', () => {
        this.pause(false);
        if (this.training) this.startTraining(); else this.startExperiment(this.exp!.id, this.campaign);
      });
    });
    $('pMenu').addEventListener('click', () => {
      confirmBox('ZUM HAUPTMENÜ?', 'Das laufende Experiment wird abgebrochen.', 'HAUPTMENÜ', () => { this.pause(false); this.enterMenu(); });
    });

    // spin pad
    this.pad.onChange = (x, y) => {
      $('spinLabel').textContent = spinLabel(x, y);
      $('roSpin').textContent = fmt(toRpm(Math.hypot(x, y) * MAX_SPIN));
    };
    this.pad.set(0, 0);

    // summary
    $('sumNext').addEventListener('click', () => { sound.ui('select'); this.summaryNext(); });
    $('sumRetry').addEventListener('click', () => { sound.ui('select'); if (this.exp) this.startExperiment(this.exp.id, this.campaign); });
    $('sumMenu').addEventListener('click', () => { sound.ui('back'); this.enterMenu(); });
    $('fwContinue').addEventListener('click', () => { sound.ui('select'); this.showSummary(); });
    $('fwAgain').addEventListener('click', () => { sound.ui('select'); this.recordRun(); this.startExperiment('finale', this.campaign); });

    // lab tour
    $('labPrev').addEventListener('click', () => { sound.ui('tap'); this.labGo(this.labIdx - 1); });
    $('labNext').addEventListener('click', () => { sound.ui('tap'); this.labGo(this.labIdx + 1); });
    $('labTrain').addEventListener('click', () => { sound.ui('select'); this.startTraining(); });

    // settings
    const setToggle = (id: string, on: boolean) => $(id).classList.toggle('on', on);
    const s = store.settings;
    setToggle('setSound', s.sound); setToggle('setVoice', s.voice); setToggle('setPreview', s.preview);
    ($('setAmb') as HTMLInputElement).value = String(s.ambience);
    ($('setName') as HTMLInputElement).value = s.name;
    $('setSound').addEventListener('click', () => this.toggleSound());
    $('setVoice').addEventListener('click', () => {
      const on = !store.settings.voice;
      store.setSettings({ voice: on }); setToggle('setVoice', on); sound.ui('tap');
      if (on && !('speechSynthesis' in window)) $('setNote').textContent = 'Dieses Gerät bietet keine Sprachausgabe — DR. SPIN bleibt bei Textmeldungen.';
      else if (on) this.say('greet', 2);
    });
    $('setPreview').addEventListener('click', () => { const on = !store.settings.preview; store.setSettings({ preview: on }); setToggle('setPreview', on); sound.ui('tap'); });
    $('setAmb').addEventListener('input', (e) => { const val = Number((e.target as HTMLInputElement).value); store.setSettings({ ambience: val }); sound.setAmbience(val); });
    $('setName').addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      const clean = el.value.toUpperCase().replace(/[^A-Z0-9ÄÖÜ .\-]/g, '').slice(0, 12);
      if (clean !== el.value) el.value = clean;
      store.setSettings({ name: clean.trim() || 'SPIELER' });
    });
    $('setName').addEventListener('keydown', (e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); });
    $('setQuality').querySelectorAll('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.q === s.quality);
      b.addEventListener('click', () => {
        const q = b.dataset.q as typeof s.quality;
        store.setSettings({ quality: q });
        this.r.setQuality(q);
        $('setQuality').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        sound.ui('tap');
      });
    });
    $('setReset').addEventListener('click', () => {
      confirmBox('BESTENLISTE LÖSCHEN?', 'Alle Highscores auf diesem Gerät werden entfernt.', 'LÖSCHEN', () => {
        store.resetScores();
        $('setNote').textContent = 'Bestenliste gelöscht. DR. SPIN hat nichts gesehen.';
      });
    });
    if (!store.persistent) $('setNote').textContent = 'Hinweis: Lokaler Speicher nicht verfügbar — Ergebnisse gelten nur für diese Sitzung.';

    $('rotateClose').addEventListener('click', () => { $('rotateHint').classList.remove('on'); this.rotateDismissed = true; });

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (this.mode === 'intro' && (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape')) {
        if (this.introT < 7.2) this.finishIntro(true); else this.introToMenu();
      } else if (e.key === 'Escape' || e.key === 'p') {
        if (this.mode === 'play') this.pause(!this.paused);
        else if (this.mode === 'sheet' || this.mode === 'lab') this.enterMenu();
      } else if (e.key === 'm') this.toggleSound();
    });
  }

  private rotateDismissed = false;

  private toggleSound() {
    const on = !store.settings.sound;
    store.setSettings({ sound: on });
    sound.setMuted(!on);
    if (!on) try { speechSynthesis.cancel(); } catch { /* */ }
    $('setSound').classList.toggle('on', on);
    $('btnSound').classList.toggle('muted', !on);
    $('pSound').textContent = `TON: ${on ? 'AN' : 'AUS'}`;
    if (on) sound.ui('tap');
  }

  private openSheet(id: 'challenges' | 'scores' | 'settings') {
    this.mode = 'sheet';
    only([id], ALL_SCREENS);
    this.speech.setSide(true);
    if (id === 'challenges') this.renderChallenges();
    if (id === 'scores') this.renderScores();
  }

  private renderChallenges() {
    const wrap = $('challengeCards');
    wrap.innerHTML = '';
    const mk = (code: string, name: string, tag: string, best: string, done: boolean, cls: string, onClick: () => void, i: number) => {
      const b = document.createElement('button');
      b.className = 'card ' + cls;
      b.style.animationDelay = `${i * 0.05}s`;
      b.innerHTML = `<div class="c-code"><span>${code}</span>${done ? '<span class="done">✓ BESTANDEN</span>' : ''}</div>
        <div class="c-name">${name}</div><div class="c-tag">${tag}</div>
        <div class="c-best"><span>BESTWERT</span><b>${best}</b></div>`;
      b.addEventListener('pointerenter', () => sound.ui('hover'));
      b.addEventListener('click', () => { sound.ui('select'); onClick(); });
      wrap.appendChild(b);
    };
    EXPERIMENTS.forEach((e, i) => mk(`EXPERIMENT ${e.code}`, e.name, e.tagline, store.best(e.id) ? fmt(store.best(e.id)) : '—',
      store.isCompleted(e.id), e.id === 'finale' ? 'finale' : '', () => this.startExperiment(e.id, false), i));
    mk('LABOR', 'FREIES TRAINING', 'Nach Methode Rolf: wiederholen, bis es sitzt.', '∞', false, '', () => this.startTraining(), EXPERIMENTS.length);
  }

  private renderScores() {
    const tabs = $('scoreTabs');
    tabs.innerHTML = '';
    const ids: [string, string][] = [['campaign', 'KAMPAGNE'], ...EXPERIMENTS.map((e) => [e.id, `${e.code} ${e.name}`] as [string, string])];
    for (const [id, label] of ids) {
      const b = document.createElement('button');
      b.textContent = label;
      b.classList.toggle('on', id === this.scoreTab);
      b.addEventListener('click', () => { this.scoreTab = id; sound.ui('tap'); this.renderScores(); });
      tabs.appendChild(b);
    }
    const list = $('scoreList');
    const rows = store.scores(this.scoreTab);
    list.innerHTML = rows.length ? '' : '<div class="empty">Noch keine Messwerte. Das Labor wartet auf seinen ersten Probanden.</div>';
    rows.forEach((r, i) => {
      const d = new Date(r.date);
      const el = document.createElement('div');
      el.className = 'score-row' + (i === 0 ? ' first' : '');
      el.style.animationDelay = `${i * 0.05}s`;
      el.innerHTML = `<span class="pos">#${i + 1}</span><span class="nm">${r.name}</span><span class="sc">${fmt(r.score)}</span>
        <span class="rk">${r.rank}<br><span class="dim">${d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span></span>`;
      list.appendChild(el);
    });
    $('scoreNote').textContent = store.persistent ? 'Gespeichert auf diesem Gerät.' : 'Lokaler Speicher nicht verfügbar — Werte gelten nur für diese Sitzung.';
  }

  // ======================================================================== lab tour
  private openLab() {
    this.mode = 'lab';
    only(['lab'], ALL_SCREENS);
    this.speech.setSide(true);
    this.labGo(0);
  }

  private labGo(i: number) {
    const n = LAB_STATIONS.length;
    this.labIdx = (i + n) % n;
    const st = LAB_STATIONS[this.labIdx];
    $('labCode').textContent = `STATION ${this.labIdx + 1}/${n}`;
    $('labTitle').textContent = st.title;
    $('labText').textContent = st.text;
    retrigger($('labTitle'), 'x');
    this.cam.go(st.shot, 1.6);
    this.bot.moveTo(st.bot ?? null);
    if (this.labIdx === 4) this.say('greet', 2);
  }

  // ======================================================================== experiments
  private startCampaign() {
    this.campaignTotal = 0;
    this.campaignScores = {};
    this.startExperiment('perfect', true);
  }

  private startTraining() {
    this.training = true;
    this.beginRun(TRAINING, false);
  }

  private startExperiment(id: ExperimentId, campaign: boolean) {
    this.training = false;
    this.beginRun(experimentById(id), campaign);
  }

  private beginRun(exp: ExperimentDef, campaign: boolean) {
    this.exp = exp;
    this.campaign = campaign;
    this.recorded = null;
    this.mode = 'play';
    this.paused = false;
    this.shot = null;
    this.advanceFn = null;
    this.finaleFails = 0;
    this.assist = false;
    this.stats = { score: 0, shots: 0, hits: 0, perfects: 0, combo: 0, bestCombo: 0, mult: 1, roundsWon: 0, accSum: 0, best: { points: 0, text: '—' } };
    this.roundIdx = 0;
    this.substance = 'none';
    this.dimTarget = 0;
    letterbox(false);
    only(['hud'], ALL_SCREENS);
    this.speech.setSide(false);
    this.cam.script = null;
    this.cam.setPortrait(innerWidth < innerHeight, Math.min(innerWidth, innerHeight) < 600);
    this.cam.go(this.cam.playShot(), 1.8);
    this.bot.setHome(innerWidth < innerHeight ? v(-0.75, 1.55, -0.2) : v(-1.25, 1.4, -0.45));
    this.bot.moveTo(null);
    $('hudCode').textContent = exp.code === 'TR' ? 'LABOR · TRAINING' : `EXPERIMENT ${exp.code}`;
    $('hudName').textContent = exp.name;
    $('hudScore').textContent = '0';
    $('hudMult').textContent = exp.multiplier ? '×1' : '';
    $('btnSound').classList.toggle('muted', !store.settings.sound);
    $('pSound').textContent = `TON: ${store.settings.sound ? 'AN' : 'AUS'}`;
    this.fx.traj.hidePast();
    $('analysis').classList.remove('on');
    this.updateRotateHint();
    this.say(null, 2, exp.intro, 'talk');
    this.startRound();
  }

  private get round() { return this.exp!.rounds[this.roundIdx]; }
  private get stage(): StageDef { return this.round.stage; }

  private startRound() {
    const st = this.stage;
    this.attempt = 0;
    this.fx.target.set(st.target);
    this.fx.obstacles.set(st.obstacles, this.exp!.id === 'finale');
    this.fx.traj.hidePast();
    $('hudRound').textContent = st.title;
    $('hudBrief').textContent = st.brief;
    $('fieldBadge').classList.toggle('on', !!st.magnusScale);
    const grav = !!st.gravity;
    $('gravityBar').classList.toggle('on', grav);
    if (grav) this.buildGravityTrack();
    this.setGravityVisual(1, grav);
    if (st.substance && st.substance !== 'choose') this.substance = st.substance;
    else if (!st.substance) this.substance = 'none';
    this.renderSubstances();
    this.renderPips();
    const code = this.exp!.code === 'TR' ? 'TRAINING' : `EXPERIMENT ${this.exp!.code}`;
    roundCard(code, st.title, st.brief);
    this.spawnBall();
  }

  private renderPips() {
    const p = $('hudPips');
    p.innerHTML = '';
    const n = this.round.attempts;
    if (!isFinite(n)) { p.textContent = this.attempt ? `VERSUCH ${this.attempt + 1}` : ''; return; }
    for (let i = 0; i < n; i++) {
      const el = document.createElement('i');
      if (i < this.attempt) el.className = 'used';
      else if (i === this.attempt) el.className = 'live';
      p.appendChild(el);
    }
  }

  private renderSubstances() {
    const wrap = $('substances');
    const mode = this.stage.substance;
    wrap.innerHTML = '';
    wrap.classList.toggle('on', !!mode);
    if (!mode) return;
    const opts: SubstanceId[] = mode === 'choose' ? ['none', 'nitro', 'magnet', 'bounce', 'quantum'] : [mode];
    for (const id of opts) {
      const b = document.createElement('button');
      const def = id === 'none' ? null : SUBSTANCES[id];
      b.className = 'sub-btn' + (id === 'none' ? ' none' : '') + (mode !== 'choose' ? ' locked' : '') + (this.substance === id ? ' on' : '');
      b.style.setProperty('--c', def?.css ?? '#8899aa');
      b.innerHTML = `<small>${def?.formula ?? 'H₂O (langweilig)'}</small><b>${def?.name ?? 'OHNE'}</b>`;
      if (mode === 'choose') b.addEventListener('click', (e) => { e.stopPropagation(); this.chooseSubstance(id); });
      wrap.appendChild(b);
    }
  }

  private chooseSubstance(id: SubstanceId) {
    if (this.substance === id) return;
    this.substance = id;
    sound.ui('select');
    if (id !== 'none') {
      sound.zap(id === 'quantum' ? 1.6 : id === 'nitro' ? 0.7 : 1.1, 0.2, 0.08);
      const c = SUBSTANCES[id].color;
      this.fx.particles.burst(LAUNCH, { count: 26, color: c, speed: 0.8, life: 0.7, size: 0.018, drag: 3 });
      if (!this.announcedSubs.has(id)) { this.announcedSubs.add(id); this.say(id as LineKey, 2); }
    }
    this.renderSubstances();
    this.applyBallLook();
  }

  private applyBallLook() {
    const c = this.substance === 'none' ? PALETTE.cyan : SUBSTANCES[this.substance].color;
    this.ball.setTrailColor(c);
    this.ball.setTint(c, this.substance === 'none' ? 0 : 0.35);
    this.ball.setGlow(c, this.substance === 'none' ? 0.0 : 0.25);
  }

  private spawnBall() {
    this.shot = null;
    this.ready = true;
    this.swipe.enabled = true;
    this.lastInputAt = this.time;
    this.ball.setVisible(true);
    this.ball.resetTrail(v(LAUNCH.x, LAUNCH.y, LAUNCH.z));
    this.applyBallLook();
    this.fx.particles.burst(LAUNCH, { count: 14, color: PALETTE.cyan, speed: 0.4, life: 0.5, size: 0.012, drag: 4 });
    this.cam.go(this.cam.playShot(), 1.8);
    $('swipeHint').classList.toggle('on', this.firstShotHint);
    if (this.firstShotHint && this.exp && this.roundIdx === 0) this.advance(3.2, () => { if (this.firstShotHint && this.ready) this.say('firstShot', 2); });
  }

  private advance(delay: number, fn: () => void) { this.advanceAt = this.time + delay; this.advanceFn = fn; }

  // ======================================================================== input → shot
  private bindInput() {
    this.swipe.onStart = () => { this.lastInputAt = this.time; };
    this.swipe.onMove = (i) => this.onAim(i);
    this.swipe.onEnd = (i) => {
      $('powerFill').style.width = '0%';
      this.fx.traj.hidePreview();
      this.aimPreview = null;
      if (!i || !this.ready || this.mode !== 'play' || this.paused) {
        if (this.ready && this.mode === 'play') $('roPower').textContent = '—';
        return;
      }
      this.fire(i);
    };
  }

  private currentInput(i: SwipeIntent): ShotInput {
    return { yaw: i.yaw, power: i.power, spinX: this.pad.x, spinY: this.pad.y };
  }

  private onAim(i: SwipeIntent) {
    if (!this.ready || this.mode !== 'play') return;
    this.lastInputAt = this.time;
    const input = this.currentInput(i);
    const l = launchVectors(input, this.substance);
    $('powerFill').style.width = `${Math.round(i.power * 100)}%`;
    $('roPower').textContent = i.valid ? `${Math.round(i.power * 100)}%` : '—';
    $('roSpeed').textContent = fmt1(l.speed);
    if (!store.settings.preview && !this.assist) return;
    const env = buildEnv(this.stage, this.substance);
    const horizon = this.assist ? 1.2 : 0.3;
    this.aimPreview = simulate(l.pos, l.v, l.w, env, this.clock + this.fx.paddle.leadTime, horizon);
    this.fx.traj.showPreview(this.aimPreview.samples, horizon);
  }

  private fire(i: SwipeIntent) {
    this.ready = false;
    this.swipe.enabled = false;
    this.firstShotHint = false;
    $('swipeHint').classList.remove('on');
    this.fireShot(this.currentInput(i), this.substance, false);
  }

  private fireShot(input: ShotInput, substance: SubstanceId, demo: boolean) {
    const stage: StageDef = demo
      ? { title: '', brief: '', target: { kind: 'disc', pos: () => ({ x: 0, y: TOP, z: -0.8 }), radius: 0.2, perfect: 0.06 }, obstacles: [] }
      : this.stage;
    const l = launchVectors(input, substance);
    const env = buildEnv(stage, substance);
    // the racket needs a moment to reach the ball; the ball leaves exactly at contact
    const lead = this.fx.paddle.leadTime;
    const launchClock = this.clock + lead;
    const sim = simulate(l.pos, l.v, l.w, env, launchClock);
    const outcome = evaluateShot(sim, stage, launchClock);
    const finale = !demo && this.exp?.id === 'finale';
    const cinematic = finale && outcome.success;
    const slow = !demo && outcome.success && (outcome.perfect || finale);
    this.shot = {
      sim, outcome, input, substance, launchClock, t: -lead, nextEvent: 0, resolved: false, demo, cinematic, speed: l.speed,
      contacted: false,
      slowFrom: slow ? outcome.hitTime - (cinematic ? 0.4 : 0.22) : Infinity,
      slowTo: slow ? outcome.hitTime + (cinematic ? 0.12 : 0.25) : -Infinity,
    };
    this.ball.setTrailColor(substance === 'none' ? PALETTE.cyan : SUBSTANCES[substance].color);
    this.ball.resetTrail(v(l.pos.x, l.pos.y, l.pos.z));
    this.fx.paddle.swing(l.pos, l.v, input.spinX, input.spinY, input.power);
    if (demo) return;

    this.stats.shots++;
    this.lastShotInfo = { speed: l.speed, rpm: toRpm(Math.hypot(input.spinX, input.spinY) * MAX_SPIN), apex: sim.apex - TOP };
    if (cinematic) {
      letterbox(true);
      this.dimTarget = 0.35;
      this.cam.script = () => this.cineFollow();
    } else {
      this.cam.go({ pos: this.cam.playShot().pos.clone().add(v(0, 0.06, -0.25)), look: v(0, 0.75, -0.75) }, 2);
    }
    this.fx.traj.hidePast();
    $('analysis').classList.remove('on');
  }

  /** The blade meets the ball. */
  private onContact(s: ActiveShot) {
    s.contacted = true;
    if (s.demo) { sound.hit(s.input.power * 0.5); return; }
    const p = s.sim.samples[0].p;
    sound.hit(s.input.power);
    this.lab.lights.pulse.position.set(p.x, p.y, p.z);
    this.lab.lights.pulse.color.set(PALETTE.cyan);
    this.lab.lights.pulse.intensity = 1.2;
    this.fx.particles.burst(p, { count: 22, color: 0xffffff, speed: 1.6, life: 0.35, size: 0.012, drag: 6 });
    this.fx.waves.spawn({ x: LAUNCH.x, y: 0.0, z: LAUNCH.z }, PALETTE.cyan, 0.5, 0.6, 0.06);
    this.cam.kick(0.5);
  }

  /** Finale camera: chase from behind, then swing to the side the ball curves around the monolith. */
  private cineFollow(): Shot | null {
    const s = this.shot;
    if (!s) return null;
    const b = this.ball.mesh.position;
    const hp = s.outcome.hitPoint;
    const pass = s.sim.samples.find((p) => p.p.z < -0.17) ?? s.sim.samples[0];
    const side = Math.sign(pass.p.x) || -1;
    const k = ease((s.t / Math.max(0.2, s.outcome.hitTime) - 0.12) / 0.45);
    const chase = b.clone().add(v(0, 0.22, 0.75));
    const flank = v(side * 1.3, TOP + 0.42, hp.z + 0.15).lerp(v(side * 1.05, TOP + 0.3, hp.z + 0.05), k);
    const pos = chase.lerp(flank, k);
    const look = b.clone().lerp(v(hp.x, TOP + 0.04, hp.z), 0.2 + 0.3 * k);
    return { pos, look };
  }

  // ======================================================================== per-frame play logic
  private updateBall(dt: number, dtReal: number) {
    const s = this.shot;
    const p = new THREE.Vector3();
    if (!s) {
      // hovering in the emitter; bob reacts to gravity
      const g = this.fx.gravity;
      const amp = g < 0.5 ? 0.02 : g > 1.5 ? 0.004 : 0.008;
      p.set(LAUNCH.x, LAUNCH.y + Math.sin(this.time * (g < 0.5 ? 1.2 : 2.4)) * amp, LAUNCH.z);
      this.ball.spin({ x: 0.2, y: 1, z: 0 }, dtReal * 0.6);
      this.ball.update(p, false, dtReal, this.time);
      return;
    }
    s.t += dt;
    if (s.t < 0) {
      // waiting for the racket: the ball still hovers in the emitter
      p.set(LAUNCH.x, LAUNCH.y, LAUNCH.z);
      this.ball.update(p, false, dtReal, this.time);
      return;
    }
    if (!s.contacted) this.onContact(s);
    const smp = sampleAt(s.sim, s.t, p);
    this.ball.spin(smp.w, dt);
    this.ball.update(p, true, dtReal, this.time, s.substance === 'quantum');
    if (!s.demo && s.substance !== 'none') this.emitSubstanceTrail(s.substance, p, dt);

    // fire physics events
    const evs = s.sim.events;
    while (s.nextEvent < evs.length && evs[s.nextEvent].t <= s.t) this.onPhysEvent(evs[s.nextEvent++], s);

    if (!s.demo && !s.resolved && s.t >= s.outcome.hitTime) this.resolveShot(s);

    const end = Math.min(s.sim.duration, s.demo ? 2.2 : s.outcome.hitTime + (s.cinematic ? 0.6 : 1.05));
    if (s.t >= end) {
      if (s.demo) { this.shot = null; this.demoAt = this.time + 1.4 + Math.random() * 1.5; }
      else this.afterShot(s);
    }
  }

  private emitSubstanceTrail(sub: SubstanceId, p: THREE.Vector3, dt: number) {
    this.trailEmit += dt;
    if (this.trailEmit < 0.025) return;
    this.trailEmit = 0;
    const c = SUBSTANCES[sub as Exclude<SubstanceId, 'none'>].color;
    if (sub === 'nitro') this.fx.particles.burst(p, { count: 3, color: 0xe6fbff, speed: 0.25, life: 0.7, size: 0.014, gravity: 0.8, drag: 2 });
    else if (sub === 'magnet') this.fx.particles.burst(p, { count: 2, color: c, speed: 0.6, life: 0.35, size: 0.01, drag: 5 });
    else if (sub === 'bounce') this.fx.particles.burst(p, { count: 2, color: c, speed: 0.2, life: 0.5, size: 0.012, drag: 2 });
    else this.fx.particles.burst(p, { count: 3, color: c, speed: 0.5, life: 0.45, size: 0.012, drag: 3, spread: { x: 0.04, y: 0.04, z: 0.04 } });
  }

  private onPhysEvent(e: SimResult['events'][number], s: ActiveShot) {
    const vol = s.demo ? 0.5 : 1;
    switch (e.type) {
      case 'table':
        sound.bounce(e.speed * vol, 'table');
        this.fx.waves.spawn({ x: e.p.x, y: TOP, z: e.p.z }, s.substance === 'bounce' ? SUBSTANCES.bounce.color : PALETTE.cyan, 0.12 + e.speed * 0.012, 0.5, 0.12);
        this.fx.particles.burst({ x: e.p.x, y: TOP + 0.01, z: e.p.z }, { count: 8, color: 0xcfefff, speed: 0.6, life: 0.3, size: 0.008, drag: 5, up: 1 });
        break;
      case 'floor':
        sound.bounce(e.speed * 0.6 * vol, 'floor');
        break;
      case 'net':
        sound.net();
        break;
      case 'netcord':
        sound.net(); sound.bounce(3, 'table');
        if (!s.demo) this.say('netcord', 2);
        break;
      case 'obstacle': {
        const glass = this.stage.obstacles.find((b) => b.id === e.id)?.kind === 'glass';
        sound.thud(glass);
        this.fx.obstacles.flash(e.id);
        this.fx.particles.burst(e.p, { count: 24, color: glass ? PALETTE.cyan : PALETTE.orange, speed: 1.4, life: 0.45, size: 0.012, drag: 4 });
        this.cam.kick(0.6);
        break;
      }
      case 'tunnel':
        sound.zap(1.8, 0.3, 0.12);
        this.fx.obstacles.flash(e.id);
        this.fx.particles.burst(e.p, { count: 40, color: SUBSTANCES.quantum.color, speed: 1.2, life: 0.6, size: 0.016, drag: 3 });
        if (!s.demo && e.id !== 'net') this.say('tunnel');
        break;
      case 'spinflip':
        if (!s.demo) sound.zap(2.2, 0.08, 0.05);
        break;
      case 'gravity':
        break;
    }
  }

  private resolveShot(s: ActiveShot) {
    s.resolved = true;
    const o = s.outcome;
    const st = this.stats;
    const exp = this.exp!;
    if (o.success) {
      st.hits++;
      st.combo++;
      st.bestCombo = Math.max(st.bestCombo, st.combo);
      st.accSum += o.accuracy;
      if (o.perfect) st.perfects++;
      const pts = this.scoreShot(s);
      this.scoreCache.set(s, pts.total);
      st.score += pts.total;
      if (exp.multiplier) st.mult = Math.min(5, st.mult + 1);
      if (pts.total > st.best.points) st.best = { points: pts.total, text: pts.desc };
      this.bumpScore();
      this.fx.target.flash();
      const hp = o.hitPoint;
      const hot = o.perfect || exp.id === 'finale';
      const col = hot ? PALETTE.orange : PALETTE.cyan;
      this.fx.flareAt(hp, col, hot ? 0.9 : 0.5);
      this.fx.waves.spawn({ x: hp.x, y: this.stage.target.kind === 'disc' ? TOP : hp.y, z: hp.z }, col, hot ? 0.9 : 0.5, hot ? 1.1 : 0.7, 0.05);
      this.fx.particles.burst(hp, { count: hot ? 90 : 45, color: col, speed: hot ? 2.6 : 1.6, life: hot ? 1.0 : 0.7, size: 0.016, gravity: 1.5, up: 0.8, drag: 2 });
      this.lab.lights.pulse.position.set(hp.x, TOP + 0.3, hp.z);
      this.lab.lights.pulse.color.set(col);
      this.lab.lights.pulse.intensity = hot ? 7 : 4;
      this.cam.kick(hot ? 1 : 0.6);
      sound.success(o.perfect);
      if (exp.id === 'finale' && !this.training) { this.finaleSuccess(s, pts.total); return; }
      toast(o.perfect ? 'PERFEKT' : 'TREFFER', `+${fmt(pts.total)}  ·  ${pts.tags.join(' · ')}`, o.perfect ? 'hot' : '');
      if (o.perfect) flash();
      const curve = Math.abs(s.input.spinX) > 0.6;
      if (st.combo >= 3 && st.combo % 3 === 0) this.say('combo', 2);
      else if (curve && Math.random() < 0.6) this.say('curve', 2);
      else if (Math.random() < 0.3) this.say(this.coachPlays ? 'selfHit' : 'coachHit', 2);
      else this.say(o.perfect ? 'perfect' : 'hit', o.perfect ? 2 : 1);
    } else {
      st.combo = 0;
      let penalty = 0;
      if (exp.multiplier) { penalty = Math.min(st.score, 150); st.score -= penalty; this.bumpScore(); }
      sound.miss();
      const labels: Record<string, string> = {
        net: 'NETZ', own: 'EIGENE SEITE', long: 'ZU LANG', wide: 'SEITLICH AUS', obstacle: 'HINDERNIS',
        miss: 'KNAPP DANEBEN', slow: 'ZU LANGSAM', ring: 'RING VERFEHLT', short: 'ZU KURZ',
      };
      const sub = o.reason === 'miss' ? `${fmt(o.distance * 100)} cm neben dem Ziel` : o.reason === 'slow' ? `${fmt1(o.impactSpeed)} m/s — benötigt ${fmt1(this.stage.target.minSpeed ?? 0)}` : penalty ? `−${penalty} PUNKTE` : '';
      toast(labels[o.reason ?? 'miss'], sub, 'bad');
      if (exp.id === 'finale') this.finaleFail();
      else {
        const key: LineKey = o.reason === 'miss' ? (o.distance < this.stage.target.radius * 2 ? 'close' : 'wide') : (o.reason as LineKey);
        this.say(Math.random() < 0.3 ? (this.coachPlays ? 'selfMiss' : 'coachMiss') : key);
      }
    }
  }

  private scoreShot(s: ActiveShot) {
    const o = s.outcome;
    const exp = this.exp!;
    const tags: string[] = [];
    const rpm = toRpm(Math.hypot(s.input.spinX, s.input.spinY) * MAX_SPIN);
    let total: number;
    if (exp.id === 'finale') {
      total = 6000 + Math.round(o.accuracy * 2000) + Math.max(0, 2500 - this.finaleFails * 250);
      tags.push('UNMÖGLICH');
    } else {
      let base = 400 + Math.round(600 * o.accuracy);
      if (o.perfect) { base += 500; tags.push('PERFEKT'); }
      const spinB = Math.round(rpm / 8);
      if (spinB > 40) tags.push(`${fmt(rpm)} U/MIN`);
      const speedB = Math.round(o.impactSpeed * 12);
      let special = 0;
      if (Math.abs(s.input.spinX) > 0.6) { special += 150; tags.push('KURVE'); }
      if (s.sim.events.some((e) => e.type === 'tunnel' && e.id !== 'net')) { special += 120; tags.push('TUNNEL'); }
      if (s.sim.events.some((e) => e.type === 'netcord')) { special += 200; tags.push('NETZKANTE'); }
      const attemptF = [1, 0.75, 0.55][Math.min(2, this.attempt)];
      const comboF = exp.multiplier ? this.stats.mult : 1 + 0.15 * Math.max(0, this.stats.combo - 1);
      if (exp.multiplier) tags.push(`×${this.stats.mult}`);
      else if (this.stats.combo > 1) tags.push(`KOMBO ${this.stats.combo}`);
      total = Math.round((base + spinB + speedB + special) * attemptF * comboF);
    }
    if (this.training) total = 0;
    if (!tags.length) tags.push(`${Math.round(o.accuracy * 100)} % GENAU`);
    const desc = `${o.perfect ? 'Perfekt' : 'Treffer'} · ${fmt(rpm)} U/min · ${fmt1(s.speed)} m/s · ${fmt(o.distance * 100)} cm`;
    return { total, tags, desc };
  }

  private bumpScore() {
    $('hudScore').textContent = fmt(this.stats.score);
    retrigger($('hudScore'), 'bump');
    if (this.exp?.multiplier) $('hudMult').textContent = `×${this.stats.mult}`;
  }

  private afterShot(s: ActiveShot) {
    const o = s.outcome;
    this.shot = null;
    // the finale's success sequence takes over from here
    if (s.cinematic && !this.training) return;
    // persist the actual trajectory and a compact analysis
    this.fx.traj.showPast(s.sim.samples, Math.min(s.sim.duration, o.hitTime + 0.6), o.success ? (o.perfect ? PALETTE.orange : PALETTE.cyan) : 0x8aa0b0, o.hitPoint);
    this.showAnalysis(s);
    this.updateMonitors(s);
    this.attempt++;
    const round = this.round;
    const done = o.success || this.attempt >= round.attempts;
    if (this.training) { this.advance(0.5, () => this.spawnBall()); return; }
    if (!done) {
      this.renderPips();
      if (!o.success && this.stage.hint && this.attempt === 2 && this.exp!.id !== 'finale') this.say(null, 2, this.stage.hint, 'thinking');
      this.advance(0.55, () => this.spawnBall());
      return;
    }
    if (o.success) this.stats.roundsWon++;
    this.renderPips();
    this.advance(1.6, () => {
      $('analysis').classList.remove('on');
      if (this.roundIdx + 1 < this.exp!.rounds.length) { this.roundIdx++; this.startRound(); }
      else this.finishExperiment();
    });
  }

  private showAnalysis(s: ActiveShot) {
    const o = s.outcome;
    const verdict = $('anVerdict');
    verdict.textContent = o.success ? (o.perfect ? 'PERFEKT' : 'TREFFER') : 'FEHLVERSUCH';
    verdict.className = 'an-verdict ' + (o.success ? (o.perfect ? 'hot' : 'ok') : '');
    const rpm = toRpm(Math.hypot(s.input.spinX, s.input.spinY) * MAX_SPIN);
    const spinKind = spinLabel(s.input.spinX, s.input.spinY).split(' · ')[0];
    const rows: [string, string][] = [
      ['ABSCHUSS', `${fmt1(s.speed)} m/s`],
      ['AUFPRALL', o.impactSpeed ? `${fmt1(o.impactSpeed)} m/s` : '—'],
      ['ROTATION', `${fmt(rpm)} U/min`],
      ['SPIN', spinKind],
      ['SCHEITELHÖHE', `${fmt((s.sim.apex - TOP) * 100)} cm`],
      ['ZIELABWEICHUNG', isFinite(o.distance) ? `${fmt(o.distance * 100)} cm` : '—'],
      ['SUBSTANZ', s.substance === 'none' ? 'KEINE' : SUBSTANCES[s.substance].name],
    ];
    $('anData').innerHTML = rows.map(([k, val]) => `<dt>${k}</dt><dd>${val}</dd>`).join('');
    $('anPoints').textContent = o.success && !this.training ? `+${fmt(this.scoreShotCached(s))}` : this.training ? 'TRAINING' : '±0';
    $('analysis').classList.add('on');
  }

  private scoreCache = new WeakMap<ActiveShot, number>();
  private scoreShotCached(s: ActiveShot) { return this.scoreCache.get(s) ?? 0; }

  private updatePlay(dt: number) {
    // gravity schedule visuals & cues
    const st = this.exp ? this.stage : null;
    if (st?.gravity) {
      const ph = gravityPhase(this.clock);
      if (ph.kind !== this.lastPhaseKind) {
        if (this.lastPhaseKind) {
          sound.whoosh(ph.g < 1);
          if (ph.kind === 'heavy' || ph.kind === 'reverse') sound.zap(0.6, 0.18, 0.05);
          if (Math.random() < 0.25 && this.ready) this.say('gravity');
        }
        this.lastPhaseKind = ph.kind;
      }
      this.setGravityVisual(ph.g, true);
      this.updateGravityBar();
    } else this.lastPhaseKind = '';

    // idle nudge
    if (this.ready && this.time - this.lastInputAt > 20 && this.time - this.lastIdleLine > 30) {
      this.lastIdleLine = this.time;
      this.say('idle');
    }
    void dt;
  }

  private setGravityVisual(g: number, on: boolean) {
    this.fx.gravity = on ? g : 1;
    const grid = this.lab.gravityGrid;
    grid.visible = on;
    const mat = grid.material as THREE.ShaderMaterial;
    mat.uniforms.uG.value += (g - mat.uniforms.uG.value) * 0.1;
    mat.uniforms.uAmount.value = on ? 1 : 0;
    const col = g > 1.5 ? PALETTE.orange : g < 0 ? 0xff5ad1 : g < 0.6 ? 0x9ff1ff : PALETTE.cyan;
    mat.uniforms.uColor.value.lerp(new THREE.Color(col), 0.1);
    $('roG').textContent = `${fmt1(9.81 * (on ? g : 1))} m/s²`;
  }

  private buildGravityTrack() {
    const track = $('gbTrack');
    track.innerHTML = '';
    const colors: Record<string, string> = { normal: 'rgba(63,224,255,0.45)', low: 'rgba(159,241,255,0.9)', heavy: '#ff7a1a', reverse: '#ff5ad1' };
    for (let k = 0; k < 3; k++) {
      let prev = 0;
      for (const p of GRAVITY_PHASES) {
        const el = document.createElement('i');
        el.style.width = `${((p.until - prev) / GRAVITY_CYCLE) * (100 / 3)}%`;
        el.style.background = colors[p.kind];
        track.appendChild(el);
        prev = p.until;
      }
    }
    track.style.width = '300%';
  }

  private updateGravityBar() {
    const c = ((this.clock % GRAVITY_CYCLE) + GRAVITY_CYCLE) % GRAVITY_CYCLE;
    const bar = $('gravityBar');
    const w = bar.clientWidth;
    // head sits at 25% of the bar; the track (3 cycles = 300%) scrolls under it
    const px = w * 0.25 - (w + (c / GRAVITY_CYCLE) * w);
    $('gbTrack').style.transform = `translateX(${px}px)`;
    const ph = gravityPhase(this.clock);
    const lbl = $('gbLabel');
    lbl.textContent = `GRAVITATION ${ph.label}`;
    lbl.style.left = '25%';
    lbl.style.color = ph.kind === 'heavy' ? '#ff7a1a' : ph.kind === 'reverse' ? '#ff5ad1' : '#e9eef2';
    (bar.querySelector('.gb-head') as HTMLElement).style.left = '25%';
  }

  // ======================================================================== finale
  private finaleSuccess(s: ActiveShot, points: number) {
    this.stats.roundsWon = 1;
    flash();
    sound.finale();
    this.bot.react();
    // big light wave across the table
    this.fx.waves.spawn({ x: s.outcome.hitPoint.x, y: TOP, z: s.outcome.hitPoint.z }, PALETTE.orange, 2.6, 1.8, 0.03);
    this.fx.waves.spawn({ x: s.outcome.hitPoint.x, y: TOP, z: s.outcome.hitPoint.z }, PALETTE.cyan, 1.8, 1.4, 0.05);
    this.fx.particles.burst(s.outcome.hitPoint, { count: 160, color: PALETTE.orange, speed: 3.2, life: 1.4, size: 0.02, gravity: 1.2, up: 1, drag: 1.5 });
    this.scoreCache.set(s, points);
    const hp = s.outcome.hitPoint;
    const start = this.time;
    // pull back in a slow cinematic arc
    this.cam.script = () => {
      const k = easeOut((this.time - start) / 3.2);
      const a = -0.6 + k * 1.1;
      const pos = v(hp.x + Math.sin(a) * (0.6 + k * 3.0), TOP + 0.15 + k * 1.6, hp.z + Math.cos(a) * (0.6 + k * 3.0));
      return { pos, look: v(hp.x * (1 - k), TOP + 0.05 * (1 - k), hp.z * (1 - k * 0.6)) };
    };
    this.advance(3.0, () => {
      this.dimTarget = 0.45;
      letterbox(false);
      this.mode = 'finaleWin';
      $('fwScore').textContent = fmt(this.stats.score);
      const prior = Object.entries(this.campaignScores).reduce((a, [id, sc]) => a + (id === 'finale' ? 0 : sc ?? 0), 0);
      $('fwTotal').textContent = this.campaign ? `KAMPAGNE GESAMT: ${fmt(prior + this.stats.score)}` : `IM ${this.finaleFails + 1}. VERSUCH`;
      $('fwQuote').textContent = pickLine('finaleWin').text;
      $('fwStamp').textContent = this.coachPlays ? 'ALS TRAINER-REFERENZ GESPEICHERT' : 'ZUR VORLAGE BEI TRAINER ROLF';
      only(['finaleWin'], ALL_SCREENS);
      this.speech.hide();
      this.bot.react();
      this.fx.traj.showPast(s.sim.samples, s.outcome.hitTime, PALETTE.orange, s.outcome.hitPoint);
    });
  }

  private finaleFail() {
    this.finaleFails++;
    if (this.finaleFails === 3) this.say(null, 3, this.stage.hint!, 'thinking');
    else if (this.finaleFails === 5) {
      this.assist = true;
      this.say(null, 3, 'Ich aktiviere mein Prognose-Modul. Die Vorschau zeigt dir jetzt mehr von der Flugbahn. Erzähl es niemandem.', 'smug');
    } else this.say('finaleFail', 2);
  }

  // ======================================================================== results
  private rankFor(): { letter: string; name: string } {
    const st = this.stats;
    const exp = this.exp!;
    if (exp.id === 'finale') {
      const n = this.finaleFails + 1;
      return n <= 2 ? { letter: 'S', name: 'ROLF-NIVEAU' } : n <= 5 ? { letter: 'A', name: 'LABORLEITUNG' } : n <= 10 ? { letter: 'B', name: 'OBERASSISTENZ' } : { letter: 'C', name: 'BEHARRLICHKEITSFORSCHUNG' };
    }
    const rate = st.roundsWon / exp.rounds.length;
    const acc = st.hits ? st.accSum / st.hits : 0;
    if (rate >= 1 && acc > 0.55) return { letter: 'S', name: 'ROLF-NIVEAU' };
    if (rate >= 0.8) return { letter: 'A', name: 'NOBELPREISVERDÄCHTIG' };
    if (rate >= 0.6) return { letter: 'B', name: 'OBERASSISTENZ' };
    if (rate >= 0.4) return { letter: 'C', name: 'DOKTORAND' };
    return { letter: 'D', name: 'PRAKTIKUM' };
  }

  private finishExperiment() {
    this.showSummary();
  }

  private recorded: { passed: boolean; rank: { letter: string; name: string }; record: boolean } | null = null;

  /** Saves the run's result once (highscores, completion, campaign total). */
  private recordRun() {
    if (this.recorded) return this.recorded;
    const exp = this.exp!;
    const st = this.stats;
    const passed = st.roundsWon >= exp.passAt;
    const rank = this.rankFor();
    if (passed) store.markCompleted(exp.id);
    const place = store.addScore(exp.id, st.score, rank.letter);
    let campaignPlace = -1;
    if (this.campaign) {
      // a retried experiment replaces its earlier result instead of adding to it
      this.campaignScores[exp.id] = st.score;
      this.campaignTotal = Object.values(this.campaignScores).reduce((a, b) => a + (b ?? 0), 0);
      if (exp.id === 'finale') campaignPlace = store.addScore('campaign', this.campaignTotal, rank.letter);
    }
    this.recorded = { passed, rank, record: (place === 0 && st.score > 0) || campaignPlace === 0 };
    return this.recorded;
  }

  private showSummary() {
    const exp = this.exp!;
    const st = this.stats;
    const { passed, rank, record } = this.recordRun();
    this.mode = 'summary';
    this.swipe.enabled = false;
    this.dimTarget = 0.15;
    sound.fanfare(passed);
    $('sumCode').textContent = `EXPERIMENT ${exp.code} · ${passed ? 'BESTANDEN' : 'NICHT BESTANDEN'}`;
    $('sumTitle').textContent = exp.name;
    $('sumScore').textContent = fmt(st.score);
    $('sumRecord').classList.toggle('on', record);
    $('sumRank').textContent = rank.letter;
    $('sumRank').classList.toggle('s', rank.letter === 'S');
    $('sumRankName').textContent = rank.name;
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const rows: [string, string][] = [
      ['GENAUIGKEIT', `${acc} % (${st.hits}/${st.shots})`],
      ['ZIELE GESCHAFFT', `${st.roundsWon}/${exp.rounds.length}`],
      ['PERFEKTE TREFFER', String(st.perfects)],
      ['BESTE KOMBO', String(st.bestCombo)],
      ['BESTER SCHLAG', st.best.points ? `${fmt(st.best.points)} P` : '—'],
      [this.campaign ? 'KAMPAGNE' : 'BESTWERT', this.campaign ? fmt(this.campaignTotal) : fmt(Math.max(store.best(exp.id), st.score))],
    ];
    $('sumData').innerHTML = rows.map(([k, val]) => `<div><dt>${k}</dt><dd>${val}</dd></div>`).join('')
      + (st.best.points ? `<div style="grid-column:1/-1"><dt>DETAIL</dt><dd>${st.best.text}</dd></div>` : '');
    const quoteKey: LineKey = exp.id === 'finale' ? 'finaleWin' : record ? 'record' : passed ? 'pass' : 'fail';
    const q = pickLine(quoteKey);
    $('sumQuote').textContent = q.text;
    const nextIdx = EXPERIMENTS.findIndex((e) => e.id === exp.id) + 1;
    const hasNext = this.campaign && nextIdx < EXPERIMENTS.length;
    $('sumNext').querySelector('span')!.textContent = hasNext ? `WEITER: ${EXPERIMENTS[nextIdx].code} ${EXPERIMENTS[nextIdx].name}` : this.campaign ? 'KAMPAGNE BEENDET' : 'CHALLENGES';
    only(['summary'], ALL_SCREENS);
    this.fx.traj.hidePreview();
    $('substances').classList.remove('on');
    this.speech.hide();
    this.cam.script = null;
    this.cam.go({ pos: v(2.4, 2.2, 2.6), look: v(-0.4, 0.7, -0.2) }, 1.2);
    letterbox(false);
  }

  private summaryNext() {
    const exp = this.exp!;
    const nextIdx = EXPERIMENTS.findIndex((e) => e.id === exp.id) + 1;
    if (this.campaign && nextIdx < EXPERIMENTS.length) this.startExperiment(EXPERIMENTS[nextIdx].id, true);
    else if (this.campaign) { this.enterMenu(); this.openSheet('scores'); this.scoreTab = 'campaign'; this.renderScores(); }
    else { this.enterMenu(); this.openSheet('challenges'); }
  }

  // ======================================================================== test hooks (used by ?test only)
  /** Searches the input space for a shot that solves the current stage if launched right now. */
  debugSolve(wantSuccess = true): ShotInput | null {
    if (!this.exp) return null;
    const st = this.stage;
    const sub = this.substance;
    const env = buildEnv(st, sub);
    for (let p = 0; p <= 1; p += 0.05) for (let yaw = -0.6; yaw <= 0.6; yaw += 0.04)
      for (const sx of [0, 1, -1, 0.5, -0.5, 0.8, -0.8]) for (const sy of [0, 0.5, 1, -0.5, -1]) {
        if (sx * sx + sy * sy > 1.01) continue;
        const input = { yaw, power: p, spinX: sx, spinY: sy };
        const l = launchVectors(input, sub);
        const lc = this.clock + this.fx.paddle.leadTime;
        const o = evaluateShot(simulate(l.pos, l.v, l.w, env, lc), st, lc);
        if (o.success === wantSuccess) return input;
      }
    return null;
  }

  debugFire(input: ShotInput) {
    this.pad.set(input.spinX, input.spinY);
    this.fire({ yaw: input.yaw, power: input.power, valid: true });
  }

  // ======================================================================== misc
  private pause(on: boolean) {
    if (this.mode !== 'play' && on) return;
    this.paused = on;
    show('pause', on);
    this.swipe.reset();
    if (on) { this.say('pause', 2); sound.ui('back'); }
  }

  private say(key: LineKey | null, priority = 1, text?: string, mood?: Parameters<Speech['say']>[1]) {
    if (key) { const l = pickLine(key); this.speech.say(l.text, l.mood, priority); }
    else if (text) this.speech.say(text, mood ?? 'talk', priority);
    this.bot.react();
  }

  private updateMonitors(s: ActiveShot) {
    const [c0, c1, c2] = this.lab.screenCanvases;
    const draw = (c: HTMLCanvasElement, fn: (g: CanvasRenderingContext2D, w: number, h: number) => void) => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#04090d'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = 'rgba(63,224,255,0.12)';
      for (let x = 0; x < c.width; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, c.height); g.stroke(); }
      for (let y = 0; y < c.height; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(c.width, y); g.stroke(); }
      fn(g, c.width, c.height);
    };
    // side view of the trajectory
    draw(c0, (g, w, h) => {
      g.fillStyle = '#3fe0ff'; g.font = '600 18px monospace'; g.fillText('FLUGBAHN · SEITENANSICHT', 16, 26);
      g.strokeStyle = '#3fe0ff'; g.lineWidth = 3; g.beginPath();
      s.sim.samples.forEach((p, i) => {
        const x = ((LAUNCH.z + 0.3 - p.p.z) / 4.2) * w, y = h - 20 - (p.p.y / 1.8) * (h - 50);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      });
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(((LAUNCH.z + 0.3 - 1.37) / 4.2) * w, h - 20 - (TOP / 1.8) * (h - 50), (2.74 / 4.2) * w, 3);
    });
    // top view
    draw(c1, (g, w, h) => {
      g.fillStyle = '#3fe0ff'; g.font = '600 18px monospace'; g.fillText('DRAUFSICHT · MAGNUS-DRIFT', 16, 26);
      const sx = (x: number) => w / 2 + x * (w / 3.2), sz = (z: number) => 40 + ((LAUNCH.z + 0.2 - z) / 3.6) * (h - 50);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      g.strokeRect(sx(-0.7625), sz(1.37), sx(0.7625) - sx(-0.7625), sz(-1.37) - sz(1.37));
      g.strokeStyle = '#ff7a1a'; g.lineWidth = 3; g.beginPath();
      s.sim.samples.forEach((p, i) => (i ? g.lineTo(sx(p.p.x), sz(p.p.z)) : g.moveTo(sx(p.p.x), sz(p.p.z))));
      g.stroke();
    });
    draw(c2, (g, _w, h) => {
      g.fillStyle = '#3fe0ff'; g.font = '600 18px monospace'; g.fillText('LETZTE MESSUNG', 16, 26);
      g.fillStyle = '#e9eef2'; g.font = '800 64px sans-serif';
      g.fillText(`${fmt(this.lastShotInfo.rpm)}`, 16, h * 0.62);
      g.font = '600 20px monospace'; g.fillStyle = 'rgba(233,238,242,0.6)';
      g.fillText(`U/MIN · ${fmt1(this.lastShotInfo.speed)} M/S`, 16, h * 0.62 + 32);
    });
    this.lab.screens.forEach((t) => (t.needsUpdate = true));
    $('roW').textContent = `${fmt(this.lastShotInfo.rpm)} rpm`;
  }

  private updateScreens(dt: number) {
    this.screenTimer += dt;
    if (this.screenTimer < 1.5 || this.lastShotInfo.speed) return;
    this.screenTimer = 0;
    // idle content before the first shot: animated calibration curves
    const cs = this.lab.screenCanvases;
    cs.forEach((c, k) => {
      const g = c.getContext('2d')!;
      g.fillStyle = '#04090d'; g.fillRect(0, 0, c.width, c.height);
      g.strokeStyle = k === 1 ? '#ff7a1a' : '#3fe0ff'; g.lineWidth = 2; g.beginPath();
      for (let x = 0; x < c.width; x += 4) {
        const y = c.height / 2 + Math.sin(x * 0.03 + this.time * (k + 1)) * c.height * 0.25 * Math.sin(this.time + k);
        x ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
      g.fillStyle = 'rgba(63,224,255,0.8)'; g.font = '600 18px monospace';
      g.fillText(['KALIBRIERUNG · MAGNUS', 'RESTITUTION · TEST', 'BEREIT'][k], 16, 26);
    });
    this.lab.screens.forEach((t) => (t.needsUpdate = true));
  }

  private updateRotateHint() {
    const touch = matchMedia('(pointer: coarse)').matches;
    // phones get a dedicated portrait layout; only tablets are nudged towards landscape
    const tablet = Math.min(innerWidth, innerHeight) >= 600;
    $('rotateHint').classList.toggle('on', touch && tablet && innerWidth < innerHeight && this.mode === 'play' && !this.rotateDismissed);
  }

  private onResize() {
    this.r.resize();
    this.fx.setViewport(this.r.viewportHeight);
    this.cam.setPortrait(innerWidth < innerHeight, Math.min(innerWidth, innerHeight) < 600);
    if (this.mode === 'play' && !this.cam.script) this.cam.go(this.cam.playShot(), 3);
    this.updateRotateHint();
    this.pad.set(this.pad.x, this.pad.y);
  }
}
