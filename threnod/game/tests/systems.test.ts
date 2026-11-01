import { describe, expect, it } from 'vitest';
import { inputToVelocity, resolveCollisions, stepBody, platformHeight, DEFAULT_MOVE, type Body, type World } from '../src/player/movement';
import { findTarget, placeName } from '../src/interaction/Interaction';
import { parseSave, parseSettings, DEFAULT_SETTINGS, SAVE_VERSION } from '../src/save/Save';
import { heightAt, LAYOUT, lakeFactor } from '../src/world/terrain';
import { fbm, rng } from '../src/world/noise';
import { skyStateAt } from '../src/world/Sky';

describe('movement', () => {
  it('forward on the stick moves towards where the camera looks', () => {
    const [vx, vz] = inputToVelocity(0, 1, 0, false);
    expect(vx).toBeCloseTo(0);
    expect(vz).toBeLessThan(0); // camera yaw 0 looks towards -z
    const [rx, rz] = inputToVelocity(1, 0, 0, false);
    expect(rx).toBeGreaterThan(0);
    expect(rz).toBeCloseTo(0);
  });

  it('respects the camera yaw', () => {
    const [vx, vz] = inputToVelocity(0, 1, Math.PI / 2, false);
    expect(vx).toBeLessThan(0);
    expect(vz).toBeCloseTo(0);
  });

  it('ignores tiny stick drift and runs at full tilt', () => {
    expect(inputToVelocity(0.03, 0.02, 0, false)).toEqual([0, 0]);
    const [, vz] = inputToVelocity(0, 1, 0, true);
    expect(Math.abs(vz)).toBeCloseTo(DEFAULT_MOVE.runSpeed);
  });

  it('pushes the player out of colliders', () => {
    const [x, z] = resolveCollisions(0.5, 0, 0.4, [{ x: 0, z: 0, r: 1 }]);
    expect(Math.hypot(x, z)).toBeCloseTo(1.4);
  });

  it('blocks rotated boxes (houses) and slides along them', () => {
    const house = [{ x: 0, z: 0, hx: 3, hz: 2, rot: 0.5 }];
    // walking straight into the house from the side stops at its wall
    const [x, z] = resolveCollisions(0.2, 0.1, 0.4, house);
    const lx = (x * Math.cos(-0.5) - z * Math.sin(-0.5));
    const lz = (x * Math.sin(-0.5) + z * Math.cos(-0.5));
    expect(Math.abs(lx) >= 3 + 0.39 || Math.abs(lz) >= 2 + 0.39).toBe(true);
  });

  const flat: World = { colliders: [], platforms: [], terrain: () => 1 };
  const body = (): Body => ({ x: 0, y: 1, z: 0, vy: 0, onGround: true });

  it('does not walk into deep water and stays inside the vale', () => {
    const deep: World = { colliders: [], platforms: [], terrain: (x) => (x > 1 ? -5 : 1) };
    const b = body();
    for (let i = 0; i < 60; i++) stepBody(b, 10, 0, false, 1 / 60, deep);
    expect(b.x).toBeLessThan(1.2);
    const far = { ...body(), x: DEFAULT_MOVE.boundsRadius - 0.5 };
    for (let i = 0; i < 60; i++) stepBody(far, 10, 0, false, 1 / 60, flat);
    expect(Math.hypot(far.x, far.z)).toBeLessThanOrEqual(DEFAULT_MOVE.boundsRadius + 1e-6);
  });

  it('jumps, falls back and lands', () => {
    const b = body();
    stepBody(b, 0, 0, true, 1 / 60, flat);
    expect(b.onGround).toBe(false);
    let peak = 0;
    for (let i = 0; i < 120; i++) {
      stepBody(b, 0, 0, false, 1 / 60, flat);
      peak = Math.max(peak, b.y);
    }
    expect(peak).toBeGreaterThan(2);
    expect(b.onGround).toBe(true);
    expect(b.y).toBeCloseTo(1);
  });

  it('cannot walk up a cliff but can climb a gentle slope', () => {
    const cliff: World = { colliders: [], platforms: [], terrain: (x) => (x > 1 ? 4 : 1) };
    const b = body();
    for (let i = 0; i < 60; i++) stepBody(b, 5, 0, false, 1 / 60, cliff);
    expect(b.x).toBeLessThan(1.1);
    const ramp: World = { colliders: [], platforms: [], terrain: (x) => 1 + Math.max(0, x) * 0.3 };
    const c = body();
    for (let i = 0; i < 120; i++) stepBody(c, 4, 0, false, 1 / 60, ramp);
    expect(c.x).toBeGreaterThan(5);
    expect(c.y).toBeCloseTo(1 + c.x * 0.3, 1);
  });

  it('walks across a bridge over water', () => {
    const river: World = {
      colliders: [],
      platforms: [{ x: 5, z: 0, hx: 1.5, hz: 10, rot: Math.PI / 2, y: 1.1 }],
      terrain: (x) => (x > 1 && x < 9 ? -2 : 1),
    };
    expect(platformHeight(5, 0, river.platforms)).toBeCloseTo(1.1);
    const b = body();
    for (let i = 0; i < 180; i++) stepBody(b, 5, 0, false, 1 / 60, river);
    expect(b.x).toBeGreaterThan(9);
    expect(b.y).toBeGreaterThan(0.9);
  });
});

