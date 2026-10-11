import Link from "next/link";
import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { getData, isEphemeralStore } from "@/lib/data";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { db } = getData();
  const unread = db.notifications.filter((n) => !n.read).length;
  const items = [
    { href: "/", label: t("nav.dashboard") },
    { href: "/library", label: t("nav.library") },
    { href: "/calendar", label: t("nav.calendar") },
    { href: "/queue", label: t("nav.queue") },
    { href: "/channels", label: t("nav.channels") },
    { href: "/notifications", label: t("nav.notifications") },
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="meander" aria-hidden="true" />
        <Link href="/" className="brand">
          <Logo />
          <div>
            <div className="brand-name">{APP.name}</div>
            <div className="brand-tag">{APP.tagline}</div>
          </div>
        </Link>
        <Nav items={items} unread={unread} />
        <div className="sidebar-foot">
          {db.channels.map((c) => (
            <div key={c.id} className="row" style={{ gap: 6, marginTop: 4 }}>
              <span className="dot" style={{ background: c.color, borderColor: "#eadcc0" }} />
              {c.name}
            </div>
          ))}
        </div>
      </aside>
      <main className="main">
        {isEphemeralStore() && <div className="flash error small" role="note">{t("deploy.ephemeral")}</div>}
        {children}
      </main>
    </div>
  );
}
