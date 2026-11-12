import Link from "next/link";
import { headers } from "next/headers";
import { prisma, getSettings } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { Card, PageHeader, Pill } from "@/components/ui";
import { ActionForm } from "@/components/ActionForm";
import { AuditList } from "@/components/AuditList";
import { rotatePublicTokenAction, saveChestTypeAction, saveEventAction, saveMemberAction, saveSettingsAction, saveUserAction } from "@/app/actions";
import { CATEGORY_LABEL, CHEST_CATEGORIES, MEMBER_STATUS, MEMBER_STATUS_LABEL, ROLES, ROLE_LABEL, hasRole, type MemberStatus, type Role } from "@/lib/domain";
import { fmtDate, fmtDateTime, toInputUTC } from "@/lib/format";
import { one, type SP } from "@/components/PeriodFilter";

export const dynamic = "force-dynamic";

const TABS = [
  { k: "mitglieder", l: "Mitglieder", admin: false },
  { k: "events", l: "Events", admin: false },
  { k: "protokoll", l: "Änderungsprotokoll", admin: false },
  { k: "benutzer", l: "Benutzer & Rollen", admin: true },
  { k: "truhentypen", l: "Truhentypen & Punkte", admin: true },
  { k: "einstellungen", l: "Einstellungen & Clan-Link", admin: true },
];

export default async function AdminPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole("OFFIZIER");
  const isAdmin = hasRole(user.role, "ADMIN");
  const sp = await searchParams;
  const tabs = TABS.filter((t) => !t.admin || isAdmin);
  const tab = tabs.find((t) => t.k === one(sp.tab))?.k ?? "mitglieder";

  return (
    <>
      <PageHeader title="Verwaltung" subtitle={`Angemeldet als ${user.username} (${ROLE_LABEL[user.role as Role]})`} />
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <Link key={t.k} href={`?tab=${t.k}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.k ? "border-gold-500 font-semibold" : "border-transparent text-slate-500"}`}>{t.l}</Link>
        ))}
      </nav>
      {tab === "mitglieder" && <MembersTab />}
      {tab === "events" && <EventsTab />}
      {tab === "protokoll" && <AuditTab q={one(sp.aktion)} />}
      {tab === "benutzer" && isAdmin && <UsersTab />}
      {tab === "truhentypen" && isAdmin && <TypesTab />}
      {tab === "einstellungen" && isAdmin && <SettingsTab />}
    </>
  );
}

async function MembersTab() {
  const members = await prisma.member.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { chests: true } } } });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Neues Mitglied">
        <ActionForm action={saveMemberAction.bind(null, null)} className="space-y-3" resetOnSuccess>
          <div><label className="label">Ingame-Name (exakt)</label><input name="name" required className="input" /></div>
          <div><label className="label">Aliasse (optional)</label><input name="aliases" className="input" /></div>
          <div><label className="label">Rang</label><input name="clanRank" defaultValue="Mitglied" className="input" /></div>
          <div><label className="label">Beitritt</label><input name="joinedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className="input" /></div>
          <div><label className="label">Status</label><select name="status" className="input">{MEMBER_STATUS.map((s) => <option key={s} value={s}>{MEMBER_STATUS_LABEL[s]}</option>)}</select></div>
          <input type="hidden" name="notes" value="" />
        </ActionForm>
      </Card>
      <Card title={`Alle Mitglieder (${members.length})`} className="lg:col-span-2">
        <div className="overflow-x-auto"><table className="table">
          <thead><tr><th>Name</th><th>Aliasse</th><th>Status</th><th>Beitritt</th><th className="num">Truhen gesamt</th></tr></thead>
          <tbody>{members.map((m) => (
            <tr key={m.id}><td><Link href={`/mitglieder/${m.id}`} className="font-medium hover:underline">{m.name}</Link></td><td className="text-xs text-slate-500">{m.aliases || "–"}</td><td><Pill tone={m.status === "AKTIV" ? "green" : "slate"}>{MEMBER_STATUS_LABEL[m.status as MemberStatus]}</Pill></td><td>{fmtDate(m.joinedAt)}</td><td className="num">{m._count.chests}</td></tr>
          ))}</tbody>
        </table></div>
        <p className="mt-2 text-xs text-slate-500">Ausgetretene Mitglieder werden nicht gelöscht, damit vergangene Auswertungen korrekt bleiben.</p>
      </Card>
    </div>
  );
}

