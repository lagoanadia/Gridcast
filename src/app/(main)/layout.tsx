import Link from "next/link";
import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { Nav, type NavItem } from "@/components/Nav";
import { getData, isEphemeralStore } from "@/lib/data";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const { db } = getData();
  const unread = db.notifications.filter((n) => !n.read).length;
  const items: NavItem[] = [
    { href: "/", label: t("nav.today"), icon: "today" },
    { href: "/create", label: t("nav.create"), icon: "create" },
    { href: "/calendar", label: t("nav.calendar"), icon: "calendar" },
    { href: "/channels", label: t("nav.accounts"), icon: "accounts", also: ["/queue"] },
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <Logo />
          <div>
            <div className="brand-name">{APP.name}</div>
            <div className="brand-tag">{APP.tagline}</div>
          </div>
        </Link>
        <Nav items={items} unread={unread} />
        <div className="sidebar-foot">
          <div className="more">
            <Link href="/library">{t("nav.library")}</Link>
            <Link href="/queue">{t("nav.queue")}</Link>
            <Link href="/notifications">{t("nav.notifications")}{unread > 0 ? ` (${unread})` : ""}</Link>
          </div>
          {db.channels.map((c) => (
            <div key={c.id} className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: c.color }} />
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
