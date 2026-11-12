import type { AuditLog, User } from "@prisma/client";
import { fmtDateTime } from "@/lib/format";
import { Empty } from "./ui";

const fmt = (v: unknown) => (v == null ? "–" : typeof v === "object" ? JSON.stringify(v) : String(v));

export function AuditList({ logs }: { logs: (AuditLog & { user: User | null })[] }) {
  if (!logs.length) return <Empty>Keine Einträge.</Empty>;
  return (
    <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
      {logs.map((l) => {
        const o = l.oldValues ? (JSON.parse(l.oldValues) as Record<string, unknown>) : {};
        const n = l.newValues ? (JSON.parse(l.newValues) as Record<string, unknown>) : {};
        const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
        return (
          <li key={l.id} className="py-2">
            <div className="flex flex-wrap justify-between gap-2">
              <span><strong>{l.action.replaceAll("_", " ").toLowerCase()}</strong> · {l.user?.username ?? "System"} {l.entity !== "Chest" && <span className="text-slate-500">({l.entity})</span>}</span>
              <span className="text-xs text-slate-500">{fmtDateTime(l.createdAt)}</span>
            </div>
            {l.reason && <div className="text-xs italic text-slate-500">Grund: {l.reason}</div>}
            {keys.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs">
                {keys.map((k) => (
                  <span key={k}>{k}: {k in o && <span className="text-red-600 line-through">{fmt(o[k])}</span>} {k in n && <span className="text-emerald-600">{fmt(n[k])}</span>}</span>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