async function EventsTab() {
  const events = await prisma.event.findMany({ orderBy: { startAt: "desc" }, include: { _count: { select: { chests: true } } } });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card title="Neues Event">
        <ActionForm action={saveEventAction} className="space-y-3" resetOnSuccess>
          <div><label className="label">Name</label><input name="name" required className="input" /></div>
          <div><label className="label">Start (UTC)</label><input name="startAt" type="datetime-local" required className="input" defaultValue={toInputUTC(new Date())} /></div>
          <div><label className="label">Ende (UTC)</label><input name="endAt" type="datetime-local" required className="input" /></div>
          <div><label className="label">Event-Ziel Punkte (optional)</label><input name="goalPoints" type="number" min={0} className="input" /></div>
          <div><label className="label">Beschreibung</label><input name="description" className="input" /></div>
        </ActionForm>
        <p className="mt-2 text-xs text-slate-500">Truhen mit Quelle „Event“ oder Event-Truhentyp im Zeitraum werden automatisch zugeordnet.</p>
      </Card>
      <Card title="Events" className="lg:col-span-2">
        <table className="table"><thead><tr><th>Name</th><th>Zeitraum</th><th className="num">Ziel</th><th className="num">Truhen</th></tr></thead>
          <tbody>{events.map((e) => <tr key={e.id}><td className="font-medium">{e.name}</td><td>{fmtDateTime(e.startAt)} – {fmtDateTime(e.endAt)}</td><td className="num">{e.goalPoints ?? "–"}</td><td className="num">{e._count.chests}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

async function AuditTab({ q }: { q: string }) {
  const logs = await prisma.auditLog.findMany({ where: q ? { action: q } : {}, include: { user: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const actions = await prisma.auditLog.findMany({ distinct: ["action"], select: { action: true } });
  return (
    <Card title="Änderungsprotokoll (neueste 200)" action={
      <form className="flex gap-2"><input type="hidden" name="tab" value="protokoll" />
        <select name="aktion" defaultValue={q} className="input"><option value="">Alle Aktionen</option>{actions.map((a) => <option key={a.action}>{a.action}</option>)}</select><button className="btn-ghost">Filtern</button></form>
    }>
      <AuditList logs={logs} />
    </Card>
  );
}

async function UsersTab() {
  const [users, members] = await Promise.all([
    prisma.user.findMany({ orderBy: { username: "asc" }, include: { member: true } }),
    prisma.member.findMany({ orderBy: { name: "asc" } }),
  ]);
  const UserForm = ({ u }: { u?: (typeof users)[number] }) => (
    <ActionForm action={saveUserAction} className="grid grid-cols-2 gap-2 sm:grid-cols-6" submitLabel={u ? "Speichern" : "Anlegen"}>
      <input type="hidden" name="id" value={u?.id ?? ""} />
      <div><label className="label">Benutzername</label><input name="username" defaultValue={u?.username} required className="input" /></div>
      <div><label className="label">Rolle</label><select name="role" defaultValue={u?.role ?? "MITGLIED"} className="input">{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select></div>
      <div><label className="label">Verknüpftes Mitglied</label><select name="memberId" defaultValue={u?.memberId ?? ""} className="input"><option value="">–</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></div>
      <div><label className="label">{u ? "Neues Passwort" : "Passwort"} (≥ 10)</label><input name="password" type="password" autoComplete="new-password" className="input" /></div>
      <div className="flex items-end gap-2 pb-2 text-sm"><input id={`a-${u?.id ?? "neu"}`} name="active" type="checkbox" defaultChecked={u?.active ?? true} /><label htmlFor={`a-${u?.id ?? "neu"}`}>aktiv</label></div>
      <div className="flex items-end pb-2 text-xs text-slate-500">{u?.lastLoginAt ? `Login ${fmtDateTime(u.lastLoginAt)}` : u ? "nie angemeldet" : ""}</div>
    </ActionForm>
  );
  return (
    <div className="space-y-4">
      <Card title="Rollen">
        <ul className="grid gap-2 text-sm sm:grid-cols-3">
          <li><strong>Admin / Clan-Leitung:</strong> alles, inkl. Benutzer, Rollen, Punkteregeln, Clan-Link.</li>
          <li><strong>Offizier:</strong> Truhen erfassen, importieren, korrigieren, prüfen; Mitglieder, Ziele, Events, Berichte.</li>
          <li><strong>Mitglied:</strong> Dashboard, Truhenliste, Profile und Ziele nur lesen.</li>
        </ul>
      </Card>
      <Card title="Neuer Benutzer"><UserForm /></Card>
      <Card title={`Benutzer (${users.length})`}><div className="divide-y divide-slate-100 dark:divide-slate-800">{users.map((u) => <div key={u.id} className="py-3"><UserForm u={u} /></div>)}</div></Card>
    </div>
  );
}

async function TypesTab() {
  const types = await prisma.chestType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { chests: true } } } });
  const TypeForm = ({ t }: { t?: (typeof types)[number] }) => (
    <ActionForm action={saveChestTypeAction} className="grid grid-cols-2 gap-2 sm:grid-cols-6" submitLabel={t ? "Speichern" : "Anlegen"}>
      <input type="hidden" name="id" value={t?.id ?? ""} />
      <div className="col-span-2"><label className="label">Name</label><input name="name" defaultValue={t?.name} required className="input" /></div>
      <div><label className="label">Kategorie</label><select name="category" defaultValue={t?.category ?? "STANDARD"} className="input">{CHEST_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}</select></div>
      <div><label className="label">Basispunkte</label><input name="basePoints" type="number" min={0} defaultValue={t?.basePoints ?? 1} className="input" /></div>
      <div><label className="label">+ je Stufe</label><input name="pointsPerTier" type="number" min={0} defaultValue={t?.pointsPerTier ?? 0} className="input" /></div>
      <div className="flex items-end gap-2 pb-2 text-sm"><input id={`t-${t?.id ?? "neu"}`} name="active" type="checkbox" defaultChecked={t?.active ?? true} /><label htmlFor={`t-${t?.id ?? "neu"}`}>aktiv {t && <span className="text-slate-500">· {t._count.chests} Truhen</span>}</label></div>
    </ActionForm>
  );
  return (
    <div className="space-y-4">
      <Card title="Punkteregel"><p className="text-sm text-slate-600 dark:text-slate-400">Punkte = Basispunkte + (Stufe − 1) × Aufschlag je Stufe. Punkte werden beim Erfassen eingefroren – eine Regeländerung verändert keine alten Truhen (in der Truhendetailansicht einzeln neu berechenbar, protokolliert).</p></Card>
      <Card title="Neuer Truhentyp"><TypeForm /></Card>
      <Card title="Truhentypen"><div className="divide-y divide-slate-100 dark:divide-slate-800">{types.map((t) => <div key={t.id} className="py-3"><TypeForm t={t} /></div>)}</div></Card>
    </div>
  );
}

async function SettingsTab() {
  const s = await getSettings();
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const link = `${base}/clan/${s.publicToken}`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Clan & Ziele">
        <ActionForm action={saveSettingsAction} className="space-y-3">
          <div><label className="label">Clan-Name</label><input name="clanName" defaultValue={s.clanName} className="input" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Standard-Wochenziel je Mitglied (Punkte)</label><input name="defaultMemberGoalPoints" type="number" min={0} defaultValue={s.defaultMemberGoalPoints} className="input" /></div>
            <div><label className="label">Inaktiv nach … Tagen</label><input name="inactiveAfterDays" type="number" min={1} defaultValue={s.inactiveAfterDays} className="input" /></div>
          </div>
          <div><label className="label">Webhook für Offiziers-Hinweise (Discord/Slack, optional)</label><input name="webhookUrl" type="url" defaultValue={s.webhookUrl} placeholder="https://discord.com/api/webhooks/…" className="input" /></div>
          <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <legend className="px-1 text-xs font-semibold uppercase text-slate-500">Clan-Link (nur lesen)</legend>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="publicEnabled" defaultChecked={s.publicEnabled} /> Clan-Link aktivieren</label>
            <div><label className="label">Passwort für Link {s.publicPasswordHash ? "(gesetzt – leer lassen = behalten)" : "(leer = ohne Passwort, öffentlich)"}</label><input name="publicPassword" type="password" autoComplete="new-password" className="input" /></div>
            {s.publicPasswordHash && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removePassword" /> Passwort entfernen</label>}
          </fieldset>
        </ActionForm>
      </Card>
      <Card title="Clan-Link teilen">
        <p className="break-all rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-800">{link}</p>
        <p className="mt-2 text-sm">Status: {s.publicEnabled ? <Pill tone="green">aktiv{s.publicPasswordHash ? ", passwortgeschützt" : ", öffentlich"}</Pill> : <Pill tone="slate">deaktiviert</Pill>}</p>
        <p className="mt-2 text-xs text-slate-500">Der Link zeigt nur das Dashboard (Ingame-Namen und Truhendaten), keine Notizen, Benutzer oder Protokolle. Suchmaschinen werden ausgeschlossen.</p>
        <form action={rotatePublicTokenAction} className="mt-3"><button className="btn-ghost">Link erneuern (alter Link wird ungültig)</button></form>
      </Card>
    </div>
  );
}
