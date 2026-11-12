import type { ReactNode } from "react";
import { FORECAST_LABEL, type ForecastStatus } from "@/lib/forecast";
import { fmtPct } from "@/lib/format";

export function Card({ title, children, className = "", action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="card-title !mb-0">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint, trend }: { label: string; value: ReactNode; hint?: ReactNode; trend?: number | null }) {
  return (
    <div className="card">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
      <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
        {trend != null && (
          <span className={trend >= 0 ? "font-semibold text-emerald-600" : "font-semibold text-red-600"}>
            {trend >= 0 ? "▲" : "▼"} {fmtPct(Math.abs(trend))}
          </span>
        )}
        {hint}
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<ForecastStatus, string> = {
  ERREICHT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
  AUF_KURS: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
  KNAPP: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300",
  GEFAEHRDET: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
  NICHT_GESTARTET: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};
const BAR_STYLE: Record<ForecastStatus, string> = {
  ERREICHT: "bg-emerald-500", AUF_KURS: "bg-sky-500", KNAPP: "bg-amber-500", GEFAEHRDET: "bg-red-500", NICHT_GESTARTET: "bg-slate-400",
};

export function StatusBadge({ status }: { status: ForecastStatus }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[status]}`}>{FORECAST_LABEL[status]}</span>;
}

/** Fortschrittsbalken mit Prognose-Markierung (heller Bereich = Hochrechnung). */
export function Progress({ percent, projectedPercent, status }: { percent: number; projectedPercent?: number; status: ForecastStatus }) {
  const p = Math.min(percent, 100);
  const pr = Math.min(projectedPercent ?? 0, 100);
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(percent)} aria-valuemin={0} aria-valuemax={100}>
      {pr > p && <div className={`absolute inset-y-0 left-0 opacity-25 ${BAR_STYLE[status]}`} style={{ width: `${pr}%` }} />}
      <div className={`absolute inset-y-0 left-0 ${BAR_STYLE[status]}`} style={{ width: `${p}%` }} />
    </div>
  );
}

export function Pill({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "gold" | "red" | "green" | "violet" }) {
  const t = {
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    gold: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
    red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    violet: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  }[tone];
  return <span className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-500">{children}</p>;
}
