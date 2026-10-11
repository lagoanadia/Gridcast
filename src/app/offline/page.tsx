import { t } from "@/lib/i18n";

export const dynamic = "force-static";

export default function Offline() {
  return (
    <div className="empty" style={{ maxWidth: 480, margin: "12vh auto 0", background: "var(--card)" }}>
      <h1 style={{ color: "var(--ink)", marginBottom: 10 }}>{t("pwa.offlineTitle")}</h1>
      <p>{t("pwa.offlineBody")}</p>
      {/* Plain <a> so the browser does a real navigation and the service worker retries the network. */}
      <a className="btn" href="/">{t("pwa.retry")}</a>
    </div>
  );
}
