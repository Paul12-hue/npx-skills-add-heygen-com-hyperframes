import Link from "next/link";
import { Card, Empty, Kpi, Pill, Progress, StatusBadge } from "./ui";
import { DailyChart, DonutChart, HBarChart } from "./Charts";
import { periodStats, weekComparison, clanWeekGoal, inactiveMembers, memberWeekProgress, type StatsFilter } from "@/lib/stats";
import { SOURCE_LABEL, type Source } from "@/lib/domain";
import { fmtDateTime, fmtDay, fmtNum, fmtPct, fmtDate } from "@/lib/format";
import { getSettings } from "@/lib/db";
import { FORECAST_LABEL } from "@/lib/forecast";

/** Stufen in Bereiche bündeln (1, 2–5, 6–10 …), damit das Diagramm kompakt bleibt. */
function tierBands(rows: { key: number; count: number }[]) {
  const lbl = (t: number) => { if (t <= 1) return "Stufe 1"; const lo = Math.floor((t - 1) / 5) * 5 + 1; return `Stufe ${Math.max(lo, 2)}–${lo + 4}`; };
  const m = new Map<string, { name: string; value: number; o: number }>();
  for (const r of rows) { const k = lbl(Number(r.key)); const e = m.get(k) ?? { name: k, value: 0, o: Number(r.key) }; e.value += r.count; m.set(k, e); }
  return [...m.values()].sort((a, b) => a.o - b.o).map(({ name, value }) => ({ name, value }));
}

