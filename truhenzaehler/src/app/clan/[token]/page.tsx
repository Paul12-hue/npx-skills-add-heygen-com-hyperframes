import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/db";
import { verifySession } from "@/lib/session";
import { DashboardView } from "@/components/DashboardView";
import { ActionForm } from "@/components/ActionForm";
import { publicUnlockAction } from "@/app/actions";
import { weekRange, weekLabel } from "@/lib/period";

export const dynamic = "force-dynamic";

/** Öffentlicher bzw. passwortgeschützter Nur-Lese-Link für den Clan. */
export default async function PublicClanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await getSettings();
  if (!s.publicEnabled || s.publicToken !== token) notFound();
  if (s.publicPasswordHash) {
    const c = (await cookies()).get(`tz_pub_${token.slice(0, 8)}`)?.value;
    const sess = await verifySession(c);
    if (!sess || sess.role !== "PUBLIC" || sess.name !== token) {
      return (
        <main className="flex min-h-screen items-center justify-center p-4">
          <div className="card w-full max-w-sm">
            <h1 className="mb-3 text-lg font-bold">{s.clanName} – Clan-Truhen</h1>
            <ActionForm action={publicUnlockAction.bind(null, token)} submitLabel="Öffnen">
              <label className="label" htmlFor="pw">Clan-Passwort</label>
              <input id="pw" name="password" type="password" required className="input" />
            </ActionForm>
          </div>
        </main>
      );
    }
  }
  const { start, end } = weekRange();
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <h1 className="text-xl font-bold sm:text-2xl">{s.clanName} – Clan-Truhen</h1>
      <p className="mb-4 text-sm text-slate-500">{weekLabel(start)} · Nur-Lese-Ansicht</p>
      <DashboardView filter={{ start, end }} linkable={false} />
    </main>
  );
}
