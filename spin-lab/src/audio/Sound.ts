// All sound is synthesised live with the Web Audio API — no audio files.

type Ctx = AudioContext;

export class Sound {
  private ctx: Ctx | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private humNodes: AudioNode[] = [];
  private _muted = false;
  private _ambVol = 0.6;

  get ready() { return !!this.ctx; }
  get muted() { return this._muted; }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this._muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.amb = ctx.createGain(); this.amb.gain.value = 0; this.amb.connect(this.master);
    // procedural impulse response: a medium, slightly metallic lab hall
    const len = Math.floor(ctx.sampleRate * 1.8);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / ctx.sampleRate;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (1 + 0.3 * Math.sin(t * 2300));
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.22;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  setMuted(m: boolean) {
    this._muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  setAmbience(v: number) {
    this._ambVol = v;
    if (this.ctx) this.amb.gain.setTargetAtTime(v * 0.5, this.ctx.currentTime, 0.4);
  }

  suspend() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }

  private out(node: AudioNode, wet = 0.2) {
    node.connect(this.sfx);
    if (wet > 0) {
      const g = this.ctx!.createGain();
      g.gain.value = wet;
      node.connect(g).connect(this.reverbSend);
    }
  }

  private noise(_dur = 1) {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random() * 0.5;
    return src;
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private startAmbience() {
    const c = this.ctx!;
    const t = c.currentTime;
    // mains hum: fundamental + harmonics through a lowpass
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 0.7;
    lp.connect(this.amb);
    for (const [f, v] of [[50, 0.16], [100, 0.09], [150, 0.035], [200.4, 0.02]] as const) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); g.gain.value = v;
      o.connect(g).connect(lp); o.start(t);
      this.humNodes.push(o);
    }
    // ventilation air: filtered noise with slow movement
    const n = this.noise(1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const ng = c.createGain(); ng.gain.value = 0.05;
    n.connect(bp).connect(ng).connect(this.amb);
    n.start(t);
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
    const lg = c.createGain(); lg.gain.value = 140;
    lfo.connect(lg).connect(bp.frequency); lfo.start(t);
    this.humNodes.push(n, lfo);
    // occasional distant machine chirps
    const chirp = () => {
      if (!this.ctx) return;
      const tt = this.ctx.currentTime;
      const o = this.ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1800 + Math.random() * 900, tt);
      o.frequency.exponentialRampToValueAtTime(900, tt + 0.12);
      const g = this.ctx.createGain(); this.env(g, tt, 0.005, 0.012, 0.15);
      o.connect(g).connect(this.amb);
      const w = this.ctx.createGain(); w.gain.value = 1.5; g.connect(w).connect(this.reverbSend);
      o.start(tt); o.stop(tt + 0.2);
      setTimeout(chirp, 6000 + Math.random() * 9000);
    };
    setTimeout(chirp, 5000);
    this.amb.gain.setTargetAtTime(this._ambVol * 0.5, t, 1.5);
  }

  // ------------------------------------------------------------------ effects

  /** Intro: rising electrical hum. */
  powerUp() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(38, t); o.frequency.exponentialRampToValueAtTime(110, t + 3.5);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(120, t); lp.frequency.exponentialRampToValueAtTime(900, t + 3.8);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 5);
    o.connect(lp).connect(g); this.out(g, 0.3);
    o.start(t); o.stop(t + 5.1);
  }

  /** Short glassy "light line" sweep. */
  sweep(up = true, vol = 0.07) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 8;
    bp.frequency.setValueAtTime(up ? 600 : 5000, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 6000 : 500, t + 0.7);
    const g = c.createGain(); this.env(g, t, 0.15, vol, 0.6);
    n.connect(bp).connect(g); this.out(g, 0.5);
    n.start(t); n.stop(t + 0.9);
  }

  /** Lights switching on: relay clack + low thump. */
  clunk(vol = 0.25) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = c.createGain(); this.env(g, t, 0.003, vol, 0.3);
    o.connect(g); this.out(g, 0.35);
    o.start(t); o.stop(t + 0.4);
    const n = this.noise(1);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const ng = c.createGain(); this.env(ng, t, 0.001, vol * 0.4, 0.03);
    n.connect(hp).connect(ng); this.out(ng, 0.3);
    n.start(t); n.stop(t + 0.06);
  }

  /** Paddle strike — sharper and brighter with power. */
  hit(power: number) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400 + power * 1800; bp.Q.value = 1.4;
    const g = c.createGain(); this.env(g, t, 0.001, 0.35 + power * 0.25, 0.045);
    n.connect(bp).connect(g); this.out(g, 0.12);
    n.start(t); n.stop(t + 0.08);
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(1100 + power * 500, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
    const og = c.createGain(); this.env(og, t, 0.001, 0.22, 0.06);
    o.connect(og); this.out(og, 0.12);
    o.start(t); o.stop(t + 0.1);
  }

  /** Ball on table: hollow "tock". */
  bounce(speed: number, surface: 'table' | 'floor' = 'table') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const v = Math.min(1, speed / 9);
    const base = surface === 'table' ? 1350 : 900;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * 0.62, t + 0.05);
    const g = c.createGain(); this.env(g, t, 0.001, 0.12 + v * 0.3, surface === 'table' ? 0.07 : 0.05);
    o.connect(g); this.out(g, 0.25);
    o.start(t); o.stop(t + 0.12);
    const n = this.noise(1);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = surface === 'table' ? 3800 : 2000; bp.Q.value = 2;
    const ng = c.createGain(); this.env(ng, t, 0.0005, 0.08 + v * 0.15, 0.02);
    n.connect(bp).connect(ng); this.out(ng, 0.2);
    n.start(t); n.stop(t + 0.04);
  }

  net() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(1);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const g = c.createGain(); this.env(g, t, 0.002, 0.35, 0.14);
    n.connect(lp).connect(g); this.out(g, 0.15);
    n.start(t); n.stop(t + 0.2);
  }

  thud(glass: boolean) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    if (glass) {
      for (const f of [2093, 3136, 4186]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * (0.99 + Math.random() * 0.02);
        const g = c.createGain(); this.env(g, t, 0.001, 0.05, 0.6);
        o.connect(g); this.out(g, 0.6);
        o.start(t); o.stop(t + 0.7);
      }
    }
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.15);
    const g = c.createGain(); this.env(g, t, 0.001, 0.3, 0.2);
    o.connect(g); this.out(g, 0.3);
    o.start(t); o.stop(t + 0.3);
  }

  /** Electric crackle, used for substances, gravity shifts and tunnelling. */
  zap(pitch = 1, dur = 0.25, vol = 0.12) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(180 * pitch, t);
    for (let i = 1; i < 8; i++) o.frequency.setValueAtTime((120 + Math.random() * 500) * pitch, t + (i * dur) / 8);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 * pitch; bp.Q.value = 3;
    const g = c.createGain(); this.env(g, t, 0.005, vol, dur);
    o.connect(bp).connect(g); this.out(g, 0.35);
    o.start(t); o.stop(t + dur + 0.05);
    const n = this.noise(1);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5000;
    const ng = c.createGain(); this.env(ng, t, 0.002, vol * 0.6, dur * 0.7);
    n.connect(hp).connect(ng); this.out(ng, 0.2);
    n.start(t); n.stop(t + dur);
  }

  /** Gravity shift: filtered whoosh up or down. */
  whoosh(up: boolean) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = this.noise(1);
    const bp = c.createBiquadFilter(); bp.type = 'lowpass'; bp.Q.value = 6;
    bp.frequency.setValueAtTime(up ? 300 : 3000, t);
    bp.frequency.exponentialRampToValueAtTime(up ? 3000 : 200, t + 0.45);
    const g = c.createGain(); this.env(g, t, 0.08, 0.16, 0.45);
    n.connect(bp).connect(g); this.out(g, 0.4);
    n.start(t); n.stop(t + 0.6);
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(up ? 70 : 160, t); o.frequency.exponentialRampToValueAtTime(up ? 160 : 45, t + 0.5);
    const og = c.createGain(); this.env(og, t, 0.05, 0.2, 0.5);
    o.connect(og); this.out(og, 0.2);
    o.start(t); o.stop(t + 0.6);
  }

  /** Target hit. Perfect hits add a bell chord. */
  success(perfect: boolean) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const notes = perfect ? [880, 1108.7, 1318.5, 1760] : [659.3, 987.8];
    notes.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const m = c.createOscillator(); m.frequency.value = f * 2.01;
      const mg = c.createGain(); mg.gain.value = f * 0.4;
      m.connect(mg).connect(o.frequency);
      const g = c.createGain(); this.env(g, t + i * 0.05, 0.004, 0.09, perfect ? 1.4 : 0.5);
      o.connect(g); this.out(g, 0.5);
      o.start(t + i * 0.05); m.start(t + i * 0.05);
      o.stop(t + i * 0.05 + 1.6); m.stop(t + i * 0.05 + 1.6);
    });
    if (perfect) this.sweep(true, 0.05);
  }

  miss() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(220, t); o.frequency.setValueAtTime(165, t + 0.12);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.setValueAtTime(0.06, t + 0.22); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(lp).connect(g); this.out(g, 0.2);
    o.start(t); o.stop(t + 0.32);
  }

  ui(kind: 'tap' | 'hover' | 'select' | 'back' = 'tap') {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const f = kind === 'hover' ? 2400 : kind === 'select' ? 1600 : kind === 'back' ? 700 : 1200;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'back' ? f * 0.7 : f * 1.25, t + 0.05);
    const g = c.createGain(); this.env(g, t, 0.002, kind === 'hover' ? 0.02 : 0.06, 0.07);
    o.connect(g); this.out(g, 0.1);
    o.start(t); o.stop(t + 0.1);
  }

  /** Level complete: rising arpeggio. */
  fanfare(good: boolean) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const seq = good ? [523.3, 659.3, 784, 1046.5, 1318.5] : [440, 415.3, 392];
    seq.forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); this.env(g, t + i * 0.09, 0.005, 0.08, 0.5);
      o.connect(g); this.out(g, 0.45);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.6);
    });
  }

  /** Finale: sub drop, swelling chord and shimmer. */
  finale() {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const sub = c.createOscillator(); sub.type = 'sine';
    sub.frequency.setValueAtTime(80, t); sub.frequency.exponentialRampToValueAtTime(30, t + 1.6);
    const sg = c.createGain(); this.env(sg, t, 0.005, 0.5, 1.8);
    sub.connect(sg); this.out(sg, 0.2);
    sub.start(t); sub.stop(t + 2);
    const chord = [130.8, 196, 261.6, 329.6, 392, 523.3, 659.3];
    chord.forEach((f, i) => {
      for (const det of [-4, 4]) {
        const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass';
        lp.frequency.setValueAtTime(300, t + 0.3); lp.frequency.exponentialRampToValueAtTime(3500, t + 2.5);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t + 0.2);
        g.gain.exponentialRampToValueAtTime(0.022, t + 1.4 + i * 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 5.5);
        o.connect(lp).connect(g); this.out(g, 0.6);
        o.start(t + 0.2); o.stop(t + 5.6);
      }
    });
    setTimeout(() => this.success(true), 300);
  }

  /** Synthetic voice blip for dialogue lines (used when speech synthesis is off). */
  chatter(len: number) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const n = Math.min(10, Math.max(3, Math.round(len / 9)));
    for (let i = 0; i < n; i++) {
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = 520 + Math.random() * 380;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
      const g = c.createGain(); this.env(g, t + i * 0.055, 0.003, 0.018, 0.04);
      o.connect(lp).connect(g); this.out(g, 0.1);
      o.start(t + i * 0.055); o.stop(t + i * 0.055 + 0.06);
    }
  }
}

export const sound = new Sound();
