/**
 * Parser für OCR-Text der Clan-Truhenliste ("Geschenke"-Reiter im Clan-Menü).
 * Typischer Block je Truhe (DE/EN-Client):
 *
 *   Gewöhnliche Krypta            | Common Crypt
 *   Von: Drachenherz              | From: Drachenherz
 *   Quelle: Krypta Stufe 10       | Source: Level 10 Crypt
 *   Verbleibend: 18:42:10         | Time left: 18:42:10
 *
 * Da die Liste keinen Erstellungszeitpunkt zeigt, wird er berechnet:
 *   Zeitpunkt = Screenshot-Zeit + Restzeit − Lebensdauer der Truhe.
 * So ergibt dieselbe Truhe in jedem Schnappschuss denselben Zeitpunkt (→ Duplikatschutz).
 */
export interface ParsedGift {
  chestType: string;
  member: string;
  source: string;
  tier: number;
  capturedAt: string;
  raw: string;
}

const FROM = /^(?:von|from)\s*[:;]\s*(.+)$/i;
const SRC = /^(?:quelle|source)\s*[:;]\s*(.+)$/i;
const LEFT = /(?:verbleibend|time left|läuft ab in|expires in)?\s*[:;]?\s*(\d{1,2})[:h ]\s*(\d{2})[:m ]\s*(\d{2})?/i;

const SOURCE_MAP: [RegExp, string][] = [
  [/krypta|crypt/i, "KRYPTA"],
  [/event|turnier|tournament/i, "EVENT"],
  [/aufgabe|quest|task/i, "AUFGABE"],
  [/zitadelle|citadel/i, "ZITADELLE"],
  [/arena/i, "ARENA"],
  [/monster|kampf|battle|horde|epic/i, "KAMPF"],
];

export function parseGiftText(text: string, screenshotAt: Date, lifetimeHours: number): ParsedGift[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out: ParsedGift[] = [];
  for (let i = 0; i < lines.length; i++) {
    const from = lines[i].match(FROM);
    if (!from) continue;
    const chestType = lines[i - 1] ?? "";
    const srcLine = lines[i + 1]?.match(SRC)?.[1] ?? "";
    const leftLine = [lines[i + 2], lines[i + 1]].find((l) => l && /\d{1,2}[:h ]\s*\d{2}/.test(l) && !SRC.test(l)) ?? "";
    const tier = Number(srcLine.match(/(?:stufe|level|lvl\.?)\s*(\d+)/i)?.[1] ?? srcLine.match(/(\d+)/)?.[1] ?? 1);
    const source = SOURCE_MAP.find(([r]) => r.test(srcLine))?.[1] ?? "SONSTIGE";
    let t = screenshotAt.getTime();
    const m = leftLine.match(LEFT);
    if (m) t += ((+m[1] * 60 + +m[2]) * 60 + (+(m[3] ?? 0))) * 1000 - lifetimeHours * 3_600_000;
    out.push({
      chestType,
      member: from[1].trim(),
      source,
      tier,
      capturedAt: new Date(Math.round(t / 60_000) * 60_000).toISOString(),
      raw: [chestType, lines[i], lines[i + 1], leftLine].filter(Boolean).join(" | "),
    });
  }
  return out;
}
