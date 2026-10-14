import Link from "next/link";
import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { Nav, type NavItem } from "@/components/Nav";
import { authConfig } from "@/lib/auth";
import { currentUser } from "@/lib/current-user";
import { getData, isEphemeralStore } from "@/lib/data";
import { t } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { db } = await getData();
  const user = await currentUser();
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
          {user && (
            <div className="user-chip">
              {user.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.picture} alt="" referrerPolicy="no-referrer" />
                : <span className="avatar" aria-hidden="true">{user.name.slice(0, 1).toUpperCase()}</span>}
              <div className="who">
                <strong title={user.email}>{user.name}</strong>
                <form action="/api/auth/logout" method="post"><button>{t("auth.signOut")}</button></form>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main className="main">
        {process.env.VERCEL && !authConfig() && <div className="flash error small" role="note">{t("auth.openAccess")}</div>}
        {isEphemeralStore() && <div className="flash error small" role="note">{t("deploy.ephemeral")}</div>}
        {children}
      </main>
    </div>
  );
}
