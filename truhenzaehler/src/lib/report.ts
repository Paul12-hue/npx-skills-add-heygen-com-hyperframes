import { periodStats, memberWeekProgress, goalProgress, inactiveMembers } from "./stats";
import { prisma } from "./db";
import { weekRange, weekLabel, DAY_MS } from "./period";
import { fmtDate, fmtNum, fmtPct } from "./format";
import { FORECAST_LABEL } from "./forecast";

/** Wochenzusammenfassung als Text + Daten (für Berichte-Seite, PDF, Webhook). */
export async function weeklySummary(ref: Date, defaultTarget: number, clanName: string) {
  const { start, end } = weekRange(ref);
  const prev = weekRange(new Date(start.getTime() - DAY_MS));
  const asOf = end.getTime() < Date.now() ? new Date(end.getTime() - 1) : new Date();
  const [stats, prevStats, members, goal, inactive] = await Promise.all([
    periodStats({ start, end }),
    periodStats({ start: prev.start, end: prev.end }),
    memberWeekProgress(defaultTarget, asOf),
    prisma.goal.findFirst({ where: { scope: "CLAN", periodStart: start } }),
    inactiveMembers(7, asOf),
  ]);
  const gp = goal ? await goalProgress(goal, asOf) : null;
  const trend = prevStats.totalPoints ? ((stats.totalPoints - prevStats.totalPoints) / prevStats.totalPoints) * 100 : null;
  const below = members.filter((m) => m.member.status === "AKTIV" && m.progress.current < m.progress.target);
  const lines = [
    `📦 ${clanName} – Truhenbericht ${weekLabel(start)} (${fmtDate(start)} – ${fmtDate(new Date(end.getTime() - 1))})`,
    "",
    `Truhen: ${fmtNum(stats.totalChests)} (davon Event: ${fmtNum(stats.eventChests)})`,
    `Punkte: ${fmtNum(stats.totalPoints)}${trend != null ? ` (${trend >= 0 ? "+" : ""}${fmtPct(trend)} ggü. Vorwoche)` : ""}`,
    gp ? `Clan-Ziel: ${fmtNum(gp.current)} / ${fmtNum(gp.target)} = ${fmtPct(gp.percent)} → ${FORECAST_LABEL[gp.status]}` : "Clan-Ziel: nicht gesetzt",
    `Beitragende: ${stats.members.length} von ${members.filter((m) => m.member.status === "AKTIV").length} aktiven Mitgliedern`,
    "",
    "🏆 Top 10:",
    ...stats.members.slice(0, 10).map((m, i) => `${i + 1}. ${m.name} – ${fmtNum(m.points)} P (${m.count} Truhen)`),
    "",
    `⚠ Unter Wochenziel (${below.length}):`,
    ...(below.length ? below.slice(0, 30).map((m) => `• ${m.member.name}: ${fmtNum(m.progress.current)} / ${fmtNum(m.progress.target)} (${fmtPct(m.progress.percent)})`) : ["– niemand –"]),
    "",
    `💤 Ohne Truhe seit ≥ 7 Tagen (${inactive.length}): ${inactive.map((m) => m.name).join(", ") || "–"}`,
    "",
    "Truhentypen: " + stats.byType.map((t) => `${t.key} ${t.count}`).join(" · "),
  ];
  return { start, end, stats, members, below, inactive, goal: gp, trend, text: lines.join("\n") };
}
