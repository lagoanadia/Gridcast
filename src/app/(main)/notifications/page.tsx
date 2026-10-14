import { markAllReadAction } from "@/app/actions";
import { getData } from "@/lib/data";
import { DATE_LOCALE, t } from "@/lib/i18n";

export default function NotificationsPage() {
  const { db } = getData();
  const items = [...db.notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <>
      <div className="page-head">
        <h1>{t("notifications.title")}</h1>
        {items.some((n) => !n.read) && <form action={markAllReadAction}><button className="btn sm">{t("notifications.markRead")}</button></form>}
      </div>
      {items.length === 0 ? <div className="empty">{t("notifications.empty")}</div> : (
        <div className="list">
          {items.map((n) => {
            const c = db.channels.find((x) => x.id === n.channelId);
            return (
              <div key={n.id} className={`row ${n.read ? "" : "unread"}`}>
                <span className={`pill ${n.kind === "publish_failed" ? "failed" : n.kind === "low_queue" ? "on" : ""}`} style={{ minWidth: 92, justifyContent: "center" }}>{t(`notifications.kind.${n.kind}`)}</span>
                {c && <span className="dot" style={{ background: c.color }} />}
                <span style={{ flex: 1, minWidth: 200 }}>{n.message}</span>
                <span className="small data muted">{new Date(n.createdAt).toLocaleString(DATE_LOCALE)}</span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
