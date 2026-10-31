import type { Flags } from '../dialogue/Dialogue';

/**
 * Save data lives in the browser (localStorage). Every access is wrapped in
 * try/catch: private browsing or blocked storage must never crash the game.
 */

export const SAVE_VERSION = 1;
const SAVE_KEY = 'threnod.save';
const SETTINGS_KEY = 'threnod.settings';

export interface SaveData {
  version: number;
  savedAt: string;
  player: { x: number; z: number; yaw: number };
  hour: number;
  flags: Flags;
}

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  bloom: boolean;
  grain: boolean;
  look: 'smooth' | 'mix' | 'pixel';
  invertY: boolean;
  sensitivity: number;
  showFps: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  quality: 'medium',
  bloom: true,
  grain: true,
  look: 'mix',
  invertY: false,
  sensitivity: 1,
  showFps: false,
};

/** Validates and upgrades raw save data. Returns null for anything unusable. */
export function parseSave(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<SaveData>;
    if (!d || typeof d !== 'object') return null;
    if (d.version !== SAVE_VERSION) return null; // future: migrations go here
    const p = d.player;
    if (!p || ![p.x, p.z, p.yaw].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
    return {
      version: SAVE_VERSION,
      savedAt: typeof d.savedAt === 'string' ? d.savedAt : '',
      player: { x: p.x, z: p.z, yaw: p.yaw },
      hour: typeof d.hour === 'number' && Number.isFinite(d.hour) ? ((d.hour % 24) + 24) % 24 : 18.5,
      flags: d.flags && typeof d.flags === 'object' ? (d.flags as Flags) : {},
    };
  } catch {
    return null;
  }
}

export function parseSettings(raw: string | null): Settings {
  try {
    const s = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    const out = { ...DEFAULT_SETTINGS, ...s };
    if (!['low', 'medium', 'high'].includes(out.quality)) out.quality = DEFAULT_SETTINGS.quality;
    if (!['smooth', 'mix', 'pixel'].includes(out.look)) out.look = DEFAULT_SETTINGS.look;
    for (const k of ['bloom', 'grain', 'invertY', 'showFps'] as const) if (typeof out[k] !== 'boolean') out[k] = DEFAULT_SETTINGS[k];
    // drop settings from older builds
    const known = Object.keys(DEFAULT_SETTINGS);
    for (const k of Object.keys(out)) if (!known.includes(k)) delete (out as Record<string, unknown>)[k];
    if (typeof out.sensitivity !== 'number' || !(out.sensitivity > 0.2 && out.sensitivity < 3)) out.sensitivity = 1;
    return out;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export const Storage = {
  loadGame: (): SaveData | null => parseSave(read(SAVE_KEY)),
  saveGame: (d: Omit<SaveData, 'version' | 'savedAt'>): boolean =>
    write(SAVE_KEY, JSON.stringify({ ...d, version: SAVE_VERSION, savedAt: new Date().toISOString() })),
  clearGame: (): void => {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch {
      /* ignore */
    }
  },
  loadSettings: (): Settings => parseSettings(read(SETTINGS_KEY)),
  saveSettings: (s: Settings): boolean => write(SETTINGS_KEY, JSON.stringify(s)),
};
