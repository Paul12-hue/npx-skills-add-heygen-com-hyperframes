"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma, getSettings } from "@/lib/db";
import { audit } from "@/lib/audit";
import { checkPassword, endSession, hashPassword, requireRole, startSession } from "@/lib/auth";
import { ingestChests } from "@/lib/ingest";
import { parseCsv } from "@/lib/csv";
import { chestPoints } from "@/lib/points";
import { CHEST_STATUS, GOAL_METRICS, MEMBER_STATUS, ROLES, SOURCES, CHEST_CATEGORIES } from "@/lib/domain";
import { fromInputUTC } from "@/lib/format";
import { weekRange } from "@/lib/period";
import { signSession } from "@/lib/session";

export type ActionState = { ok?: string; error?: string; details?: string[] } | null;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

// ---------- Anmeldung (mit einfacher Brute-Force-Bremse) ----------
const attempts = new Map<string, { n: number; until: number }>();

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const username = str(fd, "username").toLowerCase();
  const a = attempts.get(username);
  if (a && a.until > Date.now()) return { error: "Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen." };
  const user = await prisma.user.findUnique({ where: { username } });
  const ok = user && user.active && (await checkPassword(str(fd, "password"), user.passwordHash));
  if (!ok) {
    const n = (a?.n ?? 0) + 1;
    attempts.set(username, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return { error: "Benutzername oder Passwort falsch." };
  }
  attempts.delete(username);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession(user);
  redirect("/");
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

// ---------- Truhen ----------
export async function createChestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const member = await prisma.member.findUnique({ where: { id: str(fd, "memberId") } });
  const type = await prisma.chestType.findUnique({ where: { id: str(fd, "chestTypeId") } });
  if (!member || !type) return { error: "Bitte Mitglied und Truhentyp wählen." };
  const res = await ingestChests(
    [{
      member: member.name, chestType: type.name, tier: str(fd, "tier"), source: str(fd, "source"),
      capturedAt: fromInputUTC(str(fd, "capturedAt")), eventId: str(fd, "eventId") || null,
      points: str(fd, "points") || null, raw: "manuelle Eingabe",
    }],
    "MANUELL", user.id,
  );
  revalidatePath("/");
  if (res.errors.length) return { error: res.errors.map((e) => e.message).join(", ") };
  return res.flaggedForReview
    ? { ok: "Gespeichert – aber als „Prüfen“ markiert, weil eine gleichartige Truhe zur selben Zeit existiert. Ein Offizier muss sie freigeben." }
    : { ok: `Truhe für ${member.name} gespeichert.` };
}

export async function importCsvAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine CSV-Datei wählen." };
  if (file.size > 5_000_000) return { error: "Datei ist größer als 5 MB." };
  const rows = parseCsv(await file.text());
  const pick = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v) ?? "";
  const res = await ingestChests(
    rows.map((r) => ({
      member: pick(r, "mitglied", "member", "spieler", "von", "from"),
      chestType: pick(r, "truhentyp", "typ", "truhe", "chest", "type"),
      tier: pick(r, "stufe", "tier", "level"),
      source: pick(r, "quelle", "source"),
      capturedAt: pick(r, "zeitpunkt", "zeit", "timestamp", "time", "datum"),
      points: pick(r, "punkte", "points") || null,
      raw: JSON.stringify(r),
    })),
    "CSV", user.id,
  );
  revalidatePath("/");
  return {
    ok: `${res.created} neu, ${res.skippedDuplicates} Duplikate übersprungen, ${res.flaggedForReview} zur Prüfung markiert.`,
    details: res.errors.slice(0, 50).map((e) => `Zeile ${e.row + 1}: ${e.message}`),
  };
}

const chestEdit = z.object({
  memberId: z.string().min(1),
  chestTypeId: z.string().min(1),
  tier: z.coerce.number().int().min(1).max(60),
  source: z.enum(SOURCES),
  capturedAt: z.string().min(10),
  points: z.coerce.number().int().min(0).max(1_000_000),
  eventId: z.string(),
  status: z.enum(CHEST_STATUS),
  reason: z.string().min(3, "Bitte einen Grund für die Korrektur angeben."),
});

