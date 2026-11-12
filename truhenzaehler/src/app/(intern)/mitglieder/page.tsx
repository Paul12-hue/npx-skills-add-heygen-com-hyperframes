import Link from "next/link";
import { getSettings } from "@/lib/db";
import { memberWeekProgress } from "@/lib/stats";
import { Card, PageHeader, Pill, Progress, StatusBadge } from "@/components/ui";
import { MEMBER_STATUS_LABEL, METRIC_LABEL, type MemberStatus } from "@/lib/domain";
import { fmtDate, fmtNum, fmtPct } from "@/lib/format";
import { one, type SP } from "@/components/PeriodFilter";

export const dynamic = "force-dynamic";

export default async function MembersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sort = one(sp.sort) || "punkte";
  const s = await getSettings();
  const rows = await memberWeekProgress(s.defaultMemberGoalPoints);
  rows.sort((a, b) =>
    sort === "name" ? a.member.name.localeCompare(b.member.name, "de")
    : sort === "fortschritt" ? a.progress.percent - b.progress.percent
    : b.points - a.points);
  const L = (k: string, l: string) => <Link href={`?sort=${k}`} className={sort === k ? "font-bold text-gold-600" : "hover:underline"}>{l}</Link>;
  return (
    <>
      <PageHeader title="Mitglieder" subtitle={`${rows.length} Mitglieder · Wochenstand`} actions={<div className="flex gap-3 text-sm">Sortieren: {L("punkte", "Punkte")} {L("fortschritt", "Fortschritt")} {L("name", "Name")}</div>} />
      <Card>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Mitglied</th><th>Status</th><th className="num">Truhen</th><th className="num">Punkte</th><th className="min-w-40">Wochenziel</th><th>Prognose</th><th>Beigetreten</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.member.id}>
                  <td><Link href={`/mitglieder/${r.member.id}`} className="font-medium hover:underline">{r.member.name}</Link></td>
                  <td><Pill tone={r.member.status === "AKTIV" ? "green" : "slate"}>{MEMBER_STATUS_LABEL[r.member.status as MemberStatus]}</Pill></td>
                  <td className="num">{fmtNum(r.chests)}</td>
                  <td className="num font-semibold">{fmtNum(r.points)}</td>
                  <td>
                    <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{fmtNum(r.progress.current)} / {fmtNum(r.progress.target)} {METRIC_LABEL[r.metric]}{r.individual ? " (indiv.)" : ""}</span><span>{fmtPct(r.progress.percent)}</span></div>
                    <Progress percent={r.progress.percent} projectedPercent={r.progress.projectedPercent} status={r.progress.status} />
                  </td>
                  <td><StatusBadge status={r.progress.status} /></td>
                  <td className="text-slate-500">{fmtDate(r.member.joinedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
