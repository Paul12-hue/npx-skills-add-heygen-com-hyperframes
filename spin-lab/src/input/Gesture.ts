// Swipe-to-hit on the 3D view, plus the spin pad (contact point on the ball).

import { MAX_YAW } from '../physics/shot';

export interface SwipeIntent { yaw: number; power: number; valid: boolean }

/** Minimum upward travel, as a fraction of the short screen side, before a drag counts as a shot. */
const MIN_SWIPE = 0.06;
/** Upward travel that maps to full power. */
const FULL_SWIPE = 0.5;

export class SwipeInput {
  enabled = false;
  private id: number | null = null;
  private sx = 0;
  private sy = 0;
  onMove?: (i: SwipeIntent) => void;
  onEnd?: (i: SwipeIntent | null) => void;
  onStart?: () => void;

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: true });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
  }

  private intent(x: number, y: number): SwipeIntent {
    const norm = Math.min(window.innerWidth, window.innerHeight);
    const dx = (x - this.sx) / norm;
    const dy = (this.sy - y) / norm;
    const power = Math.max(0, Math.min(1, (dy - MIN_SWIPE * 0.5) / FULL_SWIPE));
    const yaw = Math.max(-MAX_YAW, Math.min(MAX_YAW, Math.atan2(dx, Math.max(dy, 0.02)) * 0.85));
    return { yaw, power, valid: dy > MIN_SWIPE };
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled || this.id !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.id = e.pointerId;
    this.sx = e.clientX; this.sy = e.clientY;
    this.onStart?.();
  };
  private move = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    this.onMove?.(this.intent(e.clientX, e.clientY));
  };
  private up = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    const i = this.intent(e.clientX, e.clientY);
    this.onEnd?.(this.enabled && i.valid ? i : null);
  };
  private cancel = (e: PointerEvent) => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    this.onEnd?.(null);
  };

  reset() { if (this.id !== null) { this.id = null; this.onEnd?.(null); } }
}

export class SpinPad {
  x = 0;
  y = 0;
  private dragging: number | null = null;
  onChange?: (x: number, y: number) => void;

  constructor(private root: HTMLElement, private dot: HTMLElement) {
    const ball = root.querySelector('.sp-ball') as HTMLElement;
    const set = (e: PointerEvent) => {
      const r = ball.getBoundingClientRect();
      let x = ((e.clientX - r.left) / r.width) * 2 - 1;
      let y = -(((e.clientY - r.top) / r.height) * 2 - 1);
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      // a small dead zone makes "flat" easy to hit with a finger
      if (m < 0.14) { x = 0; y = 0; }
      this.set(x, y);
    };
    root.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.dragging = e.pointerId;
      root.setPointerCapture?.(e.pointerId);
      set(e);
    });
    root.addEventListener('pointermove', (e) => { if (e.pointerId === this.dragging) set(e); });
    const end = (e: PointerEvent) => { if (e.pointerId === this.dragging) this.dragging = null; };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('dblclick', () => this.set(0, 0));
  }

  set(x: number, y: number) {
    this.x = x; this.y = y;
    const r = 66 - 13;
    this.dot.style.transform = `translate(${x * r * (this.root.clientWidth / 168)}px, ${-y * r * (this.root.clientWidth / 168)}px)`;
    this.onChange?.(x, y);
  }
}

/** Human-readable spin label for the pad. */
export function spinLabel(x: number, y: number) {
  const parts: string[] = [];
  if (y > 0.15) parts.push(`TOPSPIN ${Math.round(y * 100)}%`);
  else if (y < -0.15) parts.push(`UNTERSCHNITT ${Math.round(-y * 100)}%`);
  if (x > 0.15) parts.push(`KURVE ▸ ${Math.round(x * 100)}%`);
  else if (x < -0.15) parts.push(`◂ KURVE ${Math.round(-x * 100)}%`);
  return parts.length ? parts.join(' · ') : 'FLACH · OHNE SPIN';
}