/** Korrektur durch Offizier – alte & neue Werte landen im Änderungsprotokoll. */
export async function updateChestAction(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const p = chestEdit.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join(", ") };
  const before = await prisma.chest.findUnique({ where: { id } });
  if (!before) return { error: "Truhe nicht gefunden." };
  const data = { ...p.data, capturedAt: fromInputUTC(p.data.capturedAt), eventId: p.data.eventId || null };
  const { reason, ...fields } = data;
  await prisma.$transaction(async (tx) => {
    await tx.chest.update({ where: { id }, data: fields });
    await audit(tx, {
      userId: user.id, action: "TRUHE_KORRIGIERT", entity: "Chest", entityId: id, reason,
      oldValues: { memberId: before.memberId, chestTypeId: before.chestTypeId, tier: before.tier, source: before.source, capturedAt: before.capturedAt, points: before.points, eventId: before.eventId, status: before.status },
      newValues: fields,
    });
  });
  revalidatePath("/");
  return { ok: "Korrektur gespeichert und protokolliert." };
}

export async function recalcPointsAction(id: string) {
  const user = await requireRole("OFFIZIER");
  const c = await prisma.chest.findUnique({ where: { id }, include: { chestType: true } });
  if (!c) return;
  const points = chestPoints(c.chestType, c.tier);
  await prisma.$transaction(async (tx) => {
    await tx.chest.update({ where: { id }, data: { points } });
    await audit(tx, { userId: user.id, action: "PUNKTE_NEU_BERECHNET", entity: "Chest", entityId: id, oldValues: { points: c.points }, newValues: { points } });
  });
  revalidatePath(`/truhen/${id}`);
}

/** Schnellaktion in der Prüfliste: freigeben oder verwerfen. */
export async function setChestStatusAction(fd: FormData) {
  const user = await requireRole("OFFIZIER");
  const ids = fd.getAll("ids").map(String);
  const status = z.enum(CHEST_STATUS).parse(str(fd, "status"));
  const reason = str(fd, "reason") || (status === "VERWORFEN" ? "Duplikat" : "Geprüft");
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      const b = await tx.chest.findUnique({ where: { id }, select: { status: true } });
      if (!b || b.status === status) continue;
      await tx.chest.update({ where: { id }, data: { status } });
      await audit(tx, { userId: user.id, action: status === "VERWORFEN" ? "TRUHE_VERWORFEN" : "TRUHE_FREIGEGEBEN", entity: "Chest", entityId: id, oldValues: { status: b.status }, newValues: { status }, reason });
    }
  });
  revalidatePath("/truhen");
  revalidatePath("/");
}

// ---------- Mitglieder ----------
const memberSchema = z.object({
  name: z.string().min(2).max(40),
  aliases: z.string().max(400).default(""),
  clanRank: z.string().max(40).default("Mitglied"),
  joinedAt: z.string().min(10),
  status: z.enum(MEMBER_STATUS),
  notes: z.string().max(1000).default(""),
});

export async function saveMemberAction(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const p = memberSchema.safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Bitte Eingaben prüfen (Name mind. 2 Zeichen)." };
  const data = { ...p.data, joinedAt: new Date(p.data.joinedAt) };
  try {
    if (id) {
      const before = await prisma.member.findUniqueOrThrow({ where: { id } });
      await prisma.$transaction(async (tx) => {
        await tx.member.update({ where: { id }, data });
        await audit(tx, { userId: user.id, action: "MITGLIED_GEAENDERT", entity: "Member", entityId: id, oldValues: { name: before.name, aliases: before.aliases, clanRank: before.clanRank, joinedAt: before.joinedAt, status: before.status, notes: before.notes }, newValues: data });
      });
    } else {
      const m = await prisma.member.create({ data });
      await audit(prisma, { userId: user.id, action: "MITGLIED_ANGELEGT", entity: "Member", entityId: m.id, newValues: data });
    }
  } catch {
    return { error: "Name existiert bereits." };
  }
  revalidatePath("/mitglieder");
  return { ok: "Mitglied gespeichert." };
}

