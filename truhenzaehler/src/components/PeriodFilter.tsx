import type { ChestType } from "@prisma/client";
import { SOURCES, SOURCE_LABEL } from "@/lib/domain";
import { weekRange, DAY_MS } from "@/lib/period";
import { fromInputUTC } from "@/lib/format";

export type SP = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Liest Zeitraum & Filter aus der URL (teilbar, Lesezeichen-fähig). */
export function parseFilter(sp: SP) {
  const now = new Date();
  const z = one(sp.zeitraum) || "woche";
  let { start, end } = weekRange(now);
  if (z === "vorwoche") ({ start, end } = weekRange(new Date(start.getTime() - DAY_MS)));
  if (z === "30tage") { end = new Date(now.getTime() + DAY_MS); start = new Date(end.getTime() - 30 * DAY_MS); }
  if (z === "frei" && one(sp.von) && one(sp.bis)) { start = fromInputUTC(one(sp.von) + "T00:00"); end = new Date(fromInputUTC(one(sp.bis) + "T00:00").getTime() + DAY_MS); }
  return {
    zeitraum: z,
    filter: {
      start, end,
      chestTypeId: one(sp.typ) || undefined,
      source: one(sp.quelle) || undefined,
      memberId: one(sp.mitglied) || undefined,
      eventOnly: one(sp.event) === "nur",
      excludeEvents: one(sp.event) === "ohne",
    },
  };
}

export function PeriodFilter({ sp, types, extra }: { sp: SP; types: ChestType[]; extra?: React.ReactNode }) {
  return (
    <form className="card mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7" method="get">
      <div><label className="label" htmlFor="zeitraum">Zeitraum</label>
        <select id="zeitraum" name="zeitraum" defaultValue={one(sp.zeitraum) || "woche"} className="input">
          <option value="woche">Diese Woche</option><option value="vorwoche">Vorwoche</option><option value="30tage">Letzte 30 Tage</option><option value="frei">Frei wählen</option>
        </select></div>
      <div><label className="label" htmlFor="von">Von</label><input id="von" type="date" name="von" defaultValue={one(sp.von)} className="input" /></div>
      <div><label className="label" htmlFor="bis">Bis</label><input id="bis" type="date" name="bis" defaultValue={one(sp.bis)} className="input" /></div>
      <div><label className="label" htmlFor="typ">Truhentyp</label>
        <select id="typ" name="typ" defaultValue={one(sp.typ)} className="input"><option value="">Alle</option>{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
      <div><label className="label" htmlFor="quelle">Quelle</label>
        <select id="quelle" name="quelle" defaultValue={one(sp.quelle)} className="input"><option value="">Alle</option>{SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></div>
      <div><label className="label" htmlFor="event">Events</label>
        <select id="event" name="event" defaultValue={one(sp.event)} className="input"><option value="">Mit Events</option><option value="ohne">Ohne Events</option><option value="nur">Nur Events</option></select></div>
      {extra}
      <div className="flex items-end"><button className="btn w-full">Anwenden</button></div>
    </form>
  );
}
