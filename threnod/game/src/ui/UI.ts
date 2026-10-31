import type { Choice, DialogueNode } from '../dialogue/Dialogue';
import type { Settings } from '../save/Save';

/** Escape HTML, then allow *emphasis*. */
function format(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*(.+?)\*/g, '<em>$1</em>');
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

export interface UIHandlers {
  onNewGame: () => void;
  onContinue: () => void;
  onResume: () => void;
  onSave: () => void;
  onQuitToTitle: () => void;
  onSettingsChange: (s: Settings) => void;
  onInteract: () => void;
  onPause: () => void;
  onDialogueAdvance: () => void;
  onDialogueChoose: (index: number) => void;
}

/**
 * DOM user interface drawn over the pixel canvas: title screen, prompts,
 * dialogue box, pause menu and settings. Styled like an illuminated manuscript.
 */
export class UI {
  readonly root: HTMLElement;
  private title: HTMLElement;
  private continueBtn: HTMLButtonElement;
  private hud: HTMLElement;
  private prompt: HTMLElement;
  private actionBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private place: HTMLElement;
  private fps: HTMLElement;
  private toast: HTMLElement;
  private dialogue: HTMLElement;
  private dlgSpeaker: HTMLElement;
  private dlgText: HTMLElement;
  private dlgChoices: HTMLElement;
  private dlgHint: HTMLElement;
  private pause: HTMLElement;
  private settings: HTMLElement;
  private settingsReturn: 'title' | 'pause' = 'title';
  private typing: { full: string; shown: number } | null = null;
  private placeTimer = 0;
  private toastTimer = 0;
  selectedChoice = 0;
  private choiceCount = 0;

