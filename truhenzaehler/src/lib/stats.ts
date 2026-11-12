import { prisma } from "./db";
import { daysBetween, startOfDayUTC, weekRange, DAY_MS } from "./period";
import { forecast, type Forecast } from "./forecast";
import type { GoalMetric } from "./domain";

export interface StatsFilter {
  start: Date;
  end: Date;
  memberId?: string;
  chestTypeId?: string;
  source?: string;
  eventOnly?: boolean;
  excludeEvents?: boolean;
}

/** Nur gültige Truhen zählen – PRUEFEN und VERWORFEN werden nie mitgerechnet. */
export async function loadChests(f: StatsFilter) {
  return prisma.chest.findMany({
    where: {
      status: "GUELTIG",
      capturedAt: { gte: f.start, lt: f.end },
      ...(f.memberId && { memberId: f.memberId }),
      ...(f.chestTypeId && { chestTypeId: f.chestTypeId }),
      ...(f.source && { source: f.source }),
      ...(f.eventOnly && { eventId: { not: null } }),
      ...(f.excludeEvents && { eventId: null }),
    },
    include: { member: { select: { id: true, name: true } }, chestType: true, event: { select: { id: true, name: true } } },
    orderBy: { capturedAt: "desc" },
  });
}

type Loaded = Awaited<ReturnType<typeof loadChests>>;

const tally = <K extends string | number>(rows: Loaded, key: (c: Loaded[number]) => K) => {
  const m = new Map<K, { count: number; points: number }>();
  for (const c of rows) {
    const k = key(c);
    const e = m.get(k) ?? { count: 0, points: 0 };
    e.count++; e.points += c.points;
    m.set(k, e);
  }
  return [...m.entries()].map(([k, v]) => ({ key: k, ...v })).sort((a, b) => b.points - a.points);
};

export async function periodStats(f: StatsFilter) {
  const chests = await loadChests(f);
  const totalPoints = chests.reduce((s, c) => s + c.points, 0);
  const eventChests = chests.filter((c) => c.eventId);
  const days = daysBetween(f.start, f.end);
  const perDay = new Map(days.map((d) => [d.getTime(), { count: 0, points: 0, event: 0 }]));
  for (const c of chests) {
    const e = perDay.get(startOfDayUTC(c.capturedAt).getTime());
    if (e) { e.count++; e.points += c.points; if (c.eventId) e.event += c.points; }
  }
  const perMember = new Map<string, { id: string; name: string; count: number; points: number; eventPoints: number; types: Record<string, number>; last: Date }>();
  for (const c of chests) {
    const e = perMember.get(c.memberId) ?? { id: c.memberId, name: c.member.name, count: 0, points: 0, eventPoints: 0, types: {}, last: c.capturedAt };
    e.count++; e.points += c.points;
    if (c.eventId) e.eventPoints += c.points;
    e.types[c.chestType.name] = (e.types[c.chestType.name] ?? 0) + 1;
    if (c.capturedAt > e.last) e.last = c.capturedAt;
    perMember.set(c.memberId, e);
  }
  return {
    chests,
    totalChests: chests.length,
    totalPoints,
    eventChests: eventChests.length,
    eventPoints: eventChests.reduce((s, c) => s + c.points, 0),
    byType: tally(chests, (c) => c.chestType.name),
    byTier: tally(chests, (c) => c.tier).sort((a, b) => Number(a.key) - Number(b.key)),
    bySource: tally(chests, (c) => c.source),
    byEvent: tally(eventChests, (c) => c.event?.name ?? "—"),
    daily: days.map((d) => ({ day: d, ...perDay.get(d.getTime())! })),
    members: [...perMember.values()].sort((a, b) => b.points - a.points),
  };
}

