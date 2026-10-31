import './ui/style.css';
import { Game } from './core/Game';

function fail(message: string): void {
  const box = document.getElementById('fatal');
  if (box) {
    box.textContent = message;
    box.style.display = 'flex';
  }
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

window.addEventListener('error', (e) => console.error('[threnod]', e.message));

if (!hasWebGL()) {
  fail('THRENOD needs WebGL, which this browser does not provide.');
} else {
  try {
    const canvas = document.getElementById('view') as HTMLCanvasElement;
    const ui = document.getElementById('ui') as HTMLElement;
    new Game(canvas, ui).start();
  } catch (err) {
    console.error(err);
    fail('Something went wrong while starting THRENOD: ' + (err instanceof Error ? err.message : String(err)));
  }
}
