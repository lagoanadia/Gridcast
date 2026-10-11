import Link from "next/link";
import { approveAction, approveAllAction, fillQueueAction, runDueAction, unscheduleAction } from "./actions";
import { Flash } from "@/components/Flash";
import { fmtDateTime, PlatformPill } from "@/components/Pills";
import { getData, isDryRun } from "@/lib/data";
import { t } from "@/lib/i18n";
import { hasErrors, validatePost } from "@/lib/platforms";
import { queueDaysLeft } from "@/lib/scheduler";

type SP = Promise<{ msg?: string; err?: string }>;

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { db } = getData();
  const now = new Date();
  const pending = db.posts
    .filter((p) => p.status === "proposed")
    .sort((a, b) => (a.scheduledAt ?? "").localeCompare(b.scheduledAt ?? ""));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t("dashboard.title")}</h1>
          {isDryRun() && <div className="dry-banner" style={{ marginTop: 10 }}>● {t("common.dryRunBanner")}</div>}
        </div>
        <div className="row">
          <form action={fillQueueAction}><button className="btn primary">{t("dashboard.fillQueue")}</button></form>
          <form action={runDueAction}><button className="btn ink">{t("dashboard.runDue")}</button></form>
        </div>
      </div>
      <Flash sp={sp} />

      <div className="grid grid-2">
        {db.channels.map((c) => {
          const days = queueDaysLeft(c, db.queueRules, db.videos, db.posts, now);
          const low = days !== null && days < c.lowQueueThresholdDays;
          const next = db.posts
            .filter((p) => p.channelId === c.id && (p.status === "scheduled" || p.status === "proposed") && p.scheduledAt && new Date(p.scheduledAt) > now)
            .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!))[0];
          const ready = db.videos.filter((v) => v.channelId === c.id && v.status === "ready").length;
          const queued = new Set(db.posts.filter((p) => p.channelId === c.id && (p.status === "scheduled" || p.status === "proposed")).map((p) => p.videoId)).size;
          return (
            <section key={c.id} className="card channel-card">
              <div className="stripe" style={{ background: c.color }} />
              <div className="spread" style={{ marginTop: 8 }}>
                <h2>{c.name}</h2>
                {c.autopilot && <span className="pill scheduled">{t("dashboard.autopilotOn")}</span>}
              </div>
              <div className="row" style={{ alignItems: "flex-end", margin: "14px 0 10px" }}>
                <div className="big-number" style={{ color: low ? "var(--terracotta)" : "var(--ink)" }}>{days ?? "–"}</div>
                <div className="muted" style={{ paddingBottom: 6 }}>{days === null ? t("dashboard.noRules") : t("dashboard.daysLeft")}</div>
              </div>
              {low && <div className="alert-line">{t("dashboard.lowQueue", { n: c.lowQueueThresholdDays })}</div>}
              <div className="row small" style={{ marginTop: 12 }}>
                <span className="pill ready">{ready} {t("dashboard.ready")}</span>
                <span className="pill scheduled">{queued} {t("dashboard.queued")}</span>
              </div>
              <p className="small" style={{ marginBottom: 0 }}>
                <strong>{t("dashboard.nextPost")}: </strong>
                {next ? <>{fmtDateTime(next.scheduledAt, c.timezone)} — {next.title}</> : <span className="muted">{t("dashboard.nothingNext")}</span>}
              </p>
            </section>
          );
        })}
      </div>

      <section className="section">
        <div className="spread" style={{ marginBottom: 14 }}>
          <h2>{t("dashboard.pending")} {pending.length > 0 && <span className="muted">({pending.length})</span>}</h2>
          {pending.length > 0 && <form action={approveAllAction}><button className="btn ochre">{t("dashboard.approveAll")}</button></form>}
        </div>
        {pending.length === 0 ? (
          <div className="empty">{t("dashboard.noPending")}</div>
        ) : (
          <div className="list">
            {pending.map((p) => {
              const video = db.videos.find((v) => v.id === p.videoId)!;
              const channel = db.channels.find((c) => c.id === p.channelId)!;
              const invalid = hasErrors(validatePost(p, video));
              return (
                <div key={p.id} className="spread">
                  <div className="row">
                    <span className="dot" style={{ background: channel.color }} />
                    <PlatformPill p={p.platform} />
                    <Link href={`/videos/${video.id}`} style={{ fontWeight: 700 }}>{p.title}</Link>
                    <span className="muted small">{fmtDateTime(p.scheduledAt, channel.timezone)}</span>
                    {invalid && <span className="pill failed">needs fixes</span>}
                  </div>
                  <div className="row">
                    <form action={approveAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button className="btn sm primary" disabled={invalid}>{t("common.approve")}</button>
                    </form>
                    <form action={unscheduleAction}>
                      <input type="hidden" name="postId" value={p.id} />
                      <button className="btn sm ghost">{t("common.unschedule")}</button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
