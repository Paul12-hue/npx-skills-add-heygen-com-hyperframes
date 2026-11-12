"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Dashboard", icon: "▦", min: 1 },
  { href: "/truhen", label: "Truhen", icon: "◈", min: 1 },
  { href: "/mitglieder", label: "Mitglieder", icon: "☰", min: 1 },
  { href: "/ziele", label: "Ziele", icon: "◎", min: 1 },
  { href: "/berichte", label: "Berichte", icon: "⇩", min: 2 },
  { href: "/admin", label: "Admin", icon: "⚙", min: 2 },
];

export function Nav({ rank, user, clan }: { rank: number; user: string; clan: string }) {
  const path = usePathname();
  const items = ITEMS.filter((i) => rank >= i.min);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:flex">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-gold-600">Truhenzähler</div>
          <div className="truncate text-lg font-bold">{clan}</div>
        </div>
        <nav className="flex flex-1 flex-col gap-1">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={`rounded-lg px-3 py-2 text-sm font-medium ${active(i.href) ? "bg-gold-500/15 text-gold-600 dark:text-gold-400" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
              <span className="mr-2 inline-block w-4 text-center">{i.icon}</span>{i.label}
            </Link>
          ))}
        </nav>
        <div className="border-t border-slate-200 pt-3 text-sm dark:border-slate-800">
          <div className="truncate font-medium">{user}</div>
          <form action="/api/logout" method="post"><button className="text-xs text-slate-500 hover:underline">Abmelden</button></form>
        </div>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 md:hidden" aria-label="Hauptnavigation">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={`flex flex-1 flex-col items-center py-2 text-[11px] ${active(i.href) ? "text-gold-600 dark:text-gold-400" : "text-slate-500"}`}>
            <span className="text-base leading-none">{i.icon}</span>{i.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
