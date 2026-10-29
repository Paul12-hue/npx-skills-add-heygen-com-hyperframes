// Small DOM helpers: screens, DR. SPIN's speech panel, toasts, cards.

import { sound } from '../audio/Sound';
import type { FaceRenderer, Mood } from '../render/DrSpinBot';
import { store } from '../game/storage';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const fmt = (n: number) => Math.round(n).toLocaleString('de-DE');
export const fmt1 = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function show(id: string, on = true) { $(id).classList.toggle('active', on); }
export function only(ids: string[], all: string[]) { for (const id of all) show(id, ids.includes(id)); }

export function retrigger(el: HTMLElement, cls: string) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export class Speech {
  private el = $('dialog');
  private text = $('dlgText');
  private ctx = $<HTMLCanvasElement>('faceCanvas').getContext('2d')!;
  private full = '';
  private shown = 0;
  private hideAt = 0;
  private timeLeft = 0;
  private busyUntil = 0;
  private voice: SpeechSynthesisVoice | null = null;

  constructor(private face: FaceRenderer) {
    try {
      const pickVoice = () => {
        const vs = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('de'));
        this.voice = vs.find((v) => /male|daniel|markus|yannick|stefan/i.test(v.name)) ?? vs[0] ?? null;
      };
      pickVoice();
      speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
    } catch { /* no speech synthesis */ }
  }

  /** Low-priority lines are dropped while DR. SPIN is still talking. */
  say(text: string, mood: Mood, priority = 1) {
    const now = performance.now();
    if (priority < 2 && now < this.busyUntil) return;
    this.full = text;
    this.shown = 0;
    this.face.mood = mood === 'talk' ? 'idle' : mood;
    this.face.talking = true;
    this.timeLeft = 0;
    const dur = 1800 + text.length * 55;
    this.hideAt = now + dur;
    this.busyUntil = now + Math.min(dur, 2600);
    this.text.textContent = '';
    this.el.classList.add('on');
    if (store.settings.voice && store.settings.sound && 'speechSynthesis' in window) {
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'de-DE'; u.pitch = 0.75; u.rate = 1.06; u.volume = 0.9;
        if (this.voice) u.voice = this.voice;
        speechSynthesis.speak(u);
      } catch { /* ignore */ }
    } else {
      sound.chatter(text.length);
    }
  }

  setSide(right: boolean) {
    this.el.style.left = right ? 'auto' : '';
    this.el.style.right = right ? 'calc(16px + var(--safe-r))' : '';
    // on phones the menu speech bubble moves to the top, out of the way of the navigation
    this.el.classList.toggle('menu-side', right);
  }

  hide() { this.el.classList.remove('on'); this.face.talking = false; this.hideAt = 0; }

  update(dt: number) {
    if (this.shown < this.full.length) {
      this.timeLeft += dt;
      const n = Math.min(this.full.length, Math.floor(this.timeLeft * 55));
      if (n !== this.shown) { this.shown = n; this.text.textContent = this.full.slice(0, n); }
      if (this.shown >= this.full.length) this.face.talking = false;
    }
    if (this.hideAt && performance.now() > this.hideAt) {
      this.el.classList.remove('on');
      this.hideAt = 0;
      this.face.mood = 'idle';
    }
    this.ctx.clearRect(0, 0, 128, 128);
    this.ctx.drawImage(this.face.canvas, 0, 0, 128, 128);
  }
}

export function toast(main: string, sub = '', kind: '' | 'hot' | 'bad' = '') {
  const t = $('toast');
  $('toastMain').textContent = main;
  $('toastSub').textContent = sub;
  t.classList.remove('hot', 'bad');
  if (kind) t.classList.add(kind);
  retrigger(t, 'on');
}

export function roundCard(code: string, title: string, brief: string) {
  $('rcCode').textContent = code;
  $('rcTitle').textContent = title;
  $('rcBrief').textContent = brief;
  retrigger($('roundCard'), 'on');
}

export function flash() { retrigger($('flash'), 'on'); }

export function letterbox(on: boolean) { $('letterbox').classList.toggle('on', on); }

let confirmCb: (() => void) | null = null;
export function confirmBox(title: string, text: string, yes: string, cb: () => void) {
  $('cfTitle').textContent = title;
  $('cfText').textContent = text;
  $('cfYes').querySelector('span')!.textContent = yes;
  confirmCb = cb;
  show('confirm');
}
export function initConfirm() {
  $('cfYes').addEventListener('click', () => { show('confirm', false); sound.ui('select'); const cb = confirmCb; confirmCb = null; cb?.(); });
  $('cfNo').addEventListener('click', () => { show('confirm', false); sound.ui('back'); confirmCb = null; });
}
