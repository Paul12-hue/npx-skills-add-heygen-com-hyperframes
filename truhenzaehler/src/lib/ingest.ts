import { prisma } from "./db";
import { audit } from "./audit";
import { assignFingerprints, fingerprint, type ChestKey } from "./dedupe";
import { chestPoints } from "./points";
import { DUPLICATE_WINDOW_MIN, SOURCES, type Origin, type Source } from "./domain";

/** Eine Rohzeile aus manueller Eingabe, CSV, OCR-Agent oder API. */
export interface RawChest {
  member: string;        // Ingame-Name oder Alias
  chestType: string;     // Name des Truhentyps
  tier?: number | string;
  source?: string;
  capturedAt: string | Date;
  eventId?: string | null;
  points?: number | string | null; // optional: Punkte überschreiben (sonst Punkteregel)
  raw?: string;
}

export interface IngestResult {
  created: number;
  skippedDuplicates: number;
  flaggedForReview: number;
  errors: { row: number; message: string }[];
  createdIds: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function parseSource(s?: string): Source {
  const up = (s ?? "").trim().toUpperCase().replace("Ä", "AE");
  const map: Record<string, Source> = { CRYPT: "KRYPTA", KRYPTEN: "KRYPTA", QUEST: "AUFGABE", MONSTER: "KAMPF", CITADEL: "ZITADELLE", BATTLE: "KAMPF" };
  if ((SOURCES as readonly string[]).includes(up)) return up as Source;
  return map[up] ?? "SONSTIGE";
}

/**
 * Zentrale Erfassung für ALLE Wege (manuell, CSV, OCR, API):
 * Namen auflösen → Punkte berechnen → Event zuordnen → Fingerabdruck → Duplikate überspringen
 * → unscharfe Duplikate als PRUEFEN markieren → Protokoll.
 */
export async function ingestChests(rows: RawChest[], origin: Origin, userId: string | null): Promise<IngestResult> {
  const [members, types, events] = await Promise.all([
    prisma.member.findMany({ select: { id: true, name: true, aliases: true } }),
    prisma.chestType.findMany(),
    prisma.event.findMany(),
  ]);
  const memberByName = new Map<string, string>();
  for (const m of members) {
    memberByName.set(norm(m.name), m.id);
    for (const a of m.aliases.split(",").map(norm).filter(Boolean)) memberByName.set(a, m.id);
  }
  const typeByName = new Map(types.map((t) => [norm(t.name), t]));

  const result: IngestResult = { created: 0, skippedDuplicates: 0, flaggedForReview: 0, errors: [], createdIds: [] };
  const valid: (ChestKey & { points: number; eventId: string | null; raw: string })[] = [];

  rows.forEach((r, i) => {
    const memberId = memberByName.get(norm(r.member ?? ""));
    const type = typeByName.get(norm(r.chestType ?? ""));
    const capturedAt = r.capturedAt instanceof Date ? r.capturedAt : new Date(r.capturedAt);
    const tier = Number(r.tier ?? 1) || 1;
    if (!memberId) return result.errors.push({ row: i + 1, message: `Unbekanntes Mitglied „${r.member}“` });
    if (!type) return result.errors.push({ row: i + 1, message: `Unbekannter Truhentyp „${r.chestType}“` });
    if (isNaN(capturedAt.getTime())) return result.errors.push({ row: i + 1, message: "Ungültiger Zeitpunkt" });
    if (capturedAt.getTime() > Date.now() + 5 * 60_000)
      return result.errors.push({ row: i + 1, message: "Zeitpunkt liegt in der Zukunft" });
    let source = parseSource(r.source);
    const ev =
      (r.eventId && events.find((e) => e.id === r.eventId)) ||
      (source === "EVENT" || type.category === "EVENT"
        ? events.find((e) => e.startAt <= capturedAt && e.endAt > capturedAt)
        : undefined);
    if (type.category === "EVENT" && source === "SONSTIGE") source = "EVENT";
    const override = r.points != null && r.points !== "" ? Number(r.points) : NaN;
    valid.push({
      memberId,
      chestTypeId: type.id,
      tier,
      source,
      capturedAt,
      points: Number.isFinite(override) && override >= 0 ? Math.round(override) : chestPoints(type, tier),
      eventId: ev ? ev.id : null,
      raw: r.raw ?? JSON.stringify(r),
    });
  });

  // Manuelle Einzeleingaben bekommen das nächste freie Ordinal, damit zwei bewusst
  // eingetragene identische Truhen beide zählen. Importe nutzen Schnappschuss-Ordinals.
  const withFp = assignFingerprints(valid);
  const existing = new Set(
    (await prisma.chest.findMany({ where: { fingerprint: { in: withFp.map((c) => c.fingerprint) } }, select: { fingerprint: true } }))
      .map((c) => c.fingerprint),
  );

  for (const c of withFp) {
    let fp = c.fingerprint;
    if (existing.has(fp)) {
      if (origin !== "MANUELL") { result.skippedDuplicates++; continue; }
      // manuell: Offizier hat bewusst eine weitere gleichartige Truhe erfasst → als PRUEFEN anlegen
      let n = 1;
      while (existing.has(fp)) fp = fingerprint(c, 1000 + n++);
    }
    const win = DUPLICATE_WINDOW_MIN * 60_000;
    const near = await prisma.chest.count({
      where: {
        memberId: c.memberId, chestTypeId: c.chestTypeId, tier: c.tier, source: c.source,
        status: { not: "VERWORFEN" },
        capturedAt: { gte: new Date(c.capturedAt.getTime() - win), lte: new Date(c.capturedAt.getTime() + win) },
        NOT: { fingerprint: { in: [...existing] } },
      },
    });
    const status = near > 0 || fp !== c.fingerprint ? "PRUEFEN" : "GUELTIG";
    const chest = await prisma.chest.create({
      data: {
        memberId: c.memberId, chestTypeId: c.chestTypeId, tier: c.tier, source: c.source,
        capturedAt: c.capturedAt, points: c.points, eventId: c.eventId, origin, status,
        fingerprint: fp, rawText: c.raw.slice(0, 2000), createdById: userId,
      },
    });
    existing.add(fp);
    result.created++;
    result.createdIds.push(chest.id);
    if (status === "PRUEFEN") result.flaggedForReview++;
  }

  if (rows.length > 1 || origin !== "MANUELL") {
    await audit(prisma, {
      userId, action: "IMPORT", entity: "Chest",
      newValues: { origin, zeilen: rows.length, neu: result.created, duplikate: result.skippedDuplicates, pruefen: result.flaggedForReview, fehler: result.errors.length },
    });
  } else if (result.createdIds[0]) {
    await audit(prisma, { userId, action: "TRUHE_ERFASST", entity: "Chest", entityId: result.createdIds[0], newValues: { ...rows[0] } });
  }
  return result;
}
