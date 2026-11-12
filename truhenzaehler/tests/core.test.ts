import { test } from "node:test";
import assert from "node:assert/strict";
import { assignFingerprints } from "../src/lib/dedupe.ts";
import { chestPoints } from "../src/lib/points.ts";
import { forecast } from "../src/lib/forecast.ts";
import { weekRange, isoWeek } from "../src/lib/period.ts";
import { parseCsv, toCsv } from "../src/lib/csv.ts";
import { parseGiftText } from "../src/lib/giftParser.ts";

const base = { memberId: "m1", chestTypeId: "t1", tier: 10, source: "KRYPTA" };

test("Duplikatschutz: gleicher Schnappschuss → gleiche Fingerabdrücke", () => {
  const snap = [{ ...base, capturedAt: new Date("2026-11-12T10:00:20Z") }, { ...base, capturedAt: new Date("2026-11-12T10:00:50Z") }];
  const a = assignFingerprints(snap).map((r) => r.fingerprint);
  const b = assignFingerprints(snap).map((r) => r.fingerprint);
  assert.deepEqual(a, b);
  assert.notEqual(a[0], a[1], "zwei echte gleichartige Truhen in derselben Minute bleiben zwei");
});

test("Duplikatschutz: späterer Schnappschuss mit einer Truhe mehr ergibt genau einen neuen Fingerabdruck", () => {
  const t = new Date("2026-11-12T10:00:00Z");
  const first = new Set(assignFingerprints([{ ...base, capturedAt: t }]).map((r) => r.fingerprint));
  const second = assignFingerprints([{ ...base, capturedAt: t }, { ...base, capturedAt: t }]).map((r) => r.fingerprint);
  assert.equal(second.filter((f) => !first.has(f)).length, 1);
});

test("Punkte: Basis + (Stufe-1) × Aufschlag", () => {
  assert.equal(chestPoints({ basePoints: 5, pointsPerTier: 2 }, 10), 23);
  assert.equal(chestPoints({ basePoints: 5, pointsPerTier: 2 }, 0), 5);
});

test("Prognose: lineare Hochrechnung und Status", () => {
  const s = new Date("2026-11-09T00:00:00Z"), e = new Date("2026-11-16T00:00:00Z");
  const mid = new Date("2026-11-12T12:00:00Z"); // genau Halbzeit
  assert.equal(forecast(500, 1000, s, e, mid).status, "AUF_KURS");
  assert.equal(forecast(430, 1000, s, e, mid).status, "KNAPP");
  assert.equal(forecast(200, 1000, s, e, mid).status, "GEFAEHRDET");
  assert.equal(forecast(1000, 1000, s, e, mid).status, "ERREICHT");
  assert.equal(forecast(500, 1000, s, e, mid).neededPerDay, 143);
});

test("Woche beginnt Montag UTC", () => {
  const { start, end } = weekRange(new Date("2026-11-12T15:00:00Z")); // Donnerstag
  assert.equal(start.toISOString(), "2026-11-09T00:00:00.000Z");
  assert.equal(end.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.deepEqual(isoWeek(new Date("2026-11-12T00:00:00Z")), { year: 2026, week: 46 });
});

test("CSV: Semikolon, Anführungszeichen, Formel-Schutz", () => {
  const rows = parseCsv('Mitglied;Truhentyp;Stufe\n"Wolf; der Graue";Krypta;5\n');
  assert.deepEqual(rows, [{ mitglied: "Wolf; der Graue", truhentyp: "Krypta", stufe: "5" }]);
  assert.match(toCsv(["a"], [["=HYPERLINK()"]]), /'=HYPERLINK/);
});

test("OCR-Parser: Zeitpunkt aus Restzeit stabil über Schnappschüsse", () => {
  const txt = (left: string) => `Seltene Krypta\nVon: Drachenherz\nQuelle: Krypta Stufe 15\nVerbleibend: ${left}`;
  const a = parseGiftText(txt("19:00:00"), new Date("2026-11-12T10:00:00Z"), 20);
  const b = parseGiftText(txt("18:45:00"), new Date("2026-11-12T10:15:00Z"), 20);
  assert.equal(a[0].capturedAt, "2026-11-12T09:00:00.000Z");
  assert.equal(a[0].capturedAt, b[0].capturedAt);
  assert.equal(a[0].tier, 15);
  assert.equal(a[0].source, "KRYPTA");
  assert.equal(a[0].member, "Drachenherz");
});
