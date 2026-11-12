// Zeiträume – Wochen beginnen Montag 00:00 UTC (Total-Battle-Serverzeit).
const DAY = 86_400_000;

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function weekRange(d: Date = new Date()): { start: Date; end: Date } {
  const day = startOfDayUTC(d);
  const dow = (day.getUTCDay() + 6) % 7; // Mo=0 … So=6
  const start = new Date(day.getTime() - dow * DAY);
  return { start, end: new Date(start.getTime() + 7 * DAY) };
}

export function isoWeek(d: Date): { year: number; week: number } {
  const t = startOfDayUTC(d);
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const year = t.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((t.getTime() - jan4.getTime()) / DAY - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year, week };
}

export const weekLabel = (d: Date) => {
  const { year, week } = isoWeek(d);
  return `KW ${week}/${year}`;
};

export function daysBetween(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let t = startOfDayUTC(start).getTime(); t < end.getTime(); t += DAY) out.push(new Date(t));
  return out;
}

export const DAY_MS = DAY;
