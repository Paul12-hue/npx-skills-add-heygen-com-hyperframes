const tz = "UTC";
export const fmtDateTime = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: tz }).format(d);
export const fmtDate = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: tz }).format(d);
export const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: tz }).format(d);
export const fmtNum = (n: number) => new Intl.NumberFormat("de-DE").format(n);
export const fmtPct = (n: number) => `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(n)} %`;

/** Datum für <input type="datetime-local"> in UTC */
export const toInputUTC = (d: Date) => d.toISOString().slice(0, 16);
export const fromInputUTC = (s: string) => new Date(s.length === 16 ? `${s}:00Z` : s);
