import type { Metadata } from "next";
import Link from "next/link";
import { APP } from "@/config";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { getData } from "@/lib/data";
import { t } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = { title: APP.name, description: APP.tagline };
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { db } = getData();
  const unread = db.notifications.filter((n) => !n.read).length;
  const items = [
    { href: "/", label: t("nav.dashboard"), icon: "◉" },
    { href: "/library", label: t("nav.library"), icon: "▦" },
    { href: "/calendar", label: t("nav.calendar"), icon: "▤" },
    { href: "/queue", label: t("nav.queue"), icon: "⇶" },
    { href: "/channels", label: t("nav.channels"), icon: "✦" },
    { href: "/notifications", label: t("nav.notifications"), icon: "◬" },
  ];
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:opsz,wght@9..40,400;9..40,600;9..40,700&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <Logo />
              <div>
                <div className="brand-name">{APP.name}</div>
                <div className="brand-tag">{APP.tagline}</div>
              </div>
            </Link>
            <div className="pattern-band" />
            <Nav items={items} unread={unread} />
            <div className="sidebar-foot">
              {db.channels.map((c) => (
                <div key={c.id} className="row" style={{ gap: 6, marginTop: 4 }}>
                  <span className="dot" style={{ background: c.color, borderColor: "#f5ecdc" }} />
                  {c.name}
                </div>
              ))}
            </div>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
