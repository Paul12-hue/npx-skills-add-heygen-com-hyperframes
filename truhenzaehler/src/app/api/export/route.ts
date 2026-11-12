import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { userWithRole } from "@/lib/auth";
import { getSettings } from "@/lib/db";
import { periodStats } from "@/lib/stats";
import { weeklySummary } from "@/lib/report";
import { toCsv } from "@/lib/csv";
import { DAY_MS, weekRange } from "@/lib/period";
import { SOURCE_LABEL, type Source } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const user = await userWithRole("OFFIZIER");
  if (!user) return NextResponse.json({ fehler: "Keine Berechtigung" }, { status: 403 });
  const p = req.nextUrl.searchParams;
  const def = weekRange();
  const start = p.get("von") ? new Date(p.get("von") + "T00:00:00Z") : def.start;
  const end = p.get("bis") ? new Date(new Date(p.get("bis") + "T00:00:00Z").getTime() + DAY_MS) : def.end;
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return NextResponse.json({ fehler: "Ungültiger Zeitraum" }, { status: 400 });
  const stats = await periodStats({ start, end });
  const name = `truhen_${start.toISOString().slice(0, 10)}_${new Date(end.getTime() - 1).toISOString().slice(0, 10)}`;
  const chestRows = stats.chests.map((c) => [c.capturedAt.toISOString(), c.member.name, c.chestType.name, c.tier, SOURCE_LABEL[c.source as Source] ?? c.source, c.points, c.event?.name ?? "", c.origin, c.id]);
  const chestHead = ["Zeitpunkt (UTC)", "Mitglied", "Truhentyp", "Stufe", "Quelle", "Punkte", "Event", "Erfassung", "ID"];
  const format = p.get("format") ?? "csv";

  if (format === "csv") {
    return new NextResponse(toCsv(chestHead, chestRows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  }

  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Truhenzähler";
    const ws1 = wb.addWorksheet("Mitglieder");
    ws1.addRow(["Platz", "Mitglied", "Truhen", "Punkte", "davon Event-Punkte", "Letzte Truhe (UTC)"]);
    stats.members.forEach((m, i) => ws1.addRow([i + 1, m.name, m.count, m.points, m.eventPoints, m.last]));
    const ws2 = wb.addWorksheet("Truhen");
    ws2.addRow(chestHead);
    stats.chests.forEach((c, i) => ws2.addRow([c.capturedAt, ...chestRows[i].slice(1)]));
    const ws3 = wb.addWorksheet("Typen");
    ws3.addRow(["Truhentyp", "Anzahl", "Punkte"]);
    stats.byType.forEach((t) => ws3.addRow([t.key, t.count, t.points]));
    for (const ws of [ws1, ws2, ws3]) {
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.columns.forEach((c) => (c.width = 20));
    }
    const buf = await wb.xlsx.writeBuffer();
    return new NextResponse(buf as ArrayBuffer, {
      headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
    });
  }

  if (format === "pdf") {
    const s = await getSettings();
    const sum = await weeklySummary(start, s.defaultMemberGoalPoints, s.clanName);
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // Standardschrift unterstützt kein Emoji → für PDF entfernen
    const clean = (t: string) => t.replace(/[^\p{L}\p{N}\p{P}\p{Zs}+=<>|~^$€°§\n]/gu, "").trim();
    const [title, ...rest] = sum.text.split("\n");
    doc.setFontSize(15).text(clean(title), 40, 50);
    doc.setFontSize(10).text(rest.slice(0, 5).map(clean), 40, 75);
    autoTable(doc, {
      startY: 160,
      head: [["#", "Mitglied", "Truhen", "Punkte", "Event-Punkte", "Wochenziel"]],
      body: stats.members.map((m, i) => {
        const pr = sum.members.find((x) => x.member.id === m.id)?.progress;
        return [i + 1, m.name, m.count, m.points, m.eventPoints, pr ? `${Math.round(pr.percent)} %` : "–"];
      }),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [212, 155, 34], textColor: 20 },
    });
    if (sum.below.length) {
      doc.addPage();
      doc.setFontSize(13).text("Unter Wochenziel", 40, 50);
      autoTable(doc, { startY: 65, head: [["Mitglied", "Stand", "Ziel", "%"]], body: sum.below.map((m) => [m.member.name, m.progress.current, m.progress.target, `${Math.round(m.progress.percent)} %`]), styles: { fontSize: 9 } });
    }
    doc.setFontSize(8).text(`Erstellt ${fmtDateTime(new Date())} UTC von ${user.username} – nur gültige Clan-Truhen`, 40, 820);
    return new NextResponse(doc.output("arraybuffer"), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
    });
  }
  return NextResponse.json({ fehler: "Unbekanntes Format (csv, xlsx, pdf)" }, { status: 400 });
}
