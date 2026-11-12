/**
 * Sync-Agent – automatische Erfassung alle 15 Minuten (oder schneller).
 *
 * Arbeitsweise: Ein Offizier (oder ein Rechner mit laufendem Spiel) legt Screenshots
 * der Clan-Truhenliste bzw. CSV-/TXT-Exporte in den Eingangsordner. Der Agent
 *   1. liest neue Dateien (PNG/JPG → OCR via `tesseract`-CLI, TXT direkt, CSV direkt),
 *   2. wandelt sie in Truhenzeilen um (src/lib/giftParser.ts),
 *   3. sendet sie an POST /api/ingest (idempotent – Wiederholungen schaden nicht),
 *   4. verschiebt verarbeitete Dateien nach <inbox>/erledigt.
 *
 * Start:  INGEST_TOKEN=… APP_URL=https://… npx tsx scripts/sync-agent.ts ./inbox
 * Optionen (ENV): INTERVAL_MIN=15, CHEST_LIFETIME_HOURS=20, OCR_LANG=deu+eng
 *
 * Hinweis: Total Battle bietet keine offizielle API. Automatisierte Eingaben ins Spiel
 * (Klick-Bots) verstoßen gegen die Nutzungsbedingungen – dieser Agent liest nur
 * Screenshots, die ihr selbst erstellt.
 */
import { readdir, readFile, rename, mkdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseGiftText } from "../src/lib/giftParser.ts";
import { parseCsv } from "../src/lib/csv.ts";

const run = promisify(execFile);
const inbox = process.argv[2] ?? "./inbox";
const APP = process.env.APP_URL ?? "http://localhost:3000";
const TOKEN = process.env.INGEST_TOKEN ?? "";
const INTERVAL = Number(process.env.INTERVAL_MIN ?? 15) * 60_000;
const LIFETIME = Number(process.env.CHEST_LIFETIME_HOURS ?? 20);

async function ocr(file: string) {
  const { stdout } = await run("tesseract", [file, "-", "-l", process.env.OCR_LANG ?? "deu+eng", "--psm", "6"]);
  return stdout;
}

async function tick() {
  await mkdir(join(inbox, "erledigt"), { recursive: true });
  const files = (await readdir(inbox)).filter((f) => /\.(png|jpe?g|txt|csv)$/i.test(f)).sort();
  for (const f of files) {
    const path = join(inbox, f);
    const when = (await stat(path)).mtime;
    const ext = extname(f).toLowerCase();
    let rows: unknown[];
    let origin = "OCR";
    if (ext === ".csv") {
      origin = "CSV";
      rows = parseCsv(await readFile(path, "utf8")).map((r) => ({
        member: r.mitglied ?? r.member, chestType: r.truhentyp ?? r.typ ?? r.chest, tier: r.stufe ?? r.tier,
        source: r.quelle ?? r.source, capturedAt: r.zeitpunkt ?? r.timestamp, points: r.punkte ?? null,
      }));
    } else {
      const text = ext === ".txt" ? await readFile(path, "utf8") : await ocr(path);
      rows = parseGiftText(text, when, LIFETIME);
    }
    if (!rows.length) { console.warn(`[${f}] keine Truhen erkannt`); continue; }
    const res = await fetch(`${APP}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ origin, rows }),
    });
    const body = await res.json().catch(() => ({}));
    console.log(`[${new Date().toISOString()}] ${f}: HTTP ${res.status}`, body);
    if (res.ok) await rename(path, join(inbox, "erledigt", f));
  }
}

async function loop() {
  try { await tick(); } catch (e) { console.error("Fehler im Durchlauf:", e); }
  setTimeout(loop, INTERVAL);
}
if (!TOKEN) { console.error("INGEST_TOKEN fehlt"); process.exit(1); }
console.log(`Sync-Agent: ${inbox} → ${APP} alle ${INTERVAL / 60_000} Min.`);
loop();
