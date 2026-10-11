"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ items, unread }: { items: { href: string; label: string; icon: string }[]; unread: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span aria-hidden="true">{it.icon}</span>
            {it.label}
            {it.href === "/notifications" && unread > 0 && <span className="badge">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
