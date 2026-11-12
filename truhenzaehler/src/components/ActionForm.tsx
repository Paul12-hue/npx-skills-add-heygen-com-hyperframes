"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Speichere …" : label}</button>;
}

/** Formular mit Server-Action und deutscher Rückmeldung. */
export function ActionForm({
  action, children, submitLabel = "Speichern", className = "", resetOnSuccess = false,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submitLabel?: string;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} key={resetOnSuccess && state?.ok ? state.ok + Date.now() : undefined}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Submit label={submitLabel} />
        {state?.ok && <span role="status" className="text-sm text-emerald-600">{state.ok}</span>}
        {state?.error && <span role="alert" className="text-sm text-red-600">{state.error}</span>}
      </div>
      {state?.details && state.details.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-auto rounded bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">
          {state.details.map((d) => <li key={d}>{d}</li>)}
        </ul>
      )}
    </form>
  );
}
