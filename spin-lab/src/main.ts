import './ui/styles.css';
import { Game } from './game/Game';

function fail(msg: string) {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;display:grid;place-items:center;padding:24px;text-align:center;font:14px/1.6 monospace;color:#e9eef2;background:#05070b;z-index:99';
  el.textContent = msg;
  document.body.appendChild(el);
}

function supportsWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!supportsWebGL()) {
  fail('SPIN LAB benötigt WebGL. Bitte einen aktuellen Browser verwenden (Safari, Chrome, Edge oder Firefox).');
} else {
  try {
    const game = new Game();
    game.boot();
    if (new URLSearchParams(location.search).has('test')) {
      // deterministic stepping for automated visual tests
      (window as unknown as Record<string, unknown>).__spin = {
        game,
        step(sec: number, fps = 30) {
          const n = Math.max(1, Math.round(sec * fps));
          for (let i = 0; i < n; i++) game.frame(1 / fps, i === n - 1);
        },
      };
      // keep the document timeline ticking so CSS animations progress between manual steps
      const idle = () => requestAnimationFrame(idle);
      requestAnimationFrame(idle);
    } else {
      let last = performance.now();
      const loop = (now: number) => {
        const dt = (now - last) / 1000;
        last = now;
        game.frame(dt);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    // prevent iOS double-tap zoom and pinch on the game surface
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  } catch (err) {
    console.error(err);
    fail('Das Labor konnte nicht gestartet werden: ' + (err instanceof Error ? err.message : String(err)));
  }
}
