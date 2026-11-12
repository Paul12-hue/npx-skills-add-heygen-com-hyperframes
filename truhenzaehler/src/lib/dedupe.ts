import { createHash } from "node:crypto";

/**
 * Duplikatschutz
 * ---------------
 * Automatische Importe lesen die Clan-Truhenliste wiederholt (z. B. alle 15 Min.).
 * Dieselbe Truhe taucht dadurch in mehreren Schnappschüssen auf. Gleichzeitig kann
 * ein Mitglied in derselben Minute legitim zwei identische Truhen erzeugen.
 *
 * Lösung: Fingerabdruck = Hash(Mitglied, Typ, Stufe, Quelle, Minute, Ordinal).
 * "Ordinal" ist die laufende Nummer gleichartiger Truhen innerhalb derselben Minute
 * im jeweiligen Schnappschuss. Ein erneuter Import desselben Schnappschusses erzeugt
 * also exakt dieselben Fingerabdrücke (→ werden übersprungen), während eine
 * zusätzliche gleichartige Truhe Ordinal n+1 bekommt und korrekt gezählt wird.
 *
 * Unscharfe Fälle (gleiche Truhe, aber ±1–2 Min. versetzt durch OCR/Rundung) werden
 * nicht verworfen, sondern mit Status PRUEFEN zur Offiziersprüfung markiert.
 */

export interface ChestKey {
  memberId: string;
  chestTypeId: string;
  tier: number;
  source: string;
  capturedAt: Date;
}

export const minuteBucket = (d: Date) => Math.floor(d.getTime() / 60_000);

export const groupKey = (c: ChestKey) =>
  [c.memberId, c.chestTypeId, c.tier, c.source, minuteBucket(c.capturedAt)].join("|");

export const fingerprint = (c: ChestKey, ordinal: number) =>
  createHash("sha256").update(`${groupKey(c)}|${ordinal}`).digest("hex").slice(0, 40);

/** Vergibt Ordinals je Gruppe in Eingabereihenfolge und liefert den Fingerabdruck je Zeile. */
export function assignFingerprints<T extends ChestKey>(rows: T[]): (T & { fingerprint: string })[] {
  const counter = new Map<string, number>();
  return rows.map((r) => {
    const k = groupKey(r);
    const ord = counter.get(k) ?? 0;
    counter.set(k, ord + 1);
    return { ...r, fingerprint: fingerprint(r, ord) };
  });
}
