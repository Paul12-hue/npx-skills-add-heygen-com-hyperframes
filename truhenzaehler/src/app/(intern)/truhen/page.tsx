import Link from "next/link";
import { prisma } from "@/lib/db";
import { PageHeader, Pill, Empty } from "@/components/ui";
import { PeriodFilter, parseFilter, one, type SP } from "@/components/PeriodFilter";
import { CHEST_STATUS, CHEST_STATUS_LABEL, ORIGIN_LABEL, SOURCE_LABEL, hasRole, type ChestStatus, type Origin, type Source } from "@/lib/domain";
import { fmtDateTime, fmtNum } from "@/lib/format";
import { currentUser } from "@/lib/auth";
import { setChestStatusAction } from "@/app/actions";

export const dynamic = "force-dynamic";
const PAGE = 50;
const SORTS = { zeit: "capturedAt", punkte: "points", stufe: "tier" } as const;

export default async function ChestListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { filter } = parseFilter(sp);
  const status = one(sp.status) as ChestStatus | "";
  const q = one(sp.q);
  const sortKey = (one(sp.sort) || "zeit") as keyof typeof SORTS;
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(one(sp.seite)) || 1);
  const user = await currentUser();
  const officer = hasRole(user?.role, "OFFIZIER");

  // Prüfliste zeigt alle offenen Fälle unabhängig vom Zeitraum
  const where = {
    ...(status !== "PRUEFEN" && { capturedAt: { gte: filter.start, lt: filter.end } }),
    ...(status ? { status } : {}),
    ...(filter.chestTypeId && { chestTypeId: filter.chestTypeId }),
    ...(filter.source && { source: filter.source }),
    ...(filter.eventOnly && { eventId: { not: null } }),
    ...(filter.excludeEvents && { eventId: null }),
    ...(q && { member: { name: { contains: q } } }),
  };
  const [types, total, chests, sum] = await Promise.all([
    prisma.chestType.findMany({ orderBy: { name: "asc" } }),
    prisma.chest.count({ where }),
    prisma.chest.findMany({
      where, include: { member: true, chestType: true, event: true },
      orderBy: { [SORTS[sortKey] ?? "capturedAt"]: dir }, skip: (page - 1) * PAGE, take: PAGE,
    }),
    prisma.chest.aggregate({ where: { ...where, status: "GUELTIG" }, _sum: { points: true } }),
  ]);
  const qs = (patch: Record<string, string>) => "?" + new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, one(v)])), ...patch }).toString();
  const sortLink = (k: keyof typeof SORTS, label: string) => (
    <Link href={qs({ sort: k, dir: sortKey === k && dir === "desc" ? "asc" : "desc", seite: "1" })} className="hover:underline">
      {label}{sortKey === k ? (dir === "desc" ? " ↓" : " ↑") : ""}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Truhenliste"
        subtitle={`${fmtNum(total)} Einträge · ${fmtNum(sum._sum.points ?? 0)} gültige Punkte`}
        actions={officer && <><Link className="btn-ghost" href={qs({ status: "PRUEFEN" })}>Prüfliste</Link><Link className="btn" href="/truhen/neu">+ Erfassen / Import</Link></>}
      />
      <PeriodFilter sp={sp} types={types} extra={
        <>
          <div><label className="label" htmlFor="q">Mitglied</label><input id="q" name="q" defaultValue={q} placeholder="Name …" className="input" /></div>
          <div><label className="label" htmlFor="status">Status</label>
            <select id="status" name="status" defaultValue={status} className="input"><option value="">Alle</option>{CHEST_STATUS.map((s) => <option key={s} value={s}>{CHEST_STATUS_LABEL[s]}</option>)}</select></div>
        </>
      } />
      <form action={setChestStatusAction} className="card">
        {officer && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">Markierte:</span>
            <button name="status" value="GUELTIG" className="btn-ghost">✓ Freigeben</button>
            <button name="status" value="VERWORFEN" className="btn-ghost">✕ Verwerfen</button>
            <input name="reason" placeholder="Grund (optional)" className="input max-w-xs" />
          </div>
        )}
        {chests.length ? (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr>
                {officer && <th></th>}
                <th>{sortLink("zeit", "Zeit (UTC)")}</th><th>Mitglied</th><th>Truhentyp</th><th>{sortLink("stufe", "Stufe")}</th><th>Quelle</th><th className="num">{sortLink("punkte", "Punkte")}</th><th>Erfassung</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {chests.map((c) => (
                  <tr key={c.id} className={c.status === "VERWORFEN" ? "opacity-50 line-through" : ""}>
                    {officer && <td><input type="checkbox" name="ids" value={c.id} aria-label="markieren" /></td>}
                    <td className="text-slate-500">{fmtDateTime(c.capturedAt)}</td>
                    <td><Link href={`/mitglieder/${c.memberId}`} className="font-medium hover:underline">{c.member.name}</Link></td>
                    <td>{c.chestType.name} {c.event && <Pill tone="violet">{c.event.name}</Pill>}</td>
                    <td>{c.tier}</td>
                    <td>{SOURCE_LABEL[c.source as Source] ?? c.source}</td>
                    <td className="num">{fmtNum(c.points)}</td>
                    <td className="text-xs text-slate-500">{ORIGIN_LABEL[c.origin as Origin] ?? c.origin}</td>
                    <td><Pill tone={c.status === "GUELTIG" ? "green" : c.status === "PRUEFEN" ? "gold" : "red"}>{CHEST_STATUS_LABEL[c.status as ChestStatus]}</Pill></td>
                    <td><Link href={`/truhen/${c.id}`} className="text-gold-600 hover:underline">{officer ? "Bearbeiten" : "Details"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty>Keine Truhen für diese Filter.</Empty>}
        {total > PAGE && (
          <div className="mt-3 flex justify-between text-sm">
            {page > 1 ? <Link className="btn-ghost" href={qs({ seite: String(page - 1) })}>← Zurück</Link> : <span />}
            <span className="self-center text-slate-500">Seite {page} / {Math.ceil(total / PAGE)}</span>
            {page * PAGE < total ? <Link className="btn-ghost" href={qs({ seite: String(page + 1) })}>Weiter →</Link> : <span />}
          </div>
        )}
      </form>
    </>
  );
}
