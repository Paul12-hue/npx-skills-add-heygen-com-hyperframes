/**
 * Unified input: keyboard + mouse, touch (virtual stick and look area) and
 * gamepads all write into one InputState that the game reads every frame.
 */

export interface InputState {
  moveX: number; // -1..1 (right)
  moveY: number; // -1..1 (forward)
  lookX: number; // radians this frame
  lookY: number;
  run: boolean;
}

type Action = 'interact' | 'pause' | 'up' | 'down' | 'confirm' | 'n1' | 'n2' | 'n3' | 'n4' | 'time';

export class Input {
  readonly state: InputState = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, run: false };
  sensitivity = 1;
  invertY = false;
  private keys = new Set<string>();
  private pressed = new Set<Action>();
  private mouseDown = false;
  private lastMouse: [number, number] | null = null;
  private touchMove: [number, number] = [0, 0];
  private padButtonsPrev: boolean[] = [];
  /** True when the last input came from a touch screen (the UI shows touch buttons). */
  touchMode = false;

  constructor(lookTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());
    lookTarget.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) {
        this.mouseDown = true;
        this.lastMouse = [e.clientX, e.clientY];
        this.touchMode = false;
      }
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.lastMouse = null;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDown || !this.lastMouse) return;
      this.addLook(e.clientX - this.lastMouse[0], e.clientY - this.lastMouse[1], 0.005);
      this.lastMouse = [e.clientX, e.clientY];
    });
    lookTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    const k = e.key.toLowerCase();
    if (down) {
      this.touchMode = false;
      if (!this.keys.has(k)) {
        const map: Record<string, Action> = {
          e: 'interact', enter: 'confirm', ' ': 'confirm', escape: 'pause', p: 'pause',
          arrowup: 'up', arrowdown: 'down', '1': 'n1', '2': 'n2', '3': 'n3', '4': 'n4', t: 'time',
        };
        const a = map[k];
        if (a) this.pressed.add(a);
        if (k === 'e' || k === 'enter' || k === ' ') this.pressed.add('interact');
      }
      this.keys.add(k);
      if (['arrowup', 'arrowdown', ' '].includes(k)) e.preventDefault();
    } else {
      this.keys.delete(k);
    }
  }

  private addLook(dx: number, dy: number, scale: number): void {
    this.state.lookX += dx * scale * this.sensitivity;
    this.state.lookY += dy * scale * this.sensitivity * (this.invertY ? -1 : 1);
  }

  // called by TouchControls
  setTouchMove(x: number, y: number): void {
    this.touchMove = [x, y];
    this.touchMode = true;
  }
  addTouchLook(dx: number, dy: number): void {
    this.touchMode = true;
    this.addLook(dx, dy, 0.007);
  }
  press(a: Action): void {
    this.pressed.add(a);
  }

  /** Was the action pressed since the last frame? Consumes it. */
  consume(a: Action): boolean {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  /** Call once per frame before reading state. */
  poll(dt: number): void {
    const k = this.keys;
    let mx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    let my = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    let run = k.has('shift');
    if (this.touchMove[0] !== 0 || this.touchMove[1] !== 0) {
      mx = this.touchMove[0];
      my = this.touchMove[1];
    }
    // gamepad
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
      const ax = dz(pad.axes[0] ?? 0);
      const ay = dz(pad.axes[1] ?? 0);
      if (ax || ay) {
        mx = ax;
        my = -ay;
        this.touchMode = false;
      }
      const lx = dz(pad.axes[2] ?? 0);
      const ly = dz(pad.axes[3] ?? 0);
      this.addLook(lx * 2.6 * dt * 200, ly * 1.8 * dt * 200, 0.01);
      const btn = (i: number) => !!pad.buttons[i]?.pressed;
      const edge = (i: number, a: Action) => {
        if (btn(i) && !this.padButtonsPrev[i]) this.pressed.add(a);
      };
      edge(0, 'interact');
      edge(0, 'confirm');
      edge(9, 'pause');
      edge(12, 'up');
      edge(13, 'down');
      if (btn(10) || btn(4)) run = true;
      this.padButtonsPrev = pad.buttons.map((b) => b.pressed);
      break;
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    this.state.moveX = mx;
    this.state.moveY = my;
    this.state.run = run;
  }

  /** Call at the end of the frame. */
  endFrame(): void {
    this.state.lookX = 0;
    this.state.lookY = 0;
  }

  clearPressed(): void {
    this.pressed.clear();
  }
}
