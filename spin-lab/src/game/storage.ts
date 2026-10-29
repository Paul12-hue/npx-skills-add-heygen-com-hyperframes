// Local persistence with a silent in-memory fallback (private mode, blocked storage, …).

import type { Quality } from '../render/Renderer';

const KEY = 'spinlab.v1';

export interface ScoreEntry { name: string; score: number; date: number; rank: string }

export interface Settings {
  sound: boolean;
  ambience: number;
  quality: Quality;
  preview: boolean;
  voice: boolean;
  name: string;
}

interface SaveData {
  settings: Settings;
  scores: Record<string, ScoreEntry[]>;
  completed: string[];
}

const defaults = (): SaveData => ({
  settings: { sound: true, ambience: 0.6, quality: 'auto', preview: true, voice: false, name: 'SPIELER' },
  scores: {},
  completed: [],
});

let mem: SaveData = defaults();
let persistent = true;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      mem = { ...defaults(), ...d, settings: { ...defaults().settings, ...(d.settings ?? {}) } };
    }
  } catch {
    persistent = false;
  }
}
load();

function save() {
  if (!persistent) return;
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { persistent = false; }
}

export const store = {
  get persistent() { return persistent; },
  get settings() { return mem.settings; },
  setSettings(p: Partial<Settings>) { mem.settings = { ...mem.settings, ...p }; save(); },
  scores(id: string) { return mem.scores[id] ?? []; },
  best(id: string) { return mem.scores[id]?.[0]?.score ?? 0; },
  /** Returns the placement (0-based) or -1 when it did not make the top 5. */
  addScore(id: string, score: number, rank: string): number {
    const list = [...(mem.scores[id] ?? [])];
    const entry: ScoreEntry = { name: mem.settings.name || 'SPIELER', score, date: Date.now(), rank };
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const top = list.slice(0, 5);
    mem.scores[id] = top;
    save();
    return top.indexOf(entry);
  },
  markCompleted(id: string) {
    if (!mem.completed.includes(id)) { mem.completed.push(id); save(); }
  },
  isCompleted(id: string) { return mem.completed.includes(id); },
  resetScores() { mem.scores = {}; mem.completed = []; save(); },
};