/** Dashboard – wird intern (mit Links) und über den öffentlichen Clan-Link (ohne Links) genutzt. */
export async function DashboardView({ filter, linkable = true }: { filter: StatsFilter; linkable?: boolean }) {
  const settings = await getSettings();
  const [stats, cmp, clanGoal, inactive, progress] = await Promise.all([
    periodStats(filter),
    weekComparison(),
    clanWeekGoal(),
    inactiveMembers(settings.inactiveAfterDays),
    memberWeekProgress(settings.defaultMemberGoalPoints),
  ]);
  const top10 = stats.members.slice(0, 10);
  const belowGoal = progress.filter((p) => p.progress.status === "GEFAEHRDET" && p.member.status === "AKTIV");
  const avg = stats.members.length ? Math.round(stats.totalPoints / stats.members.length) : 0;
  const M = ({ id, name }: { id: string; name: string }) =>
    linkable ? <Link href={`/mitglieder/${id}`} className="font-medium hover:underline">{name}</Link> : <span className="font-medium">{name}</span>;

  return (
    <div className="space-y-4">
      {/* Ebene 1: Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Truhen" value={fmtNum(stats.totalChests)} hint={`${fmtNum(stats.eventChests)} aus Events`} />
        <Kpi label="Punkte" value={fmtNum(stats.totalPoints)} trend={cmp.trendPct} hint="ggü. Vorwoche (gleicher Zeitpunkt)" />
        <Kpi label="Aktive Beitragende" value={`${stats.members.length}`} hint={`Ø ${fmtNum(avg)} Punkte`} />
        <Kpi
          label="Wochenziel Clan"
          value={clanGoal ? fmtPct(clanGoal.progress.percent) : "–"}
          hint={clanGoal ? <StatusBadge status={clanGoal.progress.status} /> : "kein Ziel gesetzt"}
        />
      </div>

      {/* Ebene 2: Wochenfortschritt + Trend */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Wochenfortschritt" className="lg:col-span-1">
          {clanGoal ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-2xl font-bold tabular-nums">{fmtNum(clanGoal.progress.current)}</span>
                <span className="text-sm text-slate-500">von {fmtNum(clanGoal.progress.target)} {clanGoal.goal.metric === "TRUHEN" ? "Truhen" : "Punkten"}</span>
              </div>
              <Progress percent={clanGoal.progress.percent} projectedPercent={clanGoal.progress.projectedPercent} status={clanGoal.progress.status} />
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">Prognose</dt><dd className="text-right font-medium tabular-nums">{fmtNum(clanGoal.progress.projected)} ({fmtPct(clanGoal.progress.projectedPercent)})</dd>
                <dt className="text-slate-500">Nötig pro Tag</dt><dd className="text-right font-medium tabular-nums">{fmtNum(clanGoal.progress.neededPerDay)}</dd>
                <dt className="text-slate-500">Mitglieder unter Ziel</dt><dd className="text-right font-medium tabular-nums">{belowGoal.length}</dd>
              </dl>
            </div>
          ) : <Empty>Noch kein Clan-Wochenziel definiert.</Empty>}
        </Card>
        <Card title="Punkte pro Tag" className="lg:col-span-2">
          <DailyChart data={stats.daily.map((d) => ({ label: fmtDay(d.day), regular: d.points - d.event, event: d.event }))} />
        </Card>
      </div>

      {/* Ebene 3: Top 10 + Verteilung */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Top 10 Mitglieder" className="lg:col-span-2">
          {top10.length ? (
            <div className="overflow-x-auto">
              <table className="table">
                <thead><tr><th>#</th><th>Mitglied</th><th className="num">Truhen</th><th className="num">Punkte</th><th className="num">davon Event</th><th className="num">Anteil</th></tr></thead>
                <tbody>
                  {top10.map((m, i) => (
                    <tr key={m.id}>
                      <td className="tabular-nums text-slate-500">{i + 1}</td>
                      <td><M id={m.id} name={m.name} /></td>
                      <td className="num">{fmtNum(m.count)}</td>
                      <td className="num font-semibold">{fmtNum(m.points)}</td>
                      <td className="num">{fmtNum(m.eventPoints)}</td>
                      <td className="num">{fmtPct(stats.totalPoints ? (m.points / stats.totalPoints) * 100 : 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>Keine Truhen im Zeitraum.</Empty>}
        </Card>
        <Card title="Truhen nach Typ">
          {stats.byType.length ? <DonutChart data={stats.byType.map((t) => ({ name: t.key, value: t.count }))} /> : <Empty>Keine Daten.</Empty>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Truhen nach Stufe">
          {stats.byTier.length ? <HBarChart valueLabel="Truhen" data={tierBands(stats.byTier)} /> : <Empty>Keine Daten.</Empty>}
        </Card>
        <Card title="Nach Quelle">
          <ul className="space-y-2 text-sm">
            {stats.bySource.map((s) => (
              <li key={s.key} className="flex justify-between"><span>{SOURCE_LABEL[s.key as Source] ?? s.key}</span><span className="tabular-nums">{fmtNum(s.count)} · {fmtNum(s.points)} P</span></li>
            ))}
            {!stats.bySource.length && <Empty>Keine Daten.</Empty>}
          </ul>
          {stats.byEvent.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Event-Truhen</h3>
              <ul className="space-y-1 text-sm">
                {stats.byEvent.map((e) => <li key={e.key} className="flex justify-between"><Pill tone="violet">{e.key}</Pill><span className="tabular-nums">{fmtNum(e.count)} · {fmtNum(e.points)} P</span></li>)}
              </ul>
            </>
          )}
        </Card>
        <Card title={`Inaktiv (≥ ${settings.inactiveAfterDays} Tage)`}>
          {inactive.length ? (
            <ul className="space-y-1.5 text-sm">
              {inactive.slice(0, 12).map((m) => (
                <li key={m.id} className="flex justify-between gap-2"><M id={m.id} name={m.name} /><span className="text-slate-500">{m.last ? `zuletzt ${fmtDate(m.last)}` : "noch nie"}</span></li>
              ))}
              {inactive.length > 12 && <li className="text-xs text-slate-500">+ {inactive.length - 12} weitere</li>}
            </ul>
          ) : <Empty>Alle aktiven Mitglieder haben beigetragen. 🎉</Empty>}
          {belowGoal.length > 0 && (
            <>
              <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Wochenziel gefährdet</h3>
              <div className="flex flex-wrap gap-1">{belowGoal.slice(0, 20).map((p) => <Pill key={p.member.id} tone="red">{p.member.name} · {fmtPct(p.progress.percent)}</Pill>)}</div>
            </>
          )}
        </Card>
      </div>

      <Card title="Letzte Aktivitäten" action={linkable ? <Link href="/truhen" className="text-sm text-gold-600 hover:underline">Alle Truhen →</Link> : undefined}>
        {stats.chests.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Zeit (UTC)</th><th>Mitglied</th><th>Truhe</th><th>Stufe</th><th>Quelle</th><th className="num">Punkte</th></tr></thead>
              <tbody>
                {stats.chests.slice(0, 12).map((c) => (
                  <tr key={c.id}>
                    <td className="text-slate-500">{fmtDateTime(c.capturedAt)}</td>
                    <td><M id={c.member.id} name={c.member.name} /></td>
                    <td>{c.chestType.name} {c.event && <Pill tone="violet">{c.event.name}</Pill>}</td>
                    <td>{c.tier}</td>
                    <td>{SOURCE_LABEL[c.source as Source] ?? c.source}</td>
                    <td className="num">{fmtNum(c.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Noch keine Truhen erfasst.</Empty>}
      </Card>
      <p className="text-center text-xs text-slate-500">Gezählt werden nur gültige Clan-Truhen. Einträge mit Status „Prüfen“ oder „Verworfen“ sind ausgeschlossen. Status: {Object.values(FORECAST_LABEL).join(" · ")}.</p>
    </div>
  );
}
