import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ingestChests } from "@/lib/ingest";
import { ORIGINS } from "@/lib/domain";

export const runtime = "nodejs";

/**
 * Automatischer Import – für OCR-Agent, Browser-Erweiterung oder Cron (≥ alle 15 Min.).
 * POST /api/ingest  Authorization: Bearer <INGEST_TOKEN>
 * { "origin": "OCR", "rows": [{ "member": "...", "chestType": "...", "tier": 10, "source": "KRYPTA", "capturedAt": "2026-11-12T18:04:00Z" }] }
 * Idempotent: derselbe Schnappschuss kann beliebig oft gesendet werden.
 */
const body = z.object({
  origin: z.enum(ORIGINS).exclude(["MANUELL"]).default("API"),
  rows: z.array(z.object({
    member: z.string().min(1).max(60),
    chestType: z.string().min(1).max(80),
    tier: z.union([z.number(), z.string()]).optional(),
    source: z.string().max(30).optional(),
    capturedAt: z.string().min(10),
    points: z.union([z.number(), z.string(), z.null()]).optional(),
    raw: z.string().max(2000).optional(),
  })).max(5000),
});

function authorized(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 16) return false;
  const a = Buffer.from(got), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ fehler: "Nicht autorisiert" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ fehler: "Ungültige Daten", details: parsed.error.issues.slice(0, 20) }, { status: 400 });
  const res = await ingestChests(parsed.data.rows, parsed.data.origin, null);
  return NextResponse.json({ neu: res.created, duplikate: res.skippedDuplicates, pruefen: res.flaggedForReview, fehler: res.errors });
}
