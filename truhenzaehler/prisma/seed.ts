// Demodaten: 30 Mitglieder, 5 Wochen Truhen, Event, Ziele, Benutzer admin/offizier/mitglied.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assignFingerprints } from "../src/lib/dedupe.ts";
import { chestPoints } from "../src/lib/points.ts";
import { weekRange } from "../src/lib/period.ts";

const prisma = new PrismaClient();
const DAY = 86_400_000;
let seed = 42;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

const NAMES = ["Drachenherz", "Eisenfaust", "Schattenwolf", "Sturmklinge", "Nachtfalke", "Goldlöwe", "Runenmeister", "Wolfsblut", "Feuerkrone", "Silberpfeil",
  "Donnerhall", "Grimmbart", "Rabenschwinge", "Steinbrecher", "Frostbiss", "Aschewind", "Bärentatze", "Eichenschild", "Glutauge", "Hammerfall",
  "Kriegsrufer", "Mondsichel", "Nebelgeist", "Ordensritter", "Purpurklinge", "Quellwächter", "Sonnenlanze", "Tiefenwache", "Waldläufer", "Zornbringer"];

async function main() {
  await prisma.auditLog.deleteMany(); await prisma.chest.deleteMany(); await prisma.goal.deleteMany();
  await prisma.user.deleteMany(); await prisma.member.deleteMany(); await prisma.event.deleteMany(); await prisma.chestType.deleteMany();
  await prisma.settings.upsert({ where: { id: 1 }, update: { clanName: "Eiserne Wacht", publicEnabled: true }, create: { id: 1, clanName: "Eiserne Wacht", publicEnabled: true } });

  const types = await Promise.all([
    { name: "Gewöhnliche Krypta", category: "STANDARD", basePoints: 1, pointsPerTier: 1 },
    { name: "Seltene Krypta", category: "STANDARD", basePoints: 5, pointsPerTier: 2 },
    { name: "Epische Krypta", category: "SELTEN", basePoints: 20, pointsPerTier: 5 },
    { name: "Zitadellen-Truhe", category: "SELTEN", basePoints: 30, pointsPerTier: 5 },
    { name: "Arena-Truhe", category: "STANDARD", basePoints: 3, pointsPerTier: 0 },
    { name: "Monster-Truhe", category: "STANDARD", basePoints: 2, pointsPerTier: 1 },
    { name: "Event-Truhe", category: "EVENT", basePoints: 10, pointsPerTier: 2 },
  ].map((d) => prisma.chestType.create({ data: d })));
  const T = Object.fromEntries(types.map((t) => [t.name, t]));

  const now = new Date();
  const wk = weekRange(now);
  const members = await Promise.all(NAMES.map((name, i) => prisma.member.create({
    data: { name, joinedAt: new Date(now.getTime() - (60 + i * 7) * DAY), status: i === 27 ? "PAUSIERT" : i === 29 ? "AUSGETRETEN" : "AKTIV", clanRank: i < 2 ? "Anführer" : i < 6 ? "Offizier" : "Mitglied", aliases: i === 0 ? "Drachenherz1,Drachenherr" : "" },
  })));

  const ev = await prisma.event.create({ data: { name: "Krypta-Wochenende", startAt: new Date(wk.start.getTime() - 3 * DAY), endAt: new Date(wk.start.getTime() + 1 * DAY), goalPoints: 3000 } });

  const rows: any[] = [];
  const start = wk.start.getTime() - 4 * 7 * DAY;
  members.forEach((m, i) => {
    if (i >= 25) return; // ein paar inaktive
    const activity = 0.3 + rnd() * 1.7 * (1 - i / 35);
    for (let t = start; t < now.getTime(); t += DAY) {
      const n = Math.floor(rnd() * 8 * activity);
      for (let k = 0; k < n; k++) {
        const at = new Date(t + Math.floor(rnd() * DAY));
        if (at > now) continue;
        const inEvent = at >= ev.startAt && at < ev.endAt && rnd() < 0.4;
        const type = inEvent ? T["Event-Truhe"] : pick([T["Gewöhnliche Krypta"], T["Gewöhnliche Krypta"], T["Gewöhnliche Krypta"], T["Seltene Krypta"], T["Seltene Krypta"], T["Monster-Truhe"], T["Arena-Truhe"], T["Epische Krypta"], T["Zitadellen-Truhe"]]);
        const tier = type.pointsPerTier ? 5 + Math.floor(rnd() * 20) : 1;
        const source = inEvent ? "EVENT" : type.name.includes("Krypta") ? "KRYPTA" : type.name.includes("Zitadelle") ? "ZITADELLE" : type.name.includes("Arena") ? "ARENA" : "KAMPF";
        rows.push({ memberId: m.id, chestTypeId: type.id, tier, source, capturedAt: new Date(Math.floor(at.getTime() / 60000) * 60000), points: chestPoints(type, tier), eventId: inEvent ? ev.id : null, origin: pick(["OCR", "OCR", "OCR", "MANUELL", "CSV"]) });
      }
    }
  });
  const fps = assignFingerprints(rows);
  for (let i = 0; i < fps.length; i += 500) await prisma.chest.createMany({ data: fps.slice(i, i + 500) });
  // zwei Verdachtsfälle für die Prüfliste
  const sample = fps.slice(-2);
  for (const s of sample) await prisma.chest.create({ data: { ...s, capturedAt: new Date(s.capturedAt.getTime() + 60_000), fingerprint: s.fingerprint + "x", status: "PRUEFEN", origin: "OCR", rawText: "OCR-Schnappschuss (Demo-Duplikat)" } });

  for (let w = -4; w <= 0; w++) {
    const r = weekRange(new Date(wk.start.getTime() + w * 7 * DAY + DAY));
    await prisma.goal.create({ data: { scope: "CLAN", periodStart: r.start, periodEnd: r.end, metric: "PUNKTE", targetValue: 9000 } });
  }
  await prisma.goal.create({ data: { scope: "MITGLIED", memberId: members[0].id, periodStart: wk.start, periodEnd: wk.end, metric: "PUNKTE", targetValue: 600 } });
  await prisma.goal.create({ data: { scope: "MITGLIED", memberId: members[10].id, periodStart: wk.start, periodEnd: wk.end, metric: "TRUHEN", targetValue: 40 } });

  const hash = await bcrypt.hash("Truhen-Demo-2026", 12);
  const admin = await prisma.user.create({ data: { username: "admin", passwordHash: hash, role: "ADMIN", memberId: members[0].id } });
  await prisma.user.create({ data: { username: "offizier", passwordHash: hash, role: "OFFIZIER", memberId: members[2].id } });
  await prisma.user.create({ data: { username: "mitglied", passwordHash: hash, role: "MITGLIED", memberId: members[8].id } });
  await prisma.auditLog.create({ data: { userId: admin.id, action: "IMPORT", entity: "Chest", newValues: JSON.stringify({ origin: "Demo-Seed", neu: fps.length }) } });
  console.log(`Seed: ${members.length} Mitglieder, ${fps.length + 2} Truhen. Login: admin / offizier / mitglied – Passwort „Truhen-Demo-2026“`);
}
main().finally(() => prisma.$disconnect());
