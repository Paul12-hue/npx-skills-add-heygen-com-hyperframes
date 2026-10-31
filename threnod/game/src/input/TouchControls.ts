import type { Input } from './Input';

/**
 * On-screen touch controls for the iPad:
 *  - left half: a floating virtual stick (appears where the thumb lands)
 *  - right half: drag to turn the camera
 *  - action / pause buttons are regular DOM buttons handled by the UI
 */
export class TouchControls {
  private stickId: number | null = null;
  private lookId: number | null = null;
  private origin: [number, number] = [0, 0];
  private lastLook: [number, number] = [0, 0];
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private readonly maxR = 52;
  enabled = true;

  constructor(surface: HTMLElement, private input: Input) {
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    const opts = { passive: false } as AddEventListenerOptions;
    surface.addEventListener('touchstart', (e) => this.start(e), opts);
    surface.addEventListener('touchmove', (e) => this.move(e), opts);
    surface.addEventListener('touchend', (e) => this.end(e), opts);
    surface.addEventListener('touchcancel', (e) => this.end(e), opts);
  }

  private start(e: TouchEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.clientX < window.innerWidth * 0.45 && this.stickId === null) {
        this.stickId = t.identifier;
        this.origin = [t.clientX, t.clientY];
        this.base.style.left = `${t.clientX}px`;
        this.base.style.top = `${t.clientY}px`;
        this.base.classList.add('visible');
        this.knob.style.transform = 'translate(-50%, -50%)';
      } else if (this.lookId === null) {
        this.lookId = t.identifier;
        this.lastLook = [t.clientX, t.clientY];
      }
    }
  }

  private move(e: TouchEvent): void {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        let dx = t.clientX - this.origin[0];
        let dy = t.clientY - this.origin[1];
        const len = Math.hypot(dx, dy);
        if (len > this.maxR) {
          dx *= this.maxR / len;
          dy *= this.maxR / len;
        }
        this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        this.input.setTouchMove(dx / this.maxR, -dy / this.maxR);
      } else if (t.identifier === this.lookId) {
        this.input.addTouchLook(t.clientX - this.lastLook[0], t.clientY - this.lastLook[1]);
        this.lastLook = [t.clientX, t.clientY];
      }
    }
  }

  private end(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickId) {
        this.stickId = null;
        this.input.setTouchMove(0, 0);
        this.base.classList.remove('visible');
      } else if (t.identifier === this.lookId) {
        this.lookId = null;
      }
    }
  }

  reset(): void {
    this.stickId = null;
    this.lookId = null;
    this.input.setTouchMove(0, 0);
    this.base.classList.remove('visible');
  }
}
