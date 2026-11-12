import { prisma, getSettings } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { clanWeekGoal, goalProgress, memberWeekProgress } from "@/lib/stats";
import { weekRange, weekLabel, DAY_MS } from "@/lib/period";
import { Card, Empty, PageHeader, Progress, StatusBadge } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { deleteGoalAction, saveGoalAction } from "@/app/actions";
import { GOAL_METRICS, METRIC_LABEL, hasRole, type GoalMetric } from "@/lib/domain";
import { fmtNum, fmtPct } from "@/lib/format";
import { FORECAST_LABEL, type ForecastStatus } from "@/lib/forecast";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await currentUser();
  const officer = hasRole(user?.role, "OFFIZIER");
  const s = await getSettings();
  const wk = weekRange();
  const [clan, members, memberList, history] = await Promise.all([
    clanWeekGoal(),
    memberWeekProgress(s.defaultMemberGoalPoints),
    prisma.member.findMany({ where: { status: { not: "AUSGETRETEN" } }, orderBy: { name: "asc" } }),
    prisma.goal.findMany({ where: { scope: "CLAN", periodEnd: { lte: wk.end } }, orderBy: { periodStart: "desc" }, take: 8 }),
  ]);
  const histProgress = await Promise.all(history.map(async (g) => ({ g, p: await goalProgress(g) })));
  const counts = members.reduce<Record<string, number>>((a, r) => ((a[r.progress.status] = (a[r.progress.status] ?? 0) + 1), a), {});
  const individual = members.filter((r) => r.individual);

  return (
    <>
      <PageHeader title="Ziele" subtitle={`${weekLabel(wk.start)} · Prognose = aktuelles Tempo hochgerechnet bis Sonntag 24:00 UTC`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Clan-Wochenziel" className="lg:col-span-2">
          {clan ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-3xl font-bold tabular-nums">{fmtPct(clan.progress.percent)}</span>
                <StatusBadge status={clan.progress.status} />
              </div>
              <Progress percent={clan.progress.percent} projectedPercent={clan.progress.projectedPercent} status={clan.progress.status} />
              <p className="text-sm text-slate-500">{fmtNum(clan.progress.current)} von {fmtNum(clan.progress.target)} {METRIC_LABEL[clan.goal.metric as GoalMetric]} · Prognose {fmtNum(clan.progress.projected)} ({fmtPct(clan.progress.projectedPercent)}) · noch {fmtNum(clan.progress.neededPerDay)} pro Tag nötig</p>
            </div>
          ) : <Empty>Für diese Woche ist kein Clan-Ziel gesetzt.</Empty>}
        </Card>
        <Card title="Mitglieder nach Prognose">
          <ul className="space-y-1.5 text-sm">
            {(["ERREICHT", "AUF_KURS", "KNAPP", "GEFAEHRDET", "NICHT_GESTARTET"] as ForecastStatus[]).map((k) => (
              <li key={k} className="flex justify-between"><StatusBadge status={k} /><span className="tabular-nums">{counts[k] ?? 0}</span></li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Standardziel je Mitglied: {fmtNum(s.defaultMemberGoalPoints)} Punkte/Woche (in Admin → Einstellungen änderbar).</p>
        </Card>
      </div>

      {officer && (
        <Card title="Ziel festlegen" className="mt-4">
          <ActionForm action={saveGoalAction} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <div><label className="label">Gilt für</label><select name="scope" className="input"><option value="CLAN">Clan</option><option value="MITGLIED">Mitglied</option></select></div>
            <div><label className="label">Mitglied (falls Mitgliedsziel)</label><select name="memberId" className="input"><option value="">–</option>{memberList.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label className="label">Woche (beliebiger Tag)</label><input name="week" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></div>
            <div><label className="label">Messgröße</label><select name="metric" className="input">{GOAL_METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}</select></div>
            <div><label className="label">Zielwert</label><input name="targetValue" type="number" min={1} required className="input" /></div>
          </ActionForm>
          <p className="mt-2 text-xs text-slate-500">Ein vorhandenes Ziel für dieselbe Woche wird ersetzt (protokolliert).</p>
        </Card>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Individuelle Mitgliedsziele (diese Woche)">
          {individual.length ? (
            <ul className="space-y-3">
              {individual.map((r) => (
                <li key={r.member.id}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{r.member.name}</span><span className="tabular-nums">{fmtNum(r.progress.current)} / {fmtNum(r.progress.target)} {METRIC_LABEL[r.metric]}</span></div>
                  <Progress percent={r.progress.percent} projectedPercent={r.progress.projectedPercent} status={r.progress.status} />
                </li>
              ))}
            </ul>
          ) : <Empty>Keine individuellen Ziele – es gilt das Standardziel.</Empty>}
        </Card>
        <Card title="Verlauf Clan-Ziele">
          {histProgress.length ? (
            <table className="table">
              <thead><tr><th>Woche</th><th className="num">Ziel</th><th className="num">Ergebnis</th><th>Status</th>{officer && <th></th>}</tr></thead>
              <tbody>{histProgress.map(({ g, p }) => (
                <tr key={g.id}>
                  <td>{weekLabel(g.periodStart)}</td><td className="num">{fmtNum(g.targetValue)}</td><td className="num">{fmtNum(p.current)} ({fmtPct(p.percent)})</td>
                  <td>{g.periodEnd.getTime() <= Date.now() ? (p.current >= p.target ? <StatusBadge status="ERREICHT" /> : <span className="text-xs text-red-600">Verfehlt</span>) : <StatusBadge status={p.status} />}</td>
                  {officer && <td><form action={deleteGoalAction}><input type="hidden" name="id" value={g.id} /><button className="text-xs text-red-600 hover:underline">Löschen</button></form></td>}
                </tr>
              ))}</tbody>
            </table>
          ) : <Empty>Noch keine Ziele.</Empty>}
          <p className="mt-2 text-xs text-slate-500">{Object.values(FORECAST_LABEL).join(" · ")} – „Knapp“ = Prognose ≥ 85 % des Ziels. Zeitraum: Mo 00:00 bis So 24:00 UTC. {weekLabel(new Date(wk.start.getTime() - DAY_MS))} = Vorwoche.</p>
        </Card>
      </div>
    </>
  );
}