export async function weekComparison(now = new Date()) {
  const cur = weekRange(now);
  const prev = weekRange(new Date(cur.start.getTime() - DAY_MS));
  const sum = async (s: Date, e: Date) =>
    prisma.chest.aggregate({ where: { status: "GUELTIG", capturedAt: { gte: s, lt: e } }, _sum: { points: true }, _count: true });
  // Vorwoche nur bis zum gleichen Zeitpunkt vergleichen (fairer Trend)
  const elapsed = now.getTime() - cur.start.getTime();
  const [c, p] = await Promise.all([sum(cur.start, now), sum(prev.start, new Date(prev.start.getTime() + elapsed))]);
  const cp = c._sum.points ?? 0, pp = p._sum.points ?? 0;
  return { current: cp, previous: pp, currentCount: c._count, previousCount: p._count, trendPct: pp > 0 ? ((cp - pp) / pp) * 100 : null };
}

export async function goalProgress(goal: { metric: string; targetValue: number; periodStart: Date; periodEnd: Date; memberId: string | null }, now = new Date()): Promise<Forecast> {
  const agg = await prisma.chest.aggregate({
    where: { status: "GUELTIG", capturedAt: { gte: goal.periodStart, lt: goal.periodEnd }, ...(goal.memberId && { memberId: goal.memberId }) },
    _sum: { points: true },
    _count: true,
  });
  const current = (goal.metric as GoalMetric) === "TRUHEN" ? agg._count : agg._sum.points ?? 0;
  return forecast(current, goal.targetValue, goal.periodStart, goal.periodEnd, now);
}

/** Clan-Ziel der Woche (falls keins definiert: null). */
export async function clanWeekGoal(now = new Date()) {
  const goal = await prisma.goal.findFirst({
    where: { scope: "CLAN", periodStart: { lte: now }, periodEnd: { gt: now } },
    orderBy: { createdAt: "desc" },
  });
  return goal ? { goal, progress: await goalProgress(goal, now) } : null;
}

/**
 * Fortschritt aller aktiven Mitglieder gegenüber ihrem Wochenziel
 * (individuelles Ziel falls vorhanden, sonst Standardziel aus den Einstellungen).
 */
export async function memberWeekProgress(defaultTarget: number, now = new Date()) {
  const { start, end } = weekRange(now);
  const [members, goals, sums] = await Promise.all([
    prisma.member.findMany({ where: { status: { not: "AUSGETRETEN" } }, orderBy: { name: "asc" } }),
    prisma.goal.findMany({ where: { scope: "MITGLIED", periodStart: { lte: now }, periodEnd: { gt: now } } }),
    prisma.chest.groupBy({ by: ["memberId"], where: { status: "GUELTIG", capturedAt: { gte: start, lt: end } }, _sum: { points: true }, _count: true }),
  ]);
  const sumBy = new Map(sums.map((s) => [s.memberId, s]));
  return members.map((m) => {
    const g = goals.find((x) => x.memberId === m.id);
    const s = sumBy.get(m.id);
    const metric = (g?.metric ?? "PUNKTE") as GoalMetric;
    const current = metric === "TRUHEN" ? s?._count ?? 0 : s?._sum.points ?? 0;
    const target = g?.targetValue ?? defaultTarget;
    return {
      member: m,
      metric,
      individual: !!g,
      chests: s?._count ?? 0,
      points: s?._sum.points ?? 0,
      progress: forecast(current, target, g?.periodStart ?? start, g?.periodEnd ?? end, now),
    };
  });
}

/** Aktive Mitglieder ohne gültige Truhe seit X Tagen (pausierte werden ausgenommen). */
export async function inactiveMembers(days: number, now = new Date()) {
  const since = new Date(now.getTime() - days * DAY_MS);
  const members = await prisma.member.findMany({
    where: { status: "AKTIV" },
    include: { chests: { where: { status: "GUELTIG" }, orderBy: { capturedAt: "desc" }, take: 1, select: { capturedAt: true } } },
  });
  return members
    .map((m) => ({ id: m.id, name: m.name, last: m.chests[0]?.capturedAt ?? null }))
    .filter((m) => !m.last || m.last < since)
    .sort((a, b) => (a.last?.getTime() ?? 0) - (b.last?.getTime() ?? 0));
}
