import { DashboardView } from "@/components/DashboardView";
import { PeriodFilter, parseFilter, type SP } from "@/components/PeriodFilter";
import { PageHeader } from "@/components/ui";
import { prisma } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { weekLabel } from "@/lib/period";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { hasRole } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { filter } = parseFilter(sp);
  const [types, user, pending] = await Promise.all([
    prisma.chestType.findMany({ orderBy: { name: "asc" } }),
    currentUser(),
    prisma.chest.count({ where: { status: "PRUEFEN" } }),
  ]);
  const officer = hasRole(user?.role, "OFFIZIER");
  return (
    <>
      <PageHeader
        title="Clan-Dashboard"
        subtitle={`${weekLabel(filter.start)} · ${fmtDate(filter.start)} – ${fmtDate(new Date(filter.end.getTime() - 1))} (UTC)`}
        actions={officer && (
          <>
            {pending > 0 && <Link href="/truhen?status=PRUEFEN" className="btn-ghost">⚠ {pending} zu prüfen</Link>}
            <Link href="/truhen/neu" className="btn">+ Truhe erfassen</Link>
          </>
        )}
      />
      {sp.fehler === "keine-berechtigung" && <p className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-800">Für diese Seite fehlt dir die Berechtigung.</p>}
      <PeriodFilter sp={sp} types={types} />
      <DashboardView filter={filter} />
    </>
  );
}
