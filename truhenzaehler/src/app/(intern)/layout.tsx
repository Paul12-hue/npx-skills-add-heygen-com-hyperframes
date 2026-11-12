import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { currentUser } from "@/lib/auth";
import { getSettings } from "@/lib/db";

const RANK: Record<string, number> = { MITGLIED: 1, OFFIZIER: 2, ADMIN: 3 };

export default async function InternLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  const settings = await getSettings();
  return (
    <div className="min-h-screen md:pl-56">
      <Nav rank={RANK[user.role] ?? 1} user={user.username} clan={settings.clanName} />
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 md:px-8 md:pb-10">{children}</main>
    </div>
  );
}
