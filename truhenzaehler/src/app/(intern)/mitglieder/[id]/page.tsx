import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma, getSettings } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { periodStats, memberWeekProgress } from "@/lib/stats";
import { weekRange, DAY_MS, weekLabel } from "@/lib/period";
import { Card, Kpi, PageHeader, Pill, Progress, StatusBadge, Empty } from "@/components/ui";
import { DailyChart, DonutChart } from "@/components/Charts";
import { ActionForm } from "@/components/ActionForm";
import { AuditList } from "@/components/AuditList";
import { saveMemberAction } from "@/app/actions";
import { MEMBER_STATUS, MEMBER_STATUS_LABEL, SOURCE_LABEL, hasRole, type MemberStatus, type Source } from "@/lib/domain";
import { fmtDate, fmtDateTime, fmtDay, fmtNum, fmtPct } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function MemberProfile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await prisma.member.findUnique({ where: { id } });
  if (!m) notFound();
  const user = await currentUser();
  const officer = hasRole(user?.role, "OFFIZIER");
  const s = await getSettings();
  const now = new Date();
  const wk = weekRange(now);
  const last8Start = new Date(wk.start.getTime() - 7 * 7 * DAY_MS);
  const [week, thirty, all, prog, logs] = await Promise.all([
    periodStats({ start: wk.start, end: wk.end, memberId: id }),
    periodStats({ start: new Date(now.getTime() - 30 * DAY_MS), end: new Date(now.getTime() + DAY_MS), memberId: id }),
    periodStats({ start: last8Start, end: wk.end, memberId: id }),
    memberWeekProgress(s.defaultMemberGoalPoints).then((r) => r.find((x) => x.member.id === id)),
    officer ? prisma.auditLog.findMany({ where: { entity: "Member", entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" }, take: 20 }) : Promise.resolve([]),
  ]);
  // Wochenverlauf (8 Wochen)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const st = new Date(last8Start.getTime() + i * 7 * DAY_MS);
    const en = new Date(st.getTime() + 7 * DAY_MS);
    const c = all.chests.filter((x) => x.capturedAt >= st && x.capturedAt < en);
    return { label: weekLabel(st).replace(/\/\d+$/, ""), regular: c.filter((x) => !x.eventId).reduce((a, b) => a + b.points, 0), event: c.filter((x) => x.eventId).reduce((a, b) => a + b.points, 0) };
  });
  const rank = await prisma.chest.groupBy({ by: ["memberId"], where: { status: "GUELTIG", capturedAt: { gte: wk.start, lt: wk.end } }, _sum: { points: true } })
    .then((g) => g.sort((a, b) => (b._sum.points ?? 0) - (a._sum.points ?? 0)).findIndex((x) => x.memberId === id) + 1);

  return (
    <>
      <PageHeader title={m.name} subtitle={<>{m.clanRank} · seit {fmtDate(m.joinedAt)} · <Pill tone={m.status === "AKTIV" ? "green" : "slate"}>{MEMBER_STATUS_LABEL[m.status as MemberStatus]}</Pill></>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Punkte diese Woche" value={fmtNum(week.totalPoints)} hint={rank ? `Platz ${rank} im Clan` : "noch kein Beitrag"} />
        <Kpi label="Truhen diese Woche" value={fmtNum(week.totalChests)} hint={`${fmtNum(week.eventChests)} Event`} />
        <Kpi label="Ø Punkte / Tag (30 T.)" value={fmtNum(Math.round(thirty.totalPoints / 30))} />
        <Kpi label="Aktive Tage (30 T.)" value={`${thirty.daily.filter((d) => d.count > 0).length} / 30`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Wochenziel">
          {prog ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>{fmtNum(prog.progress.current)} / {fmtNum(prog.progress.target)}</span><StatusBadge status={prog.progress.status} /></div>
              <Progress percent={prog.progress.percent} projectedPercent={prog.progress.projectedPercent} status={prog.progress.status} />
              <p className="text-slate-500">{fmtPct(prog.progress.percent)} erreicht · Prognose {fmtNum(prog.progress.projected)} · nötig/Tag {fmtNum(prog.progress.neededPerDay)}</p>
              <p className="text-xs text-slate-500">{prog.individual ? "Individuelles Ziel" : "Standardziel des Clans"}</p>
            </div>
          ) : <Empty>Kein Ziel (ausgetreten).</Empty>}
        </Card>
        <Card title="Punkte je Woche (8 Wochen)" className="lg:col-span-2"><DailyChart data={weeks} /></Card>
        <Card title="Aktivität pro Tag (diese Woche)" className="lg:col-span-2"><DailyChart data={week.daily.map((d) => ({ label: fmtDay(d.day), regular: d.points - d.event, event: d.event }))} /></Card>
        <Card title="Truhentypen (30 Tage)">{thirty.byType.length ? <DonutChart data={thirty.byType.map((t) => ({ name: t.key, value: t.count }))} /> : <Empty>Keine Daten.</Empty>}</Card>
      </div>
      <Card title="Letzte Truhen" className="mt-4">
        {thirty.chests.length ? (
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Zeit (UTC)</th><th>Truhe</th><th>Stufe</th><th>Quelle</th><th className="num">Punkte</th></tr></thead>
            <tbody>{thirty.chests.slice(0, 25).map((c) => (
              <tr key={c.id}><td><Link href={`/truhen/${c.id}`} className="hover:underline">{fmtDateTime(c.capturedAt)}</Link></td><td>{c.chestType.name} {c.event && <Pill tone="violet">{c.event.name}</Pill>}</td><td>{c.tier}</td><td>{SOURCE_LABEL[c.source as Source]}</td><td className="num">{c.points}</td></tr>
            ))}</tbody>
          </table></div>
        ) : <Empty>Keine Truhen in den letzten 30 Tagen.</Empty>}
      </Card>
      {officer && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card title="Stammdaten bearbeiten">
            <ActionForm action={saveMemberAction.bind(null, m.id)} className="grid grid-cols-2 gap-3">
              <div><label className="label">Ingame-Name</label><input name="name" defaultValue={m.name} className="input" /></div>
              <div><label className="label">Rang (Ingame)</label><input name="clanRank" defaultValue={m.clanRank} className="input" /></div>
              <div className="col-span-2"><label className="label">Aliasse (Komma-getrennt, für Import/OCR)</label><input name="aliases" defaultValue={m.aliases} className="input" /></div>
              <div><label className="label">Beitritt</label><input name="joinedAt" type="date" defaultValue={m.joinedAt.toISOString().slice(0, 10)} className="input" /></div>
              <div><label className="label">Status</label><select name="status" defaultValue={m.status} className="input">{MEMBER_STATUS.map((x) => <option key={x} value={x}>{MEMBER_STATUS_LABEL[x]}</option>)}</select></div>
              <div className="col-span-2"><label className="label">Notiz (nur Offiziere)</label><textarea name="notes" defaultValue={m.notes} className="input" rows={2} /></div>
            </ActionForm>
          </Card>
          <Card title="Änderungen am Mitglied"><AuditList logs={logs} /></Card>
        </div>
      )}
    </>
  );
}