describe('interaction', () => {
  const targets = [
    { id: 'front', x: 0, z: -2, radius: 3, verb: 'Look', dialogue: 'x' },
    { id: 'behind', x: 0, z: 1.5, radius: 3, verb: 'Look', dialogue: 'y' },
  ];
  it('prefers what the player faces', () => {
    expect(findTarget(0, 0, 0, targets)?.id).toBe('front');
    expect(findTarget(0, 0, Math.PI, targets)?.id).toBe('behind');
  });
  it('returns null when nothing is in range', () => {
    expect(findTarget(50, 50, 0, targets)).toBeNull();
  });
  it('names places', () => {
    expect(placeName(LAYOUT.village.x, LAYOUT.village.z)).toBe('Candlewick');
    expect(placeName(LAYOUT.cemetery.x, LAYOUT.cemetery.z)).toBe("Saint Ebba's");
  });
});

describe('save data', () => {
  it('round-trips a valid save', () => {
    const raw = JSON.stringify({ version: SAVE_VERSION, savedAt: 'x', player: { x: 1, z: 2, yaw: 3 }, hour: 30, flags: { a: true } });
    const s = parseSave(raw);
    expect(s?.player).toEqual({ x: 1, z: 2, yaw: 3 });
    expect(s?.hour).toBe(6); // wrapped into 0..24
    expect(s?.flags).toEqual({ a: true });
  });
  it('rejects broken or foreign data instead of crashing', () => {
    expect(parseSave(null)).toBeNull();
    expect(parseSave('{not json')).toBeNull();
    expect(parseSave(JSON.stringify({ version: 999, player: { x: 0, z: 0, yaw: 0 } }))).toBeNull();
    expect(parseSave(JSON.stringify({ version: SAVE_VERSION, player: { x: 'a', z: 0, yaw: 0 } }))).toBeNull();
  });
  it('falls back to default settings', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('garbage')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ quality: 'ultra' })).quality).toBe('medium');
    const old = parseSettings(JSON.stringify({ renderHeight: 360, palette: true, bloom: false }));
    expect(old.bloom).toBe(false);
    expect(Object.keys(old)).not.toContain('palette');
  });
});

describe('world generation', () => {
  it('is deterministic', () => {
    expect(heightAt(12.3, -40.1)).toBe(heightAt(12.3, -40.1));
    const a = rng(5);
    const b = rng(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(fbm(1.5, 2.5)).toBeGreaterThanOrEqual(0);
    expect(fbm(1.5, 2.5)).toBeLessThanOrEqual(1);
  });
  it('has a lake below water level, dry spawn areas and high valley walls', () => {
    expect(heightAt(LAYOUT.lake.x, LAYOUT.lake.z)).toBeLessThan(LAYOUT.waterLevel - 1);
    expect(lakeFactor(LAYOUT.lake.x, LAYOUT.lake.z)).toBeLessThan(0.1);
    expect(heightAt(LAYOUT.village.x, LAYOUT.village.z)).toBeCloseTo(LAYOUT.village.height, 0);
    expect(heightAt(LAYOUT.cemetery.x, LAYOUT.cemetery.z)).toBeGreaterThan(LAYOUT.waterLevel + 1);
    expect(heightAt(0, 205)).toBeGreaterThan(15);
  });
});

describe('sky', () => {
  it('is darkest at night and never fully bright at noon (the Long Vesper)', () => {
    expect(skyStateAt(0).night).toBe(1);
    expect(skyStateAt(12).night).toBe(0);
    expect(skyStateAt(12).top.r + skyStateAt(12).top.g + skyStateAt(12).top.b).toBeLessThan(1.2);
    expect(skyStateAt(24).night).toBeCloseTo(skyStateAt(0).night);
    expect(skyStateAt(21).night).toBeGreaterThan(0.8);
  });
});
