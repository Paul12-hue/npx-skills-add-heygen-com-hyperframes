import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { weeklySummary } from "@/lib/report";
import { Card, PageHeader } from "@/components/ui";
import { weekRange, DAY_MS } from "@/lib/period";
import { one, type SP } from "@/components/PeriodFilter";

export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireRole("OFFIZIER");
  const sp = await searchParams;
  const s = await getSettings();
  const ref = one(sp.woche) ? new Date(one(sp.woche) + "T12:00:00Z") : new Date(weekRange().start.getTime() - DAY_MS);
  const { start } = weekRange(ref);
  const day = start.toISOString().slice(0, 10);
  const summary = await weeklySummary(ref, s.defaultMemberGoalPoints, s.clanName);
  const q = `von=${day}&bis=${new Date(start.getTime() + 6 * DAY_MS).toISOString().slice(0, 10)}`;
  return (
    <>
      <PageHeader title="Berichte & Export" subtitle="Wochenzusammenfassung für die Clan-Leitung" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Woche wählen">
          <form className="flex gap-2"><input type="date" name="woche" defaultValue={day} className="input" /><button className="btn-ghost">Anzeigen</button></form>
          <h3 className="mb-2 mt-4 text-xs font-semibold uppercase text-slate-500">Export dieser Woche</h3>
          <div className="flex flex-wrap gap-2">
            <a className="btn" href={`/api/export?format=csv&${q}`}>CSV</a>
            <a className="btn" href={`/api/export?format=xlsx&${q}`}>Excel</a>
            <a className="btn" href={`/api/export?format=pdf&${q}`}>PDF-Bericht</a>
          </div>
          <p className="mt-3 text-xs text-slate-500">Excel enthält Blätter „Mitglieder“, „Truhen“ und „Typen“. Das PDF enthält die Wochenzusammenfassung. Es werden nur gültige Truhen exportiert.</p>
        </Card>
        <Card title="Wochenzusammenfassung (zum Kopieren, z. B. für Discord)" className="lg:col-span-2">
          <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-sm dark:bg-slate-800">{summary.text}</pre>
        </Card>
      </div>
    </>
  );
}
