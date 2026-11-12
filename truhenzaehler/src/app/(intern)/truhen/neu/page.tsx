import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { Card, PageHeader } from "@/components/ui";
import { createChestAction, importCsvAction } from "@/app/actions";
import { SOURCES, SOURCE_LABEL } from "@/lib/domain";
import { toInputUTC } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewChestPage() {
  await requireRole("OFFIZIER");
  const [members, types, events] = await Promise.all([
    prisma.member.findMany({ where: { status: { not: "AUSGETRETEN" } }, orderBy: { name: "asc" } }),
    prisma.chestType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.event.findMany({ where: { endAt: { gt: new Date(Date.now() - 14 * 86_400_000) } }, orderBy: { startAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Truhen erfassen" subtitle="Manuell eintragen oder Liste importieren. Duplikate werden automatisch erkannt." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Einzelne Truhe">
          <ActionForm action={createChestAction} className="grid grid-cols-2 gap-3" submitLabel="Truhe speichern">
            <div className="col-span-2"><label className="label" htmlFor="memberId">Mitglied (hat die Truhe erzeugt)</label>
              <select id="memberId" name="memberId" required className="input"><option value="">– wählen –</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
            <div><label className="label" htmlFor="chestTypeId">Truhentyp</label>
              <select id="chestTypeId" name="chestTypeId" required className="input"><option value="">– wählen –</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
            <div><label className="label" htmlFor="tier">Stufe</label><input id="tier" name="tier" type="number" min={1} max={60} defaultValue={1} className="input" /></div>
            <div><label className="label" htmlFor="source">Quelle</label>
              <select id="source" name="source" className="input">{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></div>
            <div><label className="label" htmlFor="capturedAt">Zeitpunkt (UTC)</label><input id="capturedAt" name="capturedAt" type="datetime-local" defaultValue={toInputUTC(new Date())} required className="input" /></div>
            <div><label className="label" htmlFor="eventId">Event (optional)</label>
              <select id="eventId" name="eventId" className="input"><option value="">automatisch / keins</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
            <div><label className="label" htmlFor="points">Punkte (leer = Punkteregel)</label><input id="points" name="points" type="number" min={0} className="input" /></div>
          </ActionForm>
        </Card>
        <Card title="CSV-Import (Export / OCR-Ergebnis)">
          <ActionForm action={importCsvAction} submitLabel="Importieren">
            <input name="file" type="file" accept=".csv,text/csv" required className="input" />
          </ActionForm>
          <div className="mt-4 space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>Erwartete Spalten (Komma oder Semikolon, Groß-/Kleinschreibung egal):</p>
            <pre className="overflow-x-auto rounded bg-slate-100 p-2 text-xs dark:bg-slate-800">zeitpunkt;mitglied;truhentyp;stufe;quelle;punkte{"\n"}2026-11-12T18:04:00Z;Drachenherz;Gewöhnliche Krypta;10;KRYPTA;</pre>
            <p>„punkte“ ist optional. Mitglieder werden über Namen <em>und</em> Aliasse (z. B. OCR-Varianten) erkannt. Unbekannte Namen werden als Fehler gemeldet, nicht still verworfen.</p>
            <p>Mehrfaches Importieren derselben Liste ist unbedenklich: bereits erfasste Truhen werden übersprungen.</p>
          </div>
        </Card>
      </div>
    </>
  );
}
