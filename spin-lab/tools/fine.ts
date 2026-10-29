// Fine-grained search on one stage: npx tsx tools/fine.ts <expId> <roundIndex> [substance]
import { experimentById, buildEnv, evaluateShot, type ExperimentId } from '../src/game/experiments';
import { launchVectors, MAX_YAW } from '../src/physics/shot';
import { simulate } from '../src/physics/ballPhysics';
import type { SubstanceId } from '../src/config';
const ex = experimentById(process.argv[2] as ExperimentId);
const st = ex.rounds[Number(process.argv[3] ?? 0)].stage;
const subs = (process.argv[4] ? [process.argv[4]] : st.substance === 'choose' ? ['none','nitro','magnet','bounce','quantum'] : [st.substance ?? 'none']) as SubstanceId[];
for (const sub of subs) {
  const env = buildEnv(st, sub);
  let ok = 0, n = 0, perf = 0; const ex: string[] = [];
  for (let yaw = -MAX_YAW; yaw <= MAX_YAW + 1e-9; yaw += MAX_YAW / 20)
    for (let p = 0; p <= 1.0001; p += 0.025) for (let sx = -1; sx <= 1.001; sx += 0.2) for (let sy = -1; sy <= 1.001; sy += 0.2) {
      if (sx * sx + sy * sy > 1.0001) continue;
      const l = launchVectors({ yaw, power: p, spinX: sx, spinY: sy }, sub);
      const o = evaluateShot(simulate(l.pos, l.v, l.w, env, 0), st, 0); n++;
      if (o.success) { ok++; if (o.perfect) perf++; if (ex.length < 6 && Math.random() < 0.2) ex.push(`yaw${yaw.toFixed(2)} p${p.toFixed(2)} s(${sx.toFixed(1)},${sy.toFixed(1)})`); }
    }
  console.log(st.title, sub, `ok ${(100 * ok / n).toFixed(3)}% perfect ${(100 * perf / n).toFixed(3)}%`, ex.join(' | '));
}