  constructor(root: HTMLElement, private h: UIHandlers, private settingsValue: Settings) {
    this.root = root;

    // ---- title
    this.title = el('div', 'screen title');
    this.title.innerHTML = `
      <div class="title-inner">
        <h1>Threnod</h1>
        <p class="subtitle">The Last Song of a Forgotten World</p>
        <div class="menu"></div>
        <p class="footnote">Development build · Phase 5 · visual style test</p>
      </div>`;
    const menu = this.title.querySelector('.menu')!;
    this.continueBtn = this.button('Continue', () => h.onContinue());
    menu.append(this.continueBtn, this.button('New Game', () => h.onNewGame()), this.button('Settings', () => this.openSettings('title')));

    // ---- hud
    this.hud = el('div', 'hud hidden');
    this.prompt = el('div', 'prompt hidden');
    this.actionBtn = el('button', 'action-btn hidden');
    this.actionBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      h.onInteract();
    });
    this.pauseBtn = el('button', 'pause-btn', '❙❙');
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      h.onPause();
    });
    this.place = el('div', 'place-name');
    this.fps = el('div', 'fps hidden');
    this.hud.append(this.prompt, this.actionBtn, this.pauseBtn, this.place, this.fps);

    this.toast = el('div', 'toast');

    // ---- dialogue
    this.dialogue = el('div', 'dialogue hidden');
    this.dlgSpeaker = el('div', 'speaker');
    this.dlgText = el('div', 'text');
    this.dlgChoices = el('div', 'choices');
    this.dlgHint = el('div', 'hint');
    this.dialogue.append(this.dlgSpeaker, this.dlgText, this.dlgChoices, this.dlgHint);
    this.dialogue.addEventListener('click', () => {
      if (this.choiceCount === 0) h.onDialogueAdvance();
    });

    // ---- pause
    this.pause = el('div', 'screen pause hidden');
    const pin = el('div', 'panel');
    pin.append(
      el('h2', '', 'Paused'),
      this.button('Resume', () => h.onResume()),
      this.button('Save', () => h.onSave()),
      this.button('Settings', () => this.openSettings('pause')),
      this.button('Quit to Title', () => h.onQuitToTitle()),
    );
    this.pause.append(pin);

    // ---- settings
    this.settings = el('div', 'screen settings hidden');
    this.buildSettings();

    root.append(this.title, this.hud, this.toast, this.dialogue, this.pause, this.settings);
  }

  private button(label: string, fn: () => void): HTMLButtonElement {
    const b = el('button', 'btn', label);
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    return b;
  }

  private buildSettings(): void {
    const s = this.settingsValue;
    const panel = el('div', 'panel');
    panel.append(el('h2', '', 'Settings'));
    const row = (label: string, control: HTMLElement) => {
      const r = el('label', 'row');
      r.append(el('span', '', label), control);
      panel.append(r);
    };
    const change = () => this.h.onSettingsChange({ ...s });

    const res = el('select');
    res.id = 'set-quality';
    for (const [v, t] of [['low', 'Low (fastest)'], ['medium', 'Medium'], ['high', 'High (sharpest)']] as const) {
      const o = el('option', '', t);
      o.value = v;
      if (s.quality === v) o.selected = true;
      res.append(o);
    }
    res.addEventListener('change', () => {
      s.quality = res.value as Settings['quality'];
      change();
    });
    row('Graphics quality', res);

    const toggle = (key: 'bloom' | 'grain' | 'invertY' | 'showFps', label: string) => {
      const c = el('input');
      c.type = 'checkbox';
      c.id = 'set-' + key;
      c.checked = s[key];
      c.addEventListener('change', () => {
        s[key] = c.checked;
        change();
      });
      row(label, c);
    };
    toggle('bloom', 'Glow (bloom)');
    toggle('grain', 'Film grain');
    toggle('invertY', 'Invert camera');
    const sens = el('input');
    sens.type = 'range';
    sens.min = '0.4';
    sens.max = '2';
    sens.step = '0.1';
    sens.value = String(s.sensitivity);
    sens.addEventListener('input', () => {
      s.sensitivity = Number(sens.value);
      change();
    });
    row('Camera speed', sens);
    toggle('showFps', 'Show FPS');
    panel.append(this.button('Back', () => this.closeSettings()));
    this.settings.append(panel);
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.settingsReturn = from;
    this.settings.classList.remove('hidden');
    (from === 'title' ? this.title : this.pause).classList.add('hidden');
  }

  private closeSettings(): void {
    this.settings.classList.add('hidden');
    (this.settingsReturn === 'title' ? this.title : this.pause).classList.remove('hidden');
  }

  // ------------------------------------------------------------ screens
  showTitle(hasSave: boolean): void {
    this.continueBtn.style.display = hasSave ? '' : 'none';
    this.title.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.dialogue.classList.add('hidden');
  }

  showGame(): void {
    this.title.classList.add('hidden');
    this.pause.classList.add('hidden');
    this.settings.classList.add('hidden');
    this.hud.classList.remove('hidden');
  }

  showPause(show: boolean): void {
    this.pause.classList.toggle('hidden', !show);
    if (!show) this.settings.classList.add('hidden');
  }

  setFps(visible: boolean, fps: number): void {
    this.fps.classList.toggle('hidden', !visible);
    if (visible) this.fps.textContent = `${fps.toFixed(0)} fps`;
  }

  setPrompt(verb: string | null, touch: boolean): void {
    if (!verb) {
      this.prompt.classList.add('hidden');
      this.actionBtn.classList.add('hidden');
      return;
    }
    if (touch) {
      this.prompt.classList.add('hidden');
      this.actionBtn.classList.remove('hidden');
      this.actionBtn.textContent = verb;
    } else {
      this.actionBtn.classList.add('hidden');
      this.prompt.classList.remove('hidden');
      this.prompt.innerHTML = `<kbd>E</kbd> ${verb}`;
    }
  }

  setTouchMode(touch: boolean): void {
    this.root.classList.toggle('touch', touch);
  }

  showPlace(name: string): void {
    this.place.textContent = name;
    this.place.classList.add('visible');
    this.placeTimer = 3.5;
  }

  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.add('visible');
    this.toastTimer = 2;
  }

  // ------------------------------------------------------------ dialogue
  showDialogue(node: DialogueNode, choices: Choice[], touch: boolean): void {
    this.dialogue.classList.remove('hidden');
    this.prompt.classList.add('hidden');
    this.actionBtn.classList.add('hidden');
    this.dlgSpeaker.textContent = node.speaker ?? '';
    this.dlgSpeaker.style.display = node.speaker ? '' : 'none';
    this.dialogue.classList.toggle('narration', !node.speaker);
    this.typing = { full: node.text, shown: 0 };
    this.dlgText.innerHTML = '';
    this.dlgChoices.innerHTML = '';
    this.choiceCount = choices.length;
    this.selectedChoice = 0;
    choices.forEach((c, i) => {
      const b = this.button(`${i + 1}. ${format(c.text)}`, () => this.h.onDialogueChoose(i));
      b.classList.add('choice');
      this.dlgChoices.append(b);
    });
    this.dlgChoices.style.visibility = 'hidden';
    this.dlgHint.textContent = choices.length ? '' : touch ? 'tap to continue' : 'E / Enter to continue';
    this.highlightChoice();
  }

  hideDialogue(): void {
    this.dialogue.classList.add('hidden');
    this.typing = null;
  }

  /** Returns true if the typewriter was still running (and has now been completed). */
  skipTyping(): boolean {
    if (this.typing && this.typing.shown < this.typing.full.length) {
      this.typing.shown = this.typing.full.length;
      this.renderTyping();
      return true;
    }
    return false;
  }

  moveChoice(delta: number): void {
    if (!this.choiceCount) return;
    this.selectedChoice = (this.selectedChoice + delta + this.choiceCount) % this.choiceCount;
    this.highlightChoice();
  }

  private highlightChoice(): void {
    Array.from(this.dlgChoices.children).forEach((c, i) => c.classList.toggle('selected', i === this.selectedChoice));
  }

  private renderTyping(): void {
    if (!this.typing) return;
    const { full, shown } = this.typing;
    this.dlgText.innerHTML = format(full.slice(0, Math.floor(shown)));
    if (shown >= full.length) this.dlgChoices.style.visibility = 'visible';
  }

  update(dt: number): void {
    if (this.typing && this.typing.shown < this.typing.full.length) {
      this.typing.shown = Math.min(this.typing.full.length, this.typing.shown + dt * 55);
      this.renderTyping();
    }
    if (this.placeTimer > 0) {
      this.placeTimer -= dt;
      if (this.placeTimer <= 0) this.place.classList.remove('visible');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toast.classList.remove('visible');
    }
  }
}
