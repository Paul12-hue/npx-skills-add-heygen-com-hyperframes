import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { AuditList } from "@/components/AuditList";
import { Card, PageHeader, Pill } from "@/components/ui";
import { recalcPointsAction, updateChestAction } from "@/app/actions";
import { CHEST_STATUS, CHEST_STATUS_LABEL, ORIGIN_LABEL, SOURCES, SOURCE_LABEL, hasRole, type Origin } from "@/lib/domain";
import { chestPoints } from "@/lib/points";
import { fmtDateTime, toInputUTC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ChestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [c, user] = await Promise.all([
    prisma.chest.findUnique({ where: { id }, include: { member: true, chestType: true, event: true, createdBy: true } }),
    currentUser(),
  ]);
  if (!c) notFound();
  const officer = hasRole(user?.role, "OFFIZIER");
  const [members, types, events, logs] = await Promise.all([
    prisma.member.findMany({ orderBy: { name: "asc" } }),
    prisma.chestType.findMany({ orderBy: { name: "asc" } }),
    prisma.event.findMany({ orderBy: { startAt: "desc" } }),
    prisma.auditLog.findMany({ where: { entity: "Chest", entityId: id }, include: { user: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const rulePoints = chestPoints(c.chestType, c.tier);
  return (
    <>
      <PageHeader title={`${c.chestType.name} · Stufe ${c.tier}`} subtitle={`${c.member.name} · ${fmtDateTime(c.capturedAt)} UTC`} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Herkunft" className="text-sm">
          <dl className="grid grid-cols-2 gap-y-1.5">
            <dt className="text-slate-500">Erfassung</dt><dd>{ORIGIN_LABEL[c.origin as Origin]}</dd>
            <dt className="text-slate-500">Erfasst von</dt><dd>{c.createdBy?.username ?? "System"}</dd>
            <dt className="text-slate-500">Erfasst am</dt><dd>{fmtDateTime(c.createdAt)}</dd>
            <dt className="text-slate-500">Event</dt><dd>{c.event ? <Pill tone="violet">{c.event.name}</Pill> : "–"}</dd>
            <dt className="text-slate-500">Punkte</dt><dd>{c.points} {c.points !== rulePoints && <span className="text-amber-600">(Regel: {rulePoints})</span>}</dd>
            <dt className="text-slate-500">Fingerabdruck</dt><dd className="truncate font-mono text-xs">{c.fingerprint.slice(0, 16)}…</dd>
          </dl>
          {c.rawText && <pre className="mt-3 overflow-x-auto whitespace-pre-wrap rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">{c.rawText}</pre>}
          {officer && c.points !== rulePoints && (
            <form action={recalcPointsAction.bind(null, c.id)} className="mt-3"><button className="btn-ghost">Punkte nach aktueller Regel neu berechnen</button></form>
          )}
        </Card>
        {officer ? (
          <Card title="Korrigieren" className="lg:col-span-2">
            <ActionForm action={updateChestAction.bind(null, c.id)} className="grid grid-cols-2 gap-3 sm:grid-cols-3" submitLabel="Korrektur speichern">
              <div><label className="label">Mitglied</label><select name="memberId" defaultValue={c.memberId} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
              <div><label className="label">Truhentyp</label><select name="chestTypeId" defaultValue={c.chestTypeId} className="input">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
              <div><label className="label">Stufe</label><input name="tier" type="number" min={1} defaultValue={c.tier} className="input" /></div>
              <div><label className="label">Quelle</label><select name="source" defaultValue={c.source} className="input">{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></div>
              <div><label className="label">Zeitpunkt (UTC)</label><input name="capturedAt" type="datetime-local" defaultValue={toInputUTC(c.capturedAt)} className="input" /></div>
              <div><label className="label">Punkte</label><input name="points" type="number" min={0} defaultValue={c.points} className="input" /></div>
              <div><label className="label">Event</label><select name="eventId" defaultValue={c.eventId ?? ""} className="input"><option value="">keins</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              <div><label className="label">Status</label><select name="status" defaultValue={c.status} className="input">{CHEST_STATUS.map((s) => <option key={s} value={s}>{CHEST_STATUS_LABEL[s]}</option>)}</select></div>
              <div className="col-span-2 sm:col-span-3"><label className="label">Grund der Korrektur (Pflicht, wird protokolliert)</label><input name="reason" required minLength={3} className="input" placeholder="z. B. OCR hat Namen falsch gelesen" /></div>
            </ActionForm>
          </Card>
        ) : <Card className="lg:col-span-2"><p className="text-sm text-slate-500">Fehler entdeckt? Wende dich an einen Offizier – jede Korrektur wird mit Grund protokolliert.</p></Card>}
      </div>
      <Card title="Änderungsprotokoll dieser Truhe" className="mt-4"><AuditList logs={logs} /></Card>
    </>
  );
}
