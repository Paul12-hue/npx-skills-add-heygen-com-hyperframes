import { NextResponse, type NextRequest } from "next/server";
import { getSettings, prisma } from "@/lib/db";
import { memberWeekProgress, clanWeekGoal } from "@/lib/stats";
import { audit } from "@/lib/audit";
import { fmtNum, fmtPct } from "@/lib/format";

export const runtime = "nodejs";

/**
 * Offiziers-Hinweise: Mitglieder, deren Prognose „Gefährdet“ ist.
 * Täglich per Cron aufrufen: POST /api/cron/erinnerungen  Authorization: Bearer <CRON_TOKEN>
 * Sendet an den in den Einstellungen hinterlegten Discord-/Slack-Webhook.
 */
export async function POST(req: NextRequest) {
  const token = process.env.CRON_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) return NextResponse.json({ fehler: "Nicht autorisiert" }, { status: 401 });
  const s = await getSettings();
  const [rows, clan] = await Promise.all([memberWeekProgress(s.defaultMemberGoalPoints), clanWeekGoal()]);
  const risk = rows.filter((r) => r.member.status === "AKTIV" && r.progress.status === "GEFAEHRDET");
  const text = [
    `**Truhenzähler – Hinweis für Offiziere (${s.clanName})**`,
    clan ? `Clan-Ziel: ${fmtPct(clan.progress.percent)} (Prognose ${fmtPct(clan.progress.projectedPercent)})` : "Kein Clan-Ziel gesetzt.",
    risk.length ? `${risk.length} Mitglieder liegen deutlich unter Wochenziel:` : "Alle Mitglieder sind auf Kurs. 👍",
    ...risk.slice(0, 40).map((r) => `• ${r.member.name}: ${fmtNum(r.progress.current)}/${fmtNum(r.progress.target)} – braucht ${fmtNum(r.progress.neededPerDay)}/Tag`),
  ].join("\n");
  let sent = false;
  if (s.webhookUrl) {
    const r = await fetch(s.webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text, text }) });
    sent = r.ok;
  }
  await audit(prisma, { action: "ERINNERUNG", entity: "Settings", newValues: { gefaehrdet: risk.length, gesendet: sent } });
  return NextResponse.json({ gesendet: sent, gefaehrdet: risk.length, text });
}
