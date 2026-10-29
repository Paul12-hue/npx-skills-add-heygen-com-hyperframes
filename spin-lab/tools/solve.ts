// QA: brute-force every stage to prove it is solvable and measure how forgiving it is.
import { EXPERIMENTS, buildEnv, evaluateShot } from '../src/game/experiments';
import { launchVectors, MAX_YAW } from '../src/physics/shot';
import { simulate } from '../src/physics/ballPhysics';
import type { SubstanceId } from '../src/config';

const only = process.argv[2];
const subs: SubstanceId[] = ['none', 'nitro', 'magnet', 'bounce', 'quantum'];
for (const ex of EXPERIMENTS) {
  if (only && ex.id !== only) continue;
  const seen = new Set<string>();
  for (const r of ex.rounds) {
    const st = r.stage;
    if (seen.has(st.title)) continue; seen.add(st.title);
    const candidates = st.substance === 'choose' ? subs : [st.substance ?? 'none'];
    const clocks = [0, 0.7, 1.4, 2.1, 2.8, 3.5, 4.2, 4.9];
    for (const sub of candidates) {
      let ok = 0, perfect = 0, n = 0; let example = '';
      const env = buildEnv(st, sub as SubstanceId);
      for (const clock of clocks) for (let yaw = -MAX_YAW; yaw <= MAX_YAW + 1e-9; yaw += MAX_YAW / 10)
        for (let p = 0; p <= 1.0001; p += 0.05) for (let sx = -1; sx <= 1.001; sx += 0.5) for (let sy = -1; sy <= 1.001; sy += 0.5) {
          if (sx * sx + sy * sy > 1.3) continue;
          const l = launchVectors({ yaw, power: p, spinX: sx, spinY: sy }, sub as SubstanceId);
          const sim = simulate(l.pos, l.v, l.w, env, clock);
          const o = evaluateShot(sim, st, clock);
          n++;
          if (o.success) { ok++; if (o.perfect) perfect++; if (!example) example = `c${clock} yaw${yaw.toFixed(2)} p${p.toFixed(2)} s(${sx},${sy})`; }
        }
      console.log(`${ex.code} ${st.title.padEnd(28)} ${String(sub).padEnd(8)} ok ${(100*ok/n).toFixed(2)}%  perfect ${(100*perfect/n).toFixed(3)}%  ${example}`);
    }
  }
}
