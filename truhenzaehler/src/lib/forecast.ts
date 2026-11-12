export type ForecastStatus = "ERREICHT" | "AUF_KURS" | "KNAPP" | "GEFAEHRDET" | "NICHT_GESTARTET";

export const FORECAST_LABEL: Record<ForecastStatus, string> = {
  ERREICHT: "Erreicht",
  AUF_KURS: "Auf Kurs",
  KNAPP: "Knapp",
  GEFAEHRDET: "Gefährdet",
  NICHT_GESTARTET: "Noch nicht gestartet",
};

export interface Forecast {
  current: number;
  target: number;
  percent: number;      // aktueller Fortschritt in %
  projected: number;    // Hochrechnung zum Periodenende (lineares Tempo)
  projectedPercent: number;
  neededPerDay: number; // nötiges Tempo für den Rest der Periode
  status: ForecastStatus;
}

/**
 * Lineare Prognose: aktuelles Tempo (Wert / verstrichene Zeit) wird bis zum Ende
 * fortgeschrieben. "Knapp" = Hochrechnung erreicht ≥ 85 % des Ziels.
 */
export function forecast(current: number, target: number, start: Date, end: Date, now = new Date()): Forecast {
  const total = end.getTime() - start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total);
  const remainingDays = Math.max((total - elapsed) / 86_400_000, 0);
  const frac = total > 0 ? elapsed / total : 1;
  const projected = frac > 0 ? Math.round(current / frac) : 0;
  const pct = (v: number) => (target > 0 ? Math.round((v / target) * 1000) / 10 : 100);

  let status: ForecastStatus;
  if (current >= target) status = "ERREICHT";
  else if (elapsed <= 0) status = "NICHT_GESTARTET";
  else if (projected >= target) status = "AUF_KURS";
  else if (projected >= target * 0.85) status = "KNAPP";
  else status = "GEFAEHRDET";

  return {
    current,
    target,
    percent: pct(current),
    projected,
    projectedPercent: pct(projected),
    neededPerDay: remainingDays > 0 ? Math.ceil(Math.max(target - current, 0) / remainingDays) : 0,
    status,
  };
}