// ---------- Ziele ----------
export async function saveGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const p = z.object({
    scope: z.enum(["CLAN", "MITGLIED"]),
    memberId: z.string(),
    week: z.string().min(10),
    metric: z.enum(GOAL_METRICS),
    targetValue: z.coerce.number().int().min(1),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Bitte Eingaben prüfen." };
  if (p.data.scope === "MITGLIED" && !p.data.memberId) return { error: "Bitte ein Mitglied wählen." };
  const { start, end } = weekRange(new Date(p.data.week + "T12:00:00Z"));
  const memberId = p.data.scope === "MITGLIED" ? p.data.memberId : null;
  // Pro Woche und Mitglied/Clan genau ein Ziel – vorhandenes wird ersetzt
  const prev = await prisma.goal.findFirst({ where: { scope: p.data.scope, memberId, periodStart: start } });
  const data = { scope: p.data.scope, memberId, periodStart: start, periodEnd: end, metric: p.data.metric, targetValue: p.data.targetValue };
  const g = prev ? await prisma.goal.update({ where: { id: prev.id }, data }) : await prisma.goal.create({ data });
  await audit(prisma, { userId: user.id, action: prev ? "ZIEL_GEAENDERT" : "ZIEL_ANGELEGT", entity: "Goal", entityId: g.id, oldValues: prev ? { targetValue: prev.targetValue, metric: prev.metric } : null, newValues: { targetValue: g.targetValue, metric: g.metric } });
  revalidatePath("/ziele");
  return { ok: "Ziel gespeichert." };
}

export async function deleteGoalAction(fd: FormData) {
  const user = await requireRole("OFFIZIER");
  const id = str(fd, "id");
  const g = await prisma.goal.delete({ where: { id } });
  await audit(prisma, { userId: user.id, action: "ZIEL_GELOESCHT", entity: "Goal", entityId: id, oldValues: { targetValue: g.targetValue, scope: g.scope, memberId: g.memberId } });
  revalidatePath("/ziele");
}

// ---------- Admin ----------
export async function saveUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("ADMIN");
  const p = z.object({
    id: z.string(),
    username: z.string().min(3).max(32).regex(/^[a-z0-9_.-]+$/i, "Benutzername: nur Buchstaben, Zahlen, _ . -"),
    role: z.enum(ROLES),
    memberId: z.string(),
    password: z.string(),
    active: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues.map((i) => i.message).join(", ") };
  const { id, password, ...d } = p.data;
  if (password && password.length < 10) return { error: "Passwort muss mindestens 10 Zeichen haben." };
  if (!id && !password) return { error: "Für neue Benutzer ist ein Passwort nötig." };
  if (id === admin.id && d.role !== "ADMIN") return { error: "Du kannst dir selbst die Admin-Rolle nicht entziehen." };
  const data = {
    username: d.username.toLowerCase(), role: d.role, memberId: d.memberId || null, active: id === admin.id ? true : d.active === "on",
    ...(password && { passwordHash: await hashPassword(password) }),
  };
  try {
    if (id) {
      const b = await prisma.user.findUniqueOrThrow({ where: { id } });
      await prisma.user.update({ where: { id }, data });
      await audit(prisma, { userId: admin.id, action: "BENUTZER_GEAENDERT", entity: "User", entityId: id, oldValues: { username: b.username, role: b.role, memberId: b.memberId, active: b.active }, newValues: { username: data.username, role: data.role, memberId: data.memberId, active: data.active, passwort: password ? "geändert" : undefined } });
    } else {
      const u = await prisma.user.create({ data: { ...data, passwordHash: data.passwordHash! } });
      await audit(prisma, { userId: admin.id, action: "BENUTZER_ANGELEGT", entity: "User", entityId: u.id, newValues: { username: u.username, role: u.role } });
    }
  } catch {
    return { error: "Benutzername oder Mitglied ist bereits vergeben." };
  }
  revalidatePath("/admin");
  return { ok: "Benutzer gespeichert." };
}

export async function saveChestTypeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const p = z.object({
    id: z.string(), name: z.string().min(2).max(60), category: z.enum(CHEST_CATEGORIES),
    basePoints: z.coerce.number().int().min(0), pointsPerTier: z.coerce.number().int().min(0), active: z.string().optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Bitte Eingaben prüfen." };
  const { id, active, ...d } = p.data;
  const data = { ...d, active: active === "on" };
  try {
    if (id) {
      const b = await prisma.chestType.findUniqueOrThrow({ where: { id } });
      await prisma.chestType.update({ where: { id }, data });
      await audit(prisma, { userId: user.id, action: "TRUHENTYP_GEAENDERT", entity: "ChestType", entityId: id, oldValues: { ...b }, newValues: data, reason: "Punkteregel gilt nur für neue Truhen – bestehende bleiben unverändert" });
    } else {
      const t = await prisma.chestType.create({ data });
      await audit(prisma, { userId: user.id, action: "TRUHENTYP_ANGELEGT", entity: "ChestType", entityId: t.id, newValues: data });
    }
  } catch { return { error: "Name existiert bereits." }; }
  revalidatePath("/admin");
  return { ok: "Truhentyp gespeichert." };
}

export async function saveEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("OFFIZIER");
  const p = z.object({ name: z.string().min(2), startAt: z.string().min(10), endAt: z.string().min(10), goalPoints: z.string(), description: z.string() }).safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: "Bitte Eingaben prüfen." };
  const data = { name: p.data.name, startAt: fromInputUTC(p.data.startAt), endAt: fromInputUTC(p.data.endAt), goalPoints: p.data.goalPoints ? Number(p.data.goalPoints) : null, description: p.data.description };
  if (data.endAt <= data.startAt) return { error: "Ende muss nach dem Start liegen." };
  const e = await prisma.event.create({ data });
  // Bereits erfasste Event-Truhen im Zeitraum nachträglich zuordnen
  const linked = await prisma.chest.updateMany({ where: { eventId: null, capturedAt: { gte: data.startAt, lt: data.endAt }, OR: [{ source: "EVENT" }, { chestType: { category: "EVENT" } }] }, data: { eventId: e.id } });
  await audit(prisma, { userId: user.id, action: "EVENT_ANGELEGT", entity: "Event", entityId: e.id, newValues: { ...data, nachtraeglichZugeordnet: linked.count } });
  revalidatePath("/admin");
  return { ok: `Event angelegt, ${linked.count} vorhandene Truhen zugeordnet.` };
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("ADMIN");
  const b = await getSettings();
  const pw = str(fd, "publicPassword");
  const data = {
    clanName: str(fd, "clanName") || b.clanName,
    defaultMemberGoalPoints: Math.max(0, Number(str(fd, "defaultMemberGoalPoints")) || 0),
    inactiveAfterDays: Math.max(1, Number(str(fd, "inactiveAfterDays")) || 3),
    publicEnabled: fd.get("publicEnabled") === "on",
    webhookUrl: str(fd, "webhookUrl"),
    ...(fd.get("removePassword") === "on" ? { publicPasswordHash: null } : pw ? { publicPasswordHash: await hashPassword(pw) } : {}),
  };
  if (data.webhookUrl && !/^https:\/\//.test(data.webhookUrl)) return { error: "Webhook-URL muss mit https:// beginnen." };
  await prisma.settings.update({ where: { id: 1 }, data });
  await audit(prisma, { userId: user.id, action: "EINSTELLUNGEN_GEAENDERT", entity: "Settings", oldValues: { clanName: b.clanName, defaultMemberGoalPoints: b.defaultMemberGoalPoints, inactiveAfterDays: b.inactiveAfterDays, publicEnabled: b.publicEnabled, webhook: !!b.webhookUrl, passwort: !!b.publicPasswordHash }, newValues: { clanName: data.clanName, defaultMemberGoalPoints: data.defaultMemberGoalPoints, inactiveAfterDays: data.inactiveAfterDays, publicEnabled: data.publicEnabled, webhook: !!data.webhookUrl, passwort: "publicPasswordHash" in data ? !!data.publicPasswordHash : !!b.publicPasswordHash } });
  revalidatePath("/", "layout");
  return { ok: "Einstellungen gespeichert." };
}

export async function rotatePublicTokenAction() {
  const user = await requireRole("ADMIN");
  const { randomBytes } = await import("node:crypto");
  await prisma.settings.update({ where: { id: 1 }, data: { publicToken: randomBytes(18).toString("base64url") } });
  await audit(prisma, { userId: user.id, action: "CLAN_LINK_ERNEUERT", entity: "Settings", reason: "Alter Link ungültig" });
  revalidatePath("/admin");
}

// ---------- Öffentlicher Clan-Link mit Passwort ----------
export async function publicUnlockAction(token: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const s = await getSettings();
  if (!s.publicEnabled || s.publicToken !== token || !s.publicPasswordHash) return { error: "Link ungültig." };
  if (!(await checkPassword(str(fd, "password"), s.publicPasswordHash))) return { error: "Falsches Passwort." };
  const jwt = await signSession({ uid: "public", role: "PUBLIC", name: token });
  (await cookies()).set(`tz_pub_${token.slice(0, 8)}`, jwt, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/clan/${token}`, maxAge: 60 * 60 * 24 * 30 });
  redirect(`/clan/${token}`);
}
