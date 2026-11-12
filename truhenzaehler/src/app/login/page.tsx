import { ActionForm } from "@/components/ActionForm";
import { loginAction } from "../actions";
import { getSettings } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const s = await getSettings();
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-sm">
        <div className="mb-4 text-center">
          <div className="text-xs uppercase tracking-widest text-gold-600">Truhenzähler</div>
          <h1 className="text-xl font-bold">{s.clanName}</h1>
        </div>
        <ActionForm action={loginAction} submitLabel="Anmelden" className="space-y-3">
          <div><label className="label" htmlFor="username">Benutzername</label><input id="username" name="username" autoComplete="username" required className="input" /></div>
          <div><label className="label" htmlFor="password">Passwort</label><input id="password" name="password" type="password" autoComplete="current-password" required className="input" /></div>
        </ActionForm>
        <p className="mt-4 text-xs text-slate-500">Zugang erhältst du von deiner Clan-Leitung. Es werden nur Ingame-Namen und Truhendaten gespeichert.</p>
      </div>
    </main>
  );
}
