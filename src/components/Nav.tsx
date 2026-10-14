"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: "today" | "create" | "calendar" | "accounts"; also?: string[] };

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  today: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" /></>,
  create: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  accounts: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
};

export function Nav({ items, unread }: { items: NavItem[]; unread: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Principal">
      {items.map((it) => {
        const prefixes = [it.href, ...(it.also ?? [])];
        const active = it.href === "/" ? path === "/" : prefixes.some((p) => path.startsWith(p));
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{ICONS[it.icon]}</svg>
            <span className="nav-label">{it.label}</span>
            {it.href === "/" && unread > 0 && <span className="badge" aria-label={`${unread} avisos sin leer`}>{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
