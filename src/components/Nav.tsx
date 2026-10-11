"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ items, unread }: { items: { href: string; label: string }[]; unread: number }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {items.map((it, i) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <span className="idx" aria-hidden="true">{String(i + 1).padStart(2, "0")}</span>
            {it.label}
            {it.href === "/notifications" && unread > 0 && <span className="badge">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
